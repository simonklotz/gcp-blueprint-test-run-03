import { setGlobalOptions } from 'firebase-functions';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import * as admin from 'firebase-admin';

setGlobalOptions({ maxInstances: 10, region: 'europe-central2' });

admin.initializeApp();

const db = admin.firestore();

type TaskStatus = 'open' | 'in-progress' | 'done';

interface TaskDoc {
  title: string;
  description: string;
  status: TaskStatus;
  priority: string;
  assigneeId: string | null;
  tags: string[];
  dueDate: FirebaseFirestore.Timestamp | null;
  createdBy: string;
  createdAt?: FirebaseFirestore.Timestamp;
  updatedAt?: FirebaseFirestore.Timestamp;
}

interface AddMemberInput {
  projectId: string;
  email: string;
}

interface AddMemberResult {
  uid: string;
}

/**
 * Callable: add a user (by email) as a member of a project.
 */
export const addMember = onCall<AddMemberInput, Promise<AddMemberResult>>(
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Sign-in required.');
    }
    const callerUid = request.auth.uid;
    const { projectId, email } = request.data ?? ({} as AddMemberInput);
    if (!projectId || !email) {
      throw new HttpsError('invalid-argument', 'projectId and email are required.');
    }

    const projectRef = db.doc(`projects/${projectId}`);
    const projectSnap = await projectRef.get();
    if (!projectSnap.exists) {
      throw new HttpsError('not-found', 'Project not found.');
    }
    const project = projectSnap.data() as {
      ownerId: string;
      memberIds: string[];
      title: string;
    };

    // Authorize: caller must be project owner or an admin.
    let authorized = project.ownerId === callerUid;
    if (!authorized) {
      const callerSnap = await db.doc(`users/${callerUid}`).get();
      authorized = callerSnap.get('role') === 'admin';
    }
    if (!authorized) {
      throw new HttpsError(
        'permission-denied',
        'Only the project owner or an admin can add members.',
      );
    }

    // Look up target user by email.
    const userQuery = await db
      .collection('users')
      .where('email', '==', email)
      .limit(1)
      .get();
    if (userQuery.empty) {
      throw new HttpsError(
        'not-found',
        `No user with email ${email}. Ask them to sign up first.`,
      );
    }
    const target = userQuery.docs[0];
    const targetUid = target.id;

    if ((project.memberIds ?? []).includes(targetUid)) {
      throw new HttpsError(
        'already-exists',
        'This user is already a member of the project.',
      );
    }

    const batch = db.batch();
    batch.update(projectRef, {
      memberIds: admin.firestore.FieldValue.arrayUnion(targetUid),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    const logRef = projectRef.collection('activityLog').doc();
    batch.set(logRef, {
      action: 'member_added',
      performedBy: callerUid,
      targetTaskId: null,
      details: `Added ${email} to ${project.title}.`,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
    });
    await batch.commit();

    return { uid: targetUid };
  },
);

/**
 * Firestore trigger: on task create/update/delete, keep denormalized
 * taskCounts on the parent project up to date and write an activity log entry.
 */
export const onTaskStatusChange = onDocumentWritten(
  'projects/{projectId}/tasks/{taskId}',
  async (event) => {
    const { projectId, taskId } = event.params;
    const before = event.data?.before?.exists
      ? (event.data.before.data() as TaskDoc)
      : null;
    const after = event.data?.after?.exists
      ? (event.data.after.data() as TaskDoc)
      : null;

    const projectRef = db.doc(`projects/${projectId}`);
    const logRef = projectRef.collection('activityLog').doc();

    const incField = (status: TaskStatus, delta: 1 | -1): Record<string, unknown> => ({
      [`taskCounts.${countKey(status)}`]: admin.firestore.FieldValue.increment(delta),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    try {
      if (!before && after) {
        // Create
        await projectRef.update(incField(after.status, 1));
        await logRef.set({
          action: 'task_created',
          performedBy: after.createdBy,
          targetTaskId: taskId,
          details: `Task "${after.title}" created.`,
          timestamp: admin.firestore.FieldValue.serverTimestamp(),
        });
        return;
      }

      if (before && !after) {
        // Delete
        await projectRef.update(incField(before.status, -1));
        await logRef.set({
          action: 'task_deleted',
          performedBy: before.createdBy,
          targetTaskId: taskId,
          details: `Task "${before.title}" deleted.`,
          timestamp: admin.firestore.FieldValue.serverTimestamp(),
        });
        return;
      }

      if (before && after) {
        if (before.status !== after.status) {
          // Status changed: decrement old, increment new.
          await projectRef.update({
            [`taskCounts.${countKey(before.status)}`]:
              admin.firestore.FieldValue.increment(-1),
            [`taskCounts.${countKey(after.status)}`]:
              admin.firestore.FieldValue.increment(1),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          });
          await logRef.set({
            action: 'task_status_changed',
            performedBy: after.createdBy,
            targetTaskId: taskId,
            details: `Task "${after.title}" moved from ${before.status} to ${after.status}.`,
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
          });
          return;
        }

        // Other update: record a generic "updated" entry.
        await logRef.set({
          action: 'task_updated',
          performedBy: after.createdBy,
          targetTaskId: taskId,
          details: `Task "${after.title}" updated.`,
          timestamp: admin.firestore.FieldValue.serverTimestamp(),
        });
      }
    } catch (err) {
      console.error('onTaskStatusChange failed', err);
    }
  },
);

function countKey(status: TaskStatus): 'open' | 'inProgress' | 'done' {
  switch (status) {
    case 'open':
      return 'open';
    case 'in-progress':
      return 'inProgress';
    case 'done':
      return 'done';
  }
}
