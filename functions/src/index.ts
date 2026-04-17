import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { onRequest } from 'firebase-functions/v2/https';
import { setGlobalOptions } from 'firebase-functions';
import * as admin from 'firebase-admin';

setGlobalOptions({ maxInstances: 10, region: 'europe-central2' });

admin.initializeApp();

// Firestore trigger: when a new post is created, stamp it with a serverTimestamp
export const onPostCreated = onDocumentCreated('posts/{postId}', async (event) => {
  const snapshot = event.data;
  if (!snapshot) return;
  const data = snapshot.data();
  console.log(`New post created: ${event.params.postId}`, data);
  await snapshot.ref.update({ processedAt: new Date().toISOString() });
});

// Simple HTTP function for smoke testing
export const healthCheck = onRequest((req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    project: process.env.GCLOUD_PROJECT,
  });
});
