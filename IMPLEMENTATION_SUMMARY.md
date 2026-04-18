# Project Tracker Pro — Implementation Summary

End-to-end implementation of the spec in `project-tracker-pro-prompt.md`.

## Core (`src/app/core`)

- **Models**: `user`, `project`, `task`, `activity-log` with discriminated-union status/role/action fields.
- **Services**:
  - `AuthService` — email/password + Google sign-in, profile upsert on login/register, signal + observable surface.
  - `UserService`, `ProjectService`, `TaskService` — AngularFire Firestore bindings only, typed returns.
  - `ThemeService` — `darkMode` signal, `<body>` class toggle, `localStorage` persistence, system-preference fallback.
- **Guards** (functional): `authGuard`, `loginRedirectGuard`, `projectMemberGuard`.
- **Resolver**: `projectResolver` (redirects to `/projects` if the doc is missing).
- **Interceptor**: `authInterceptor` attaches the Firebase ID token as a Bearer header.

## Shared (`src/app/shared`)

- `*appIfRole` structural directive (reactive to role changes via signal effect).
- `appPriorityBadge` attribute directive (Renderer2-based styling).
- Reusable `ConfirmDialogComponent` with destructive variant.

## Features (`src/app/features`)

- **Auth** — `LoginComponent` / `RegisterComponent` (reactive forms, mat-error inline validation, cross-field password match, Google sign-in).
- **Dashboard** — KPI cards (projects, open tasks assigned, completed-this-week via collection-group queries) and merged recent activity feed (top 10 across first 5 projects).
- **Project list** — `mat-table` + `matSort` + `mat-paginator`, client-side title filter, New Project dialog.
- **Project detail** — demonstrates the required `toSignal` / `toObservable` / `computed` patterns: `statusFilter` signal → observable → `switchMap` to Firestore; task table, members tab, activity-log tab.
- **Dialogs** — `ProjectDialogComponent` (async duplicate-title validator scoped to owner), `TaskDialogComponent` (status/priority/assignee/due date/tags + async duplicate-title per project), `MemberDialogComponent` (wired to `addMember` callable).
- **Settings** — template-driven profile form (`NgForm` + `[ngModel]`) and theme toggle with live preview.

## App shell (`src/app`)

- `app.ts` / `app.html` / `app.scss` — responsive `mat-sidenav` (side on desktop via `BreakpointObserver`, overlay on handset), toolbar with title, theme toggle, user menu with logout.
- `app.config.ts` — `provideHttpClient(withInterceptors([authInterceptor]))`, `provideFunctions(getFunctions(getApp(), 'europe-central2'))`, router with `withComponentInputBinding()`, `LOCALE_ID: 'de-DE'`.
- `app.routes.ts` — all feature routes lazy-loaded via `loadComponent`, guards and resolver attached.

## Firestore (`firestore.*`)

- **Rules** enforce: authenticated read of any user profile, self-write; project read limited to members/owner, update/delete to owner; tasks CRUD by project members; activityLog read-only for members, write-denied for clients (Admin SDK only).
- **Indexes**: composite indexes for `projects` (memberIds + createdAt, ownerId + title) and `tasks` (status + createdAt plus collection-group indexes for the dashboard queries).

## Cloud Functions (`functions/src/index.ts`)

- **`addMember` (onCall)** — authorizes owner/admin, looks up the target by email, rejects duplicates with typed `HttpsError` codes (`unauthenticated`, `invalid-argument`, `not-found`, `permission-denied`, `already-exists`), writes member addition + activity-log entry in a batch.
- **`onTaskStatusChange` (onDocumentWritten)** — on create/delete/status-change updates `taskCounts.{open,inProgress,done}` on the parent project via `FieldValue.increment()` and appends a contextual `activityLog` entry.

## Build state

- `cd functions && npm run build` — passes.
- `ng build` — passes (budgets raised in `angular.json` to accommodate Material; no warnings).

## Notes / caveats

- `@angular/animations` is not installed in this repo, so `provideAnimationsAsync()` is intentionally omitted. Material 3 renders without animations. If you later add `@angular/animations`, reintroduce `provideAnimationsAsync()` in `app.config.ts`.
- The `memberIds` `array-contains` query and security rule assume member lists remain small (Firestore limit: 10 `array-contains` values in a single query — not hit by current reads, but something to keep in mind for future filters).
- The dashboard's "completed this week" and "open assigned" rely on the deployed collection-group indexes in `firestore.indexes.json`.
- Activity log entries are written exclusively by Cloud Functions; client writes will be rejected by the rules.
