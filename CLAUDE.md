# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Angular 21 + Firebase reference implementation demonstrating best practices for a full-stack GCP setup. Stack: Angular (standalone components, signals), Firebase Auth, Firestore, Cloud Functions v2, Firebase Hosting, deployed to GCP.

- Firebase project: `gcp-blueprint-test-run-03`
- Firestore region: `europe-central2`
- Locale: `de-DE`

## Commands

### Angular App

```bash
npm start          # Dev server at localhost:4200
npm run build      # Production build → dist/test-app/browser/
npm test           # Vitest unit tests
npm run watch      # Dev build with watch
```

### Cloud Functions (run inside `functions/`)

```bash
npm run build      # Compile TypeScript → lib/
npm run serve      # Build + start Firebase emulators
npm run deploy     # Deploy functions only
```

### Firebase

```bash
firebase deploy                    # Deploy everything
firebase deploy --only hosting     # Deploy frontend only
firebase deploy --only functions   # Deploy functions only
firebase deploy --only firestore   # Deploy rules + indexes
firebase emulators:start           # Run all emulators locally
```

## Architecture

### Frontend (`src/`)

- **`app.config.ts`** — root providers: Router, Firebase (App, Auth, Firestore, Functions), LOCALE_ID
- **`app.routes.ts`** — route definitions (extend here with lazy-loaded feature routes)
- **`environments/`** — Firebase SDK config per environment (`environment.ts`, `environment.prod.ts`)
- Angular build output goes to `dist/test-app/browser/` (served by Firebase Hosting)

### Cloud Functions (`functions/src/index.ts`)

Two exported functions, both scoped to `europe-central2`, max 10 instances:
- `onPostCreated` — Firestore trigger on `/posts/{postId}` create; adds `processedAt` timestamp
- `healthCheck` — HTTP GET for smoke testing

### Firestore Security Rules (`firestore.rules`)

- `/users/{userId}` — authenticated read/write of own document only
- `/posts/{postId}` — public read, authenticated write

### Firestore Indexes (`firestore.indexes.json`)

Composite index on `posts`: `authorId ASC + createdAt DESC`.

## Key Dependencies

- Angular 21 + Angular Material
- AngularFire 21 (RC) for Firebase SDK integration
- Vitest + jsdom for unit testing
- SCSS for styles
- Firestore persistent local cache enabled in `app.config.ts`
