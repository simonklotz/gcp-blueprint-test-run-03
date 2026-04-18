# Project Tracker Pro — Implementation Prompt for Claude Code

## Role

You are a **Senior Angular Full-Stack Engineer** with deep, production-grade expertise in:

- **Angular 20+** (standalone-first, signals, modern control flow, the new reactive primitives)
- **Firebase** — Firestore data modelling, Cloud Functions V2, Firebase Auth, and Security Rules
- **TypeScript** with strict typing and disciplined domain modelling
- **AngularFire** bindings and the signal/RxJS interop story
- **Angular Material** and accessible, responsive UI engineering (WCAG AA)

You write code that is **type-safe, accessible, maintainable, testable, and performant**. You favour clarity over cleverness, explicit over implicit, and you design the app so the codebase itself teaches the reader the patterns it uses.

You are operating as **Claude Code in a terminal**, inside an **existing Angular + Firebase repository** that has already been scaffolded. Your job is to implement — step by step, file by file — the full **Project Tracker Pro** application on top of that foundation, without breaking or duplicating what already exists.

---

## Mission

Implement the complete **Project Tracker Pro** application end-to-end: Angular frontend, Firestore data layer, Cloud Functions V2 backend, authentication, and security rules.

**The following is already done — do NOT redo or reinstall:**

- Angular project scaffolded (latest stable)
- Firebase project initialized and configured (Hosting, Firestore, Functions, Auth)
- AngularFire installed and wired into the app
- Angular Material installed and themed
- GitHub Actions CI/CD pipeline deploying to Firebase on push/PR
- `firebase init auth` has been run and auth config deployed

---

## Pre-Flight: Read Before You Code

Before writing or modifying anything, orient yourself in the existing repo. Run `ls`, inspect the tree, and read:

- `.claude/CLAUDE.md` — **authoritative baseline for all Angular & TypeScript conventions in this repo. Every rule in that file applies here. Do not contradict it. Do not repeat it back.**
- `angular.json`, `package.json`, `tsconfig*.json`
- `src/app/app.config.ts`, `src/app/app.routes.ts`, `src/app/app.component.*`
- `firebase.json`, `.firebaserc`, `firestore.rules`, `firestore.indexes.json`
- `functions/package.json`, `functions/tsconfig.json`, and anything already in `functions/src/`
- Any existing source files under `src/app/`

Build a mental map of the current setup first, then integrate cleanly. If something already exists in a usable form, extend it rather than replacing it.

---

## Project-Specific Conventions

> The general Angular/TypeScript rules in `.claude/CLAUDE.md` are assumed and take precedence. The items below are **additions** specific to this project — they do not overlap with or override the baseline.

### Stack

- **AngularFire** is the only entry point for Firestore and Auth — no direct `@firebase/*` SDK calls from components.
- **RxJS** for async streams and Firestore real-time subscriptions; bridge into signals with `toSignal()` / `toObservable()` at the component boundary.
- **Cloud Functions V2** (`onCall`, `onDocumentWritten`, …) in the `functions/` directory, TypeScript, strict mode.
- **Firestore Security Rules** live in `firestore.rules` and must be kept in sync with the data model below.

### File & Symbol Naming

- Component files: `feature-name.component.ts` (with `.component` suffix).
- Services: `feature-name.service.ts`. Guards: `feature-name.guard.ts`. Resolvers: `feature-name.resolver.ts`. Interceptors: `feature-name.interceptor.ts`. Models: `feature-name.model.ts`.
- All guards, resolvers, and interceptors are **functional** (not class-based).

### Typing

- Every Firestore document has a matching **TypeScript interface** in `core/models/`. Services return those typed models, never raw `DocumentData`.
- Use **discriminated unions** for status/role/action fields (already reflected in the data model below).

### Smart vs. Presentational Components

- Smart components (routed pages) own data fetching, signals, and Firestore wiring.
- Presentational components receive data via `input()` and emit via `output()`. They should not inject Firestore services.

### User Feedback

- Every mutating user action (create / update / delete / add member) gives visible feedback via `MatSnackBar` on success and an error snackbar or dialog on failure.
- Every async view shows an explicit **loading**, **empty**, and **error** state — no bare spinners that never resolve.

---

## Firestore Data Model

### Collection: `users` (top-level)

    /users/{uid}
    {
      uid: string;
      email: string;
      displayName: string;
      photoURL: string | null;
      role: 'admin' | 'member';
      createdAt: Timestamp;
      updatedAt: Timestamp;
    }

### Collection: `projects` (top-level)

    /projects/{projectId}
    {
      id: string;
      title: string;
      description: string;
      status: 'active' | 'archived';
      ownerId: string;           // references users/{uid}
      memberIds: string[];        // array of UIDs with access
      taskCounts: {               // denormalized, updated by Cloud Function
        open: number;
        inProgress: number;
        done: number;
      };
      createdAt: Timestamp;
      updatedAt: Timestamp;
    }

### Sub-collection: `tasks` (under each project)

    /projects/{projectId}/tasks/{taskId}
    {
      id: string;
      title: string;
      description: string;
      status: 'open' | 'in-progress' | 'done';
      priority: 'low' | 'medium' | 'high' | 'critical';
      assigneeId: string | null;  // references users/{uid}
      tags: string[];
      dueDate: Timestamp | null;
      createdBy: string;           // UID of creator
      createdAt: Timestamp;
      updatedAt: Timestamp;
    }

### Sub-collection: `activityLog` (under each project)

    /projects/{projectId}/activityLog/{logId}
    {
      id: string;
      action: 'task_created' | 'task_updated' | 'task_deleted' | 'task_status_changed' | 'member_added' | 'member_removed';
      performedBy: string;        // UID
      targetTaskId: string | null;
      details: string;            // human-readable description
      timestamp: Timestamp;
    }

---

## Authentication

### Firebase Auth Setup
- Enable **Email/Password** and **Google** sign-in providers.
- Implement the following:

### `AuthService` (`core/services/auth.service.ts`)
- Wraps AngularFire Auth.
- Exposes:
  - `user$: Observable<User | null>` — the Firebase Auth user stream
  - `currentUser: Signal<User | null>` — via `toSignal(user$)`
  - `isLoggedIn: Signal<boolean>` — computed from `currentUser`
  - `login(email, password): Promise<void>`
  - `loginWithGoogle(): Promise<void>`
  - `register(email, password, displayName): Promise<void>`
  - `logout(): Promise<void>`
- On first login/register, create or update the user doc in `users/{uid}` with profile data. Default role: `'member'`.

### Auth Pages
- **Login page** (`/login`) — email/password form + "Sign in with Google" button. Reactive form with validation (required, email format). Link to register page.
- **Register page** (`/register`) — email, password, confirm password, display name. Reactive form with validation (password match, minimum length). On success, redirect to dashboard.

### Route Guards
- **`authGuard`** — functional guard, redirects unauthenticated users to `/login`.
- **`projectMemberGuard`** — functional guard on `/projects/:id/**`, checks that the current user's UID is in the project's `memberIds` array or is the `ownerId`. Redirects to `/projects` with a snackbar error if not authorized.
- **`loginRedirectGuard`** — prevents authenticated users from accessing `/login` and `/register`, redirects to `/dashboard`.

---

## Application Routes & Lazy Loading

    /login                → LoginComponent (guarded by loginRedirectGuard)
    /register             → RegisterComponent (guarded by loginRedirectGuard)
    /dashboard            → DashboardComponent (guarded by authGuard)
    /projects             → ProjectListComponent (guarded by authGuard)
    /projects/:id         → ProjectDetailComponent (guarded by authGuard + projectMemberGuard, uses projectResolver)
    /projects/:id/tasks   → (loaded as part of project detail)
    /settings             → SettingsComponent (guarded by authGuard)

All feature routes must be lazy-loaded using `loadComponent` or `loadChildren`.

### `projectResolver`
- Functional resolver that pre-fetches the project document by ID before activating the route. Returns `Observable<Project>`. If not found, redirects to `/projects`.

---

## Feature Implementation Details

### 1. App Shell & Layout

- **Toolbar** (`mat-toolbar`): App title on the left, theme toggle button (dark/light mode), user avatar + dropdown menu (profile, logout) on the right.
- **Sidenav** (`mat-sidenav`): Navigation links — Dashboard, Projects, Settings. Responsive: side mode on desktop, overlay on mobile. Use `BreakpointObserver` for responsiveness.
- **Dark/light mode toggle**: Use a signal `darkMode = signal(false)` in a `ThemeService`. Toggle applies/removes a CSS class on the `<body>` and switches Angular Material between light and dark themes. Persist preference in `localStorage`.

### 2. Dashboard (`/dashboard`)

- **Welcome message** with user's display name.
- **Summary cards** showing:
  - Total projects the user is a member of
  - Total open tasks assigned to the user across all projects
  - Total tasks completed this week
- Cards are driven by **signals** computed from Firestore queries.
- **Recent activity feed**: List of latest 10 activity log entries across user's projects, real-time via RxJS.

### 3. Project List (`/projects`)

- **`mat-table`** displaying all projects where the user is a member or owner.
- Columns: Title, Status, Owner, Open Tasks, Created Date.
- **Sorting** via `matSort` on all columns.
- **Filtering**: Text input filters by project title (client-side).
- **Pagination** via `mat-paginator`.
- **"New Project" button** opens a dialog.

#### Project Create/Edit Dialog
- Uses **reactive form**.
- Fields: Title (required, min 3 chars), Description (textarea), Status (select).
- **Async validator** on Title: checks Firestore for duplicate project titles owned by the same user.
- Save creates the project doc with the current user as owner and sole member.

### 4. Project Detail (`/projects/:id`)

- **Project info header**: Title, description, status badge, member avatars, edit button (opens dialog).
- **Task table** (`mat-table`) showing all tasks in the project's `tasks` sub-collection.
  - Columns: Title, Status, Priority, Assignee, Due Date, Actions
  - **Sorting** via `matSort`
  - **Filtering**: By status (chip toggles, signal-driven), by assignee (dropdown)
  - Real-time updates via **RxJS** Firestore subscription
- **"Add Task" FAB** opens a dialog.
- **Task row click** opens the task edit dialog.
- **Delete task**: Icon button in actions column, confirmation dialog, then delete.

#### Task Create/Edit Dialog
- **Reactive form** with:
  - Title (required)
  - Description (textarea)
  - Status (select: open/in-progress/done)
  - Priority (select: low/medium/high/critical)
  - Assignee (select, populated from project `memberIds` — fetch display names)
  - Due Date (mat-datepicker)
  - Tags (chip input with `mat-chip-grid`)
- **Async validator** on Title: checks for duplicate task title within the same project.

### 5. Member Management (inside Project Detail)

- **Members tab or section** listing current members with display name, email, role badge.
- **"Add Member" button**: Opens a small dialog with email input. Uses the `addMember` callable Cloud Function.
- **Remove Member**: Icon button per member, calls Firestore directly (remove UID from `memberIds`). Owner cannot be removed.

### 6. Settings Page (`/settings`)

- **Template-driven form** (to demonstrate this form type):
  - Display Name (text input, required)
  - Photo URL (text input, optional)
- Save updates the `users/{uid}` document.
- **Theme toggle** (dark/light) with live preview — wired to `ThemeService`.

### 7. Activity Log (inside Project Detail)

- Section/tab showing the project's `activityLog` sub-collection, ordered by timestamp desc.
- Each entry shows: icon based on action type, description text, performer name, relative timestamp.
- **Real-time** via RxJS subscription.

---

## Custom Directives

### Structural Directive: `*appIfRole`
- Location: `shared/directives/if-role.directive.ts`
- Usage: `<button *appIfRole="'admin'">Admin Action</button>`
- Behavior: Renders the host element only if the current user's `role` field in Firestore matches the provided value. Inject `AuthService` / user signal.

### Attribute Directive: `appPriorityBadge`
- Location: `shared/directives/priority-badge.directive.ts`
- Usage: `<span [appPriorityBadge]="task.priority">{{ task.priority }}</span>`
- Behavior: Sets background color on the element based on priority value (low=green, medium=yellow, high=orange, critical=red). Use `Renderer2` to apply styles.

---

## Signals & RxJS Interop — Specific Patterns

These must be clearly implemented so the codebase teaches the pattern:

1. **`toSignal()`**: In `ProjectDetailComponent`, convert the Firestore `tasks` observable to a signal for template rendering:

        private tasks$ = this.taskService.getTasksForProject(this.projectId);
        tasks = toSignal(this.tasks$, { initialValue: [] });

2. **`toObservable()`**: In `ProjectDetailComponent`, convert the status-filter signal to an observable, then use `switchMap` to re-query Firestore:

        statusFilter = signal<TaskStatus | 'all'>('all');
        private tasks$ = toObservable(this.statusFilter).pipe(
          switchMap(status => this.taskService.getTasksForProject(this.projectId, status))
        );
        tasks = toSignal(this.tasks$, { initialValue: [] });

3. **`computed()`**: Dashboard summary counts computed from signals:

        openTaskCount = computed(() => this.tasks().filter(t => t.status === 'open').length);

---

## HTTP Interceptor

### `authInterceptor` (functional interceptor)
- Location: `core/interceptors/auth.interceptor.ts`
- Attaches the Firebase ID token as a `Bearer` token in the `Authorization` header for all outgoing HTTP requests (relevant for callable functions invoked via raw HTTP if needed).
- Provide via `provideHttpClient(withInterceptors([authInterceptor]))` in the app config.

---

## Cloud Functions V2

Implement in the `functions/src/` directory using Cloud Functions V2 (`onCall`, `onDocumentWritten`, etc.).

### 1. HTTPS Callable: `addMember`
- **Trigger**: Called from the frontend when adding a member to a project.
- **Input**: `{ projectId: string, email: string }`
- **Logic**:
  1. Verify the caller is the project owner or an admin (check `users/{callerUid}.role` or project `ownerId`).
  2. Look up the target user by email in the `users` collection.
  3. If user not found, throw a `not-found` error with a clear message.
  4. If user is already a member, throw an `already-exists` error.
  5. Add the user's UID to the project's `memberIds` array.
  6. Write an entry to the project's `activityLog` sub-collection.
- **Error handling**: Use `HttpsError` with proper codes.

### 2. Firestore Trigger: `onTaskStatusChange`
- **Trigger**: `onDocumentWritten("projects/{projectId}/tasks/{taskId}")`
- **Logic**:
  - On **create**: Increment the appropriate `taskCounts` field on the parent project doc. Write an `activityLog` entry ("Task 'X' created").
  - On **update** (if `status` field changed): Decrement the old status count and increment the new status count on the parent project. Write an `activityLog` entry ("Task 'X' moved from open to in-progress").
  - On **delete**: Decrement the appropriate `taskCounts` field. Write an `activityLog` entry ("Task 'X' deleted").
  - Use `FieldValue.increment()` for atomic counter updates.

---

## Firestore Security Rules

Write rules in `firestore.rules` that enforce:

    rules_version = '2';
    service cloud.firestore {
      match /databases/{database}/documents {

        // Users: can read any user profile, can only write own profile
        match /users/{uid} {
          allow read: if request.auth != null;
          allow create: if request.auth != null && request.auth.uid == uid;
          allow update: if request.auth != null && request.auth.uid == uid;
        }

        // Projects: only members can read, only owner can update/delete
        match /projects/{projectId} {
          allow read: if request.auth != null &&
            (request.auth.uid in resource.data.memberIds || request.auth.uid == resource.data.ownerId);
          allow create: if request.auth != null;
          allow update: if request.auth != null && request.auth.uid == resource.data.ownerId;
          allow delete: if request.auth != null && request.auth.uid == resource.data.ownerId;

          // Tasks: project members can CRUD tasks
          match /tasks/{taskId} {
            allow read, write: if request.auth != null &&
              (request.auth.uid in get(/databases/$(database)/documents/projects/$(projectId)).data.memberIds ||
               request.auth.uid == get(/databases/$(database)/documents/projects/$(projectId)).data.ownerId);
          }

          // Activity log: members can read, only functions (admin SDK) write
          match /activityLog/{logId} {
            allow read: if request.auth != null &&
              (request.auth.uid in get(/databases/$(database)/documents/projects/$(projectId)).data.memberIds ||
               request.auth.uid == get(/databases/$(database)/documents/projects/$(projectId)).data.ownerId);
            allow write: if false; // only Cloud Functions write here
          }
        }
      }
    }

---

## Folder Structure

Organize the Angular source code as follows:

    src/app/
    ├── core/
    │   ├── guards/
    │   │   ├── auth.guard.ts
    │   │   ├── project-member.guard.ts
    │   │   └── login-redirect.guard.ts
    │   ├── interceptors/
    │   │   └── auth.interceptor.ts
    │   ├── resolvers/
    │   │   └── project.resolver.ts
    │   ├── services/
    │   │   ├── auth.service.ts
    │   │   ├── user.service.ts
    │   │   ├── project.service.ts
    │   │   ├── task.service.ts
    │   │   └── theme.service.ts
    │   └── models/
    │       ├── user.model.ts
    │       ├── project.model.ts
    │       ├── task.model.ts
    │       └── activity-log.model.ts
    ├── shared/
    │   ├── directives/
    │   │   ├── if-role.directive.ts
    │   │   └── priority-badge.directive.ts
    │   └── components/
    │       └── confirm-dialog/
    │           └── confirm-dialog.component.ts
    ├── features/
    │   ├── auth/
    │   │   ├── login/
    │   │   │   └── login.component.ts
    │   │   └── register/
    │   │       └── register.component.ts
    │   ├── dashboard/
    │   │   └── dashboard.component.ts
    │   ├── projects/
    │   │   ├── project-list/
    │   │   │   └── project-list.component.ts
    │   │   ├── project-detail/
    │   │   │   └── project-detail.component.ts
    │   │   ├── project-dialog/
    │   │   │   └── project-dialog.component.ts
    │   │   ├── task-dialog/
    │   │   │   └── task-dialog.component.ts
    │   │   ├── member-dialog/
    │   │   │   └── member-dialog.component.ts
    │   │   └── activity-log/
    │   │       └── activity-log.component.ts
    │   └── settings/
    │       └── settings.component.ts
    ├── app.component.ts        (shell: toolbar + sidenav + router-outlet)
    ├── app.config.ts           (providers: router, http, firebase, material)
    └── app.routes.ts           (lazy-loaded route definitions)

---

## Implementation Order

Execute in this sequence to maintain a working app at each step. After each step, the app should compile and run.

1. **Models & interfaces** — Define all TypeScript interfaces/types in `core/models/`.
2. **Auth** — `AuthService`, login page, register page, `authGuard`, `loginRedirectGuard`.
3. **App shell** — `AppComponent` with toolbar, sidenav, theme toggle, `ThemeService`.
4. **User service** — CRUD for user documents in Firestore.
5. **Project service & list** — `ProjectService`, `ProjectListComponent` with mat-table, project create/edit dialog.
6. **Project detail & tasks** — `ProjectDetailComponent`, `TaskService`, task table, task create/edit dialog, signal/RxJS interop patterns.
7. **Member management** — member list section, add-member dialog (frontend only initially, wired to callable function later).
8. **Dashboard** — summary cards, recent activity feed.
9. **Settings** — template-driven form for profile, theme toggle section.
10. **Custom directives** — `*appIfRole`, `appPriorityBadge`.
11. **Interceptor & resolver** — `authInterceptor`, `projectResolver`, `projectMemberGuard`.
12. **Cloud Functions** — `addMember` callable, `onTaskStatusChange` trigger.
13. **Firestore Security Rules** — write and deploy the rules.
14. **Polish** — loading spinners, error states, empty states, snackbar notifications, responsive tweaks.

---

## Working Mode for Claude Code

- **Small, verifiable steps.** Complete one numbered implementation step at a time. After each step, summarise what changed and which files were touched.
- **Ask before destructive changes.** If something in the existing repo conflicts with this plan (e.g. an already-present `app.routes.ts` with different routing), surface the conflict and propose a resolution before overwriting.
- **Verify as you go.** After each step, mentally run through: does this compile? Are types sound? Does it follow `.claude/CLAUDE.md`? Are there subscriptions that need `takeUntilDestroyed()`?
- **No scope creep.** If a sensible-looking extension is tempting (extra features, libraries, abstractions), note it as a suggestion at the end of the step — do not add it unprompted.

---

## Project-Specific Quality Checklist

> Baseline Angular/TypeScript quality rules (no `any`, `OnPush`, native control flow, signal usage, accessibility, etc.) come from `.claude/CLAUDE.md` and are assumed. The items below are the **project-specific** gates on top of that baseline.

Before considering any feature complete, verify:

- [ ] Smart components own Firestore access; presentational children receive data via `input()` and emit via `output()`.
- [ ] All Firestore subscriptions are cleaned up (via `toSignal` with injection context, `takeUntilDestroyed()`, or the `async` pipe).
- [ ] Every Firestore document read/written is backed by a typed model in `core/models/` — no raw `DocumentData` leaks into components.
- [ ] All Material forms surface validation errors inline with `<mat-error>`.
- [ ] Every mutating action produces user feedback (snackbar on success, snackbar/dialog on failure).
- [ ] Every async view renders explicit loading, empty, and error states.
- [ ] Dark mode and light mode both render correctly across all pages.
- [ ] Security rules match the data model and are deployed.
- [ ] `ng build` completes with zero warnings.
- [ ] `cd functions && npm run build` completes with zero errors.
