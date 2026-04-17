# GCP Blueprint - Test App
Step-by-step guide to set up a new Angular + Firebase Project with only cli whenever possible.

## Phase 1 - Prerequisites

All tools must be installed and authenticated before starting:
```bash
$ gh --version
gh version 2.89.0 (2026-03-26)
https://github.com/cli/cli/releases/tag/v2.89.0
$ ng --version
21.2.7
$ firebase --version
15.15.0
$ gcloud --version
Google Cloud SDK 564.0.0
bq 2.1.31
core 2026.04.03
gcloud-crc32c 1.0.0
gsutil 5.36
$ jq --version
jq-1.6-159-apple-gcff5336-dirty
```
```bash
gcloud auth login
gcloud auth application-default login
gh auth login
firebase login
```

## Phase 2 - New Angular Project
```bash
$ ng new gcp-blueprint-test-run-03 --style=scss --ai-config=claude --defaults
$ gh repo create simonklotz/gcp-blueprint-test-run-03 --private --source=. --remote=origin
$ ng add @angular/material --defaults
$ git push origin HEAD
```

## Phase 3 - New Firebase Project
```bash
$ firebase login
# Verify auth
$ firebase projects:list
# Create the project (also creates the underlying GCP project)
$ firebase projects:create gcp-blueprint-test-run-03 --display-name "GCP Blueprint Test Run 03"
```

### 3a. Authentication
```bash
$ firebase init auth
```
- **Please select an option:** Use an existing project
- **Select a default Firebase project for this directory:** gcp-blueprint-test-run-03 (GCP Blueprint Test Run 03)
- **Which providers would you like to enable?:** Google Sign-In, Email/Password
- **What display name would you like to use for your OAuth brand?** GCP Blueprint Test Run 03
- **What support email would you like to register for your OAuth brand?** your-account@gmail.com
- **Would you like to install agent skills for Firebase?** Yes

Deploy the auth configuration (or run a full deploy later):
```bash
firebase deploy --only auth
```

### 3b. Firestore
```bash
firebase init firestore
```
- **Please select the location of your Firestore database:** europe-central2 (Frankfurt)
- **What file should be used for Firestore Rules?** firestore.rules
- **What file should be used for Firestore indexes?** firestore.indexes.json
- **Would you like to install agent skills for Firebase?** Yes

### 3c. Functions
```bash
firebase init functions
```
- **What language would you like to use to write Cloud Functions?** TypeScript
- **Do you want to use ESLint to catch probable bugs and enforce style?** No (it caused issues in the past, we'll may add it manually later)
- **Do you want to install dependencies with npm now?** Yes
- **Would you like to install agent skills for Firebase?** Yes

### 3d. Hosting
```bash
firebase init hosting
```
- **Detected a Angular codebase with SSR features. We can't guarantee that this site will work on Firebase Hosting, which is optimized for static sites. Another product, Firebase App Hosting, was designed for SSR web apps. Would you like to use App Hosting instead?** No (I didn't choose SSR for Angular)
- **What do you want to use as your public directory?** dist/gcp-blueprint-test-run-03/browser
- **Configure as a single-page app (rewrite all urls to /index.html)?** Yes
- **Set up automatic builds and deploys with GitHub?** No (we'll set it up manually later)
- **Would you like to install agent skills for Firebase?** Yes

## Phase 4 - Usage & Billing
- Switch from the free Spark plan to the Blaze plan in the Firebase Console → Billing → Upgrade. This will allow us to use all features without hitting free tier limits during development and testing. Don't worry, you won't be charged until you exceed the free tier limits, and you can set up budget alerts to monitor usage.
  https://console.firebase.google.com/project/gcp-blueprint-test-run-03/usage/details

## Phase 5 — Enable All Required GCP APIs
Enable all required APIs for Cloud Functions v2 - APIs get auto-enabled during deploy, which is fragile.
Better to be explicit:
```bash
PROJECT_ID="gcp-blueprint-test-run-03"
```
```bash
gcloud services enable \
cloudbilling.googleapis.com \
cloudfunctions.googleapis.com \
cloudbuild.googleapis.com \
cloudresourcemanager.googleapis.com \
artifactregistry.googleapis.com \
firebaseextensions.googleapis.com \
firebaserules.googleapis.com \
firestore.googleapis.com \
firebasehosting.googleapis.com \
run.googleapis.com \
eventarc.googleapis.com \
pubsub.googleapis.com \
storage.googleapis.com \
iam.googleapis.com \
iamcredentials.googleapis.com \
identitytoolkit.googleapis.com \
sts.googleapis.com \
--project=$PROJECT_ID
```

## Phase 6 - Firestore Setup
### 6a.Edit security rules
```bash
cat > firestore.rules << 'EOF'
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Authenticated users can read/write their own docs
    match /users/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
    // Public read, authenticated write for a test collection
    match /posts/{postId} {
      allow read: if true;
      allow write: if request.auth != null;
    }
  }
}
EOF
```

### 6b.Deploy rules
```bash
$ firebase deploy --only firestore:rules
```

### [OPTIONAL] 6c. Add a composite index (example):
Optional at this point. We can skip it now and come back to it later, once we have real queries that require it.
```bash
$ cat > firestore.indexes.json << 'EOF'
{
  "indexes": [
    {
      "collectionGroup": "posts",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "authorId", "order": "ASCENDING" },
        { "fieldPath": "createdAt", "order": "DESCENDING" }
      ]
    }
  ],
  "fieldOverrides": []
}
EOF

$ firebase deploy --only firestore:indexes
```

### [OPTIONAL] 6d. Seed test data from the CLI:
```bash
# Install a helper if you want a quick one-liner:
$ npx firebase-tools firestore:delete --all-collections --force 2>/dev/null

# Use the REST API via gcloud to write a document
$ ACCESS_TOKEN=$(gcloud auth print-access-token)
$ curl -s -X POST \
  "https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/posts?documentId=test-post-1" \
  -H "Authorization: Bearer ${ACCESS_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "fields": {
      "title": { "stringValue": "Hello from CLI" },
      "authorId": { "stringValue": "seed-user-001" },
      "createdAt": { "timestampValue": "2026-04-10T12:00:00Z" }
    }
  }'
```
Verify the write:
```bash
curl -s \
  "https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/posts/test-post-1" \
  -H "Authorization: Bearer ${ACCESS_TOKEN}" | python3 -m json.tool
```
You should see your document fields in the JSON response.

## Phase 7 — Cloud Functions
### 7a. Write a minimal Firestore trigger and an HTTP callable:
```bash
# change directory to ~/test-app/functions
$ cd functions

$ cat > src/index.ts << 'FNEOF'
import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { onRequest } from 'firebase-functions/v2/https';
import { setGlobalOptions } from 'firebase-functions';
import * as admin from 'firebase-admin';

setGlobalOptions({ maxInstances: 10, region: 'europe-central2' });

admin.initializeApp();

// Firestore trigger: when a new post is created, stamp it with a serverTimestamp
export const onPostCreated = onDocumentCreated("posts/{postId}", async (event) => {
  const snapshot = event.data;
  if (!snapshot) return;
  const data = snapshot.data();
  console.log(`New post created: ${event.params.postId}`, data);
  await snapshot.ref.update({ processedAt: new Date().toISOString() });
});

// Simple HTTP function for smoke testing
export const healthCheck = onRequest((req, res) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    project: process.env.GCLOUD_PROJECT,
  });
});
FNEOF
```

### 7b. Grant roles to service agents, for successful deployment
```bash
# Get the project number (not ID) for the service account binding
$ PROJECT_NUMBER=$(gcloud projects describe $PROJECT_ID --format="value(projectNumber)")
# (NEW) Create the Pub/Sub service agent (idempotent — safe to re-run)
$ gcloud beta services identity create \
    --service=pubsub.googleapis.com \
    --project=$PROJECT_ID
# Grant all three roles needed for Cloud Functions v2
$ gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:service-${PROJECT_NUMBER}@gcp-sa-pubsub.iam.gserviceaccount.com" \
  --role="roles/iam.serviceAccountTokenCreator"
$ gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com" \
  --role="roles/run.invoker"
$ gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com" \
  --role="roles/eventarc.eventReceiver"
```

### 7c. Build & Deploy
```bash
# Directory test-app/functions
$ npm run build

$ cd ..
# Directory test-app root
$ firebase deploy --only functions
```

### 7d. Verfiy
```bash
$ curl https://europe-central2-${PROJECT_ID}.cloudfunctions.net/healthCheck
# Test the Firestore trigger by creating a document
$ ACCESS_TOKEN=$(gcloud auth print-access-token)
$ curl -s -X POST \
  "https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/posts?documentId=trigger-test" \
  -H "Authorization: Bearer ${ACCESS_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{"fields":{"title":{"stringValue":"Trigger Test"}}}'
# Check function logs for the trigger
$ firebase functions:log --only onPostCreated
```

## Phase 8 - Integration with Angular
**Directory**: project root

### 8a. Install AngularFire and Firebase SDK
```bash
# usually you would run
$ ng add @angular/fire
# but as the latest stable version 20.0.1 is not compatible with Angular 21 yet,
# we choose the release candidate version 21.0.0-rc.0:
$ npm install @angular/fire@21.0.0-rc.0 firebase
```

### 8b. Configure environment files:
```bash
# Get your web app config from CLI
$ firebase apps:list
# If no web app exists yet, create one:
$ firebase apps:create WEB "My Angular App"
# Get the SDK config snippet:
$ firebase apps:sdkconfig WEB $(firebase apps:list --json | python3 -c "
  import sys,json
  apps=json.load(sys.stdin)['result']
  web=[a for a in apps if a.get('platform')=='WEB']
  print(web[0]['appId'] if web else '')
  ")
```
This prints something like:
```bash
firebase = {
  apiKey: "AIza...",
  authDomain: "my-app-project-id.firebaseapp.com",
  projectId: "my-app-project-id",
  storageBucket: "my-app-project-id.firebasestorage.app",
  messagingSenderId: "123456",
  appId: "1:123456:web:abc123"
};
````
Write it into your environment file:
```bash
$ mkdir src/environments
$ touch src/environments/environment.ts
$ cat > src/environments/environment.ts << 'EOF'
export const environment = {
  production: false,
  firebase: {
    apiKey: "AIza...",           // paste your real values
    authDomain: "my-app-project-id.firebaseapp.com",
    projectId: "my-app-project-id",
    storageBucket: "my-app-project-id.firebasestorage.app",
    messagingSenderId: "123456",
    appId: "1:123456:web:abc123"
  }
};
EOF

$ cp src/environments/environment.ts src/environments/environment.prod.ts
# Edit the prod copy to set production: true
$ sed -i '' 's/production: false/production: true/' src/environments/environment.prod.ts
```

### 8c. Wire up in app.config.ts (standalone Angular 21):
```bash
$ cat > src/app/app.config.ts << 'EOF'
import { ApplicationConfig, LOCALE_ID, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter } from '@angular/router';
import { getApp, initializeApp, provideFirebaseApp } from '@angular/fire/app';
import { getAuth, provideAuth } from '@angular/fire/auth';
import {
  initializeFirestore,
  persistentLocalCache,
  provideFirestore,
} from '@angular/fire/firestore';
import { getFunctions, provideFunctions } from '@angular/fire/functions';
import { routes } from './app.routes';
import { environment } from '../environments/environment';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    provideFirebaseApp(() => initializeApp(environment.firebase)),
    provideAuth(() => getAuth()),
    provideFirestore(() =>
      initializeFirestore(getApp(), {
        localCache: persistentLocalCache({}),
      }),
    ),
    provideFunctions(() => getFunctions()),
    { provide: LOCALE_ID, useValue: 'de-DE' },
  ],
};
EOF
```

## Phase 9 - Verification & Smoke Test
**Directory**: project root

### 9a. Quick CLI integration test script:
```bash
$ cat > smoke-test.sh << 'SMOKE'
#!/usr/bin/env bash
set -e

PROJECT_ID="gcp-blueprint-test-run-03"
TOKEN=$(gcloud auth print-access-token)
HEADER="x-goog-user-project: $PROJECT_ID"

echo "=== 1. Firestore: write & read a test document ==="
curl -s -X PATCH \
  "https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/smoke-test/doc1" \
  -H "Authorization: Bearer $TOKEN" \
  -H "$HEADER" \
  -H "Content-Type: application/json" \
  -d '{"fields":{"message":{"stringValue":"Hello from smoke test"}}}' > /dev/null

RESULT=$(curl -s \
  "https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/smoke-test/doc1" \
  -H "Authorization: Bearer $TOKEN" \
  -H "$HEADER")
echo "  $RESULT" | python3 -c "import sys,json; print('  Message:', json.load(sys.stdin)['fields']['message']['stringValue'])"
echo "  ✅ Firestore OK"

echo ""
echo "=== 2. Auth: create & delete a test user ==="
API_KEY=$(firebase apps:sdkconfig WEB --json 2>/dev/null \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['result']['sdkConfig']['apiKey'])")
SIGNUP=$(curl -s \
  "https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"email":"smoke-1775938537@test.com","password":"Test1234!","returnSecureToken":true}')
TEST_UID=$(echo "$SIGNUP" | python3 -c "import sys,json; print(json.load(sys.stdin)['localId'])")
echo "  Created user: $TEST_UID"
echo "  ✅ Auth OK"

echo ""
echo "=== 3. Cloud Functions: hit healthCheck ==="
echo "  Paste your healthCheck URL (from firebase deploy output):"
read -p "  URL: " FUNC_URL
curl -s "$FUNC_URL" | python3 -m json.tool
echo "  ✅ Functions OK"

echo ""
echo "=== All checks passed ==="
SMOKE

$ chmod +x smoke-test.sh
$ ./smoke-test.sh
```

## Phase 10 - CI/CD
### 10a. Set Shell Variables
Run this block once. Every subsequent command references these variables so you can copy
and paste without editing anything else.
```bash
$ export PROJECT_ID="gcp-blueprint-test-run-03"
$ export PROJECT_NUMBER=$(gcloud projects describe "$PROJECT_ID" --format="value(projectNumber)")
$ export REPO_OWNER="simonklotz"
$ export REPO_NAME="gcp-blueprint-test-run-03"
$ export REPO="$REPO_OWNER/$REPO_NAME"

$ export SA_NAME="gha-deployer"
$ export SA_EMAIL="${SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"

$ export POOL_ID="github-actions"
$ export PROVIDER_ID="github-actions-oidc"
$ export POOL_RESOURCE="projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/${POOL_ID}"
$ export PROVIDER_RESOURCE="${POOL_RESOURCE}/providers/${PROVIDER_ID}"
```

---
### 10b. Create the Service Account
```bash
$ gcloud iam service-accounts create "$SA_NAME" \
  --display-name="GitHub Actions Deployer" \
  --description="Deploys Firebase Hosting, Cloud Functions v2, Firestore rules, and Auth config from GitHub Actions CI" \
  --project="$PROJECT_ID"
```
Verify it exists:
```bash
$ gcloud iam service-accounts describe "$SA_EMAIL" --project="$PROJECT_ID"
```

---
### 10c. Grant IAM Roles to the Service Account
Two categories of roles are needed: one Firebase role that covers all Firebase product operations,
plus GCP infrastructure roles that Firebase doesn't manage.

**Why `roles/firebase.admin` instead of individual Firebase product roles:**
The Firebase CLI calls `firebase.googleapis.com/v1alpha/firebase:provisionFirebaseApp` during
every deploy to verify app registration. This requires the `firebase.clients.create` permission,
which is only present in `roles/firebase.admin` — not in product-level roles like
`firebasehosting.admin`, `firebaserules.admin`, or `firebaseauth.admin`.

```bash
# Full read/write access to all Firebase products: Hosting, Auth, Firestore rules,
# Functions (Firebase-side), Extensions. Includes firebase.clients.create and
# firebase.projects.update which are required by the Firebase CLI provisioning step.
$ gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${SA_EMAIL}" \
  --role="roles/firebase.admin"

# The Firebase CLI's provisionFirebaseApp call attempts to enable APIs (cloudapis.googleapis.com,
# firebase.googleapis.com, firebasehosting.googleapis.com, identitytoolkit.googleapis.com, etc.)
# on every deploy to ensure they are active. Without serviceusage.services.enable, this fails
# with HTTP 403 even if the APIs were already enabled manually.
$ gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${SA_EMAIL}" \
  --role="roles/serviceusage.serviceUsageAdmin"

# Create, update, and delete Cloud Functions — but NOT set IAM policies on them
$ gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${SA_EMAIL}" \
  --role="roles/cloudfunctions.developer"

# Cloud Functions v2 runs on Cloud Run; this role is required to manage Cloud Run services
$ gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${SA_EMAIL}" \
  --role="roles/run.developer"

# Must be able to act as the runtime service account when deploying a function
$ gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${SA_EMAIL}" \
  --role="roles/iam.serviceAccountUser"

# Cloud Functions v2 build process pushes container images to Artifact Registry
$ gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${SA_EMAIL}" \
  --role="roles/artifactregistry.writer"

# Read Firestore database metadata and manage indexes (firestore.indexes.json).
# roles/firebase.admin does not include datastore.* permissions — those come from
# the GCP Datastore API, which is separate from the Firebase Management API.
$ gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${SA_EMAIL}" \
  --role="roles/datastore.indexAdmin"
```

---
### 10d. Grant Required Roles to GCP Service Agents
These bindings are on GCP-managed service accounts (not the deployer SA). They are required
for Cloud Functions v2 to work correctly and were already present in the README (Phase 7b).
Included here for completeness.
```bash
# Pub/Sub service agent must be able to create identity tokens for Eventarc triggers
$ gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:service-${PROJECT_NUMBER}@gcp-sa-pubsub.iam.gserviceaccount.com" \
  --role="roles/iam.serviceAccountTokenCreator"

# Compute default SA must be invokable by Eventarc (for Firestore triggers on CF v2)
$ gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com" \
  --role="roles/eventarc.eventReceiver"

# Compute default SA must be invokable by Cloud Run (for HTTP-triggered CF v2)
$ gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com" \
  --role="roles/run.invoker"
```
**Why:** Without `serviceAccountTokenCreator` on the Pub/Sub SA, Eventarc cannot generate
the OIDC tokens needed to trigger Firestore-backed Cloud Functions. Without `run.invoker`
on the compute SA, Cloud Run cannot invoke functions in response to HTTP requests routed
by Eventarc. These are GCP infrastructure requirements, not deployer permissions.

---
### 10e. Create the Workload Identity Pool
```bash
$ gcloud iam workload-identity-pools create "$POOL_ID" \
  --location="global" \
  --display-name="GitHub Actions" \
  --description="Allows GitHub Actions runners to federate with GCP using OIDC tokens" \
  --project="$PROJECT_ID"
```
**Why a dedicated pool:** A pool is the top-level namespace for external identity providers.
Creating one pool per CI system (rather than sharing one pool across all external IdPs) makes
it trivial to disable all GitHub Actions access by disabling or deleting the pool, without
affecting other federated identities.

Verify:
```bash
$ gcloud iam workload-identity-pools describe "$POOL_ID" \
  --location="global" \
  --project="$PROJECT_ID"
```

---
### 10f. Create the OIDC Provider
```bash  
$ gcloud iam workload-identity-pools providers create-oidc "$PROVIDER_ID" \
  --location="global" \
  --workload-identity-pool="$POOL_ID" \
  --display-name="GitHub Actions OIDC" \
  --issuer-uri="https://token.actions.githubusercontent.com" \
  --allowed-audiences="https://iam.googleapis.com/${PROVIDER_RESOURCE}" \
  --attribute-mapping="google.subject=assertion.sub,attribute.actor=assertion.actor,attribute.repository=assertion.repository,attribute.repository_owner=assertion.repository_owner,attribute.ref=assertion.ref,attribute.workflow=assertion.workflow" \
  --attribute-condition="assertion.repository == '${REPO}'" \
  --project="$PROJECT_ID"
```
Verify:
```bash
$ gcloud iam workload-identity-pools providers describe "$PROVIDER_ID" \
  --location="global" \
  --workload-identity-pool="$POOL_ID" \
  --project="$PROJECT_ID"
```

---
### 10g. Bind the Service Account to the WIF Provider
This grants the `roles/iam.workloadIdentityUser` role to all GitHub Actions runs from
`simonklotz/gcp-blueprint-test-run-03` on the `main` branch — and only those.
```bash
$ gcloud iam service-accounts add-iam-policy-binding "$SA_EMAIL" \
  --role="roles/iam.workloadIdentityUser" \
  --member="principal://iam.googleapis.com/${POOL_RESOURCE}/subject/repo:${REPO}:ref:refs/heads/main" \
  --project="$PROJECT_ID"
```
Verify the binding was added correctly:
```bash
$ gcloud iam service-accounts get-iam-policy "$SA_EMAIL" \
  --project="$PROJECT_ID" \
  --format=json \
  | jq '.bindings[] | select(.role == "roles/iam.workloadIdentityUser")'
```

---
### 10h. Retrieve the Full Provider Resource Name
Construct the value you will store as a GitHub repository variable:
```bash
$ WIF_PROVIDER=$(gcloud iam workload-identity-pools providers describe "$PROVIDER_ID" \
  --location="global" \
  --workload-identity-pool="$POOL_ID" \
  --project="$PROJECT_ID" \
  --format="value(name)")

$ echo $WIF_PROVIDER
projects/908969318144/locations/global/workloadIdentityPools/github-actions/providers/github-actions-oidc
```

---
### 10i. Configure GitHub Repository Variables via `gh`
Non-sensitive config is stored as repository **variables** (not secrets). Firebase web API
keys and App IDs are public values — they ship in every user's browser as part of the Angular
bundle. Treating them as secrets creates false expectations about their sensitivity.
```bash
# GCP / WIF config
$ gh variable set GCP_PROJECT_ID     --body "$PROJECT_ID"     --repo "$REPO"
$ gh variable set GCP_PROJECT_NUMBER --body "$PROJECT_NUMBER" --repo "$REPO"
$ gh variable set GCP_SERVICE_ACCOUNT --body "$SA_EMAIL"      --repo "$REPO"
$ gh variable set GCP_WIF_PROVIDER   --body "$WIF_PROVIDER"   --repo "$REPO"

# Firebase web app config — retrieve from firebase-tools, not hard-coded
$ FIREBASE_APP_ID=$(firebase apps:list --json \
  | jq -r '.result[] | select(.platform == "WEB") | .appId' \
  | head -1)

$ FIREBASE_API_KEY=$(firebase apps:sdkconfig WEB "$FIREBASE_APP_ID" --json \
  | jq -r '.result.sdkConfig.apiKey')

$ gh variable set FIREBASE_APP_ID --body "$FIREBASE_APP_ID" --repo "$REPO"
$ gh variable set FIREBASE_API_KEY --body "$FIREBASE_API_KEY" --repo "$REPO"
```
Verify all variables are set:
```bash
$ gh variable list --repo "$REPO"
```

---
### 10j. (Recommended) Create a GitHub Environment for Production
A GitHub Environment named `production` adds server-side branch protection for the deploy
job — protection that lives in GitHub's infrastructure, not just in the YAML file (which
a PR could modify).

The Repo must be public to create environments with a free GitHub account.
```bash
# Create the environment with a custom branch deployment policy
$ gh api \
  --method PUT \
  -H "Accept: application/vnd.github+json" \
  "/repos/${REPO}/environments/production" \
  --input - << 'EOF'
{
  "deployment_branch_policy": {
    "protected_branches": false,
    "custom_branch_policies": true
  }
}
EOF

# Restrict this environment to the main branch only
gh api \
  --method POST \
  -H "Accept: application/vnd.github+json" \
  "/repos/${REPO}/environments/production/deployment-branch-policies" \
  --input - << 'EOF'
{
  "name": "main",
  "type": "branch"
}
EOF
```
**What this buys you:**
- Even if someone adds `environment: production` to a feature-branch workflow, GitHub will
  refuse to deploy because the branch policy does not include that branch.
- The GitHub Actions UI shows a deployment history: when each deploy ran, who triggered it,
  and whether it succeeded.
- You can later add required reviewers (manual approval gate) to the environment without
  changing any workflow YAML.

---
### 10k. Write the GitHub Actions Workflow
For the GitHub Action to be able to run "firebase deploy", you need to install the firebase-tools as a dev dependency:
```bash
$ npm install --save-dev firebase-tools
```

```bash
$ mkdir -p .github/workflows

$ cat > .github/workflows/deploy.yml << 'WORKFLOW'
name: CI / Deploy to Firebase

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

# On main: queue new runs, never cancel an in-progress deploy.
# On PR branches: cancel the previous run for the same PR when a new commit is pushed.
concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: ${{ github.ref != 'refs/heads/main' }}

jobs:
  # ─── Job 1: Build and test — runs on every push and pull_request ───────────
  build-and-test:
    name: Build & Test
    runs-on: ubuntu-latest

    permissions:
      contents: read
      # id-token intentionally omitted — this job never talks to GCP

    steps:
      - name: Checkout
        uses: actions/checkout@v5

      - name: Setup Node.js
        uses: actions/setup-node@v5
        with:
          node-version: '24'
          cache: 'npm'

      # Use placeholder values so the build does not depend on real Firebase credentials.
      # The real environment file is written only in the deploy job, after GCP auth.
      - name: Write stub environment file for CI build
        run: |
          mkdir -p src/environments
          cat > src/environments/environment.ts << 'ENVEOF'
          export const environment = {
            production: false,
            firebase: {
              projectId: 'ci-placeholder',
              appId: '1:000000000000:web:000000000000',
              storageBucket: 'ci-placeholder.firebasestorage.app',
              apiKey: 'ci-placeholder-key',
              authDomain: 'ci-placeholder.firebaseapp.com',
              messagingSenderId: '000000000000',
              projectNumber: '000000000000',
              version: '2',
            },
          };
          ENVEOF

      - name: Install frontend dependencies
        run: npm ci

      - name: Run tests
        run: npm test

      - name: Build frontend (production configuration)
        run: npm run build -- --configuration=production

      - name: Install functions dependencies
        working-directory: ./functions
        run: npm ci

      - name: Build functions
        working-directory: ./functions
        run: npm run build

  # ─── Job 2: Deploy — runs only on push to main, after build-and-test passes ─
  deploy:
    name: Deploy to Firebase
    runs-on: ubuntu-latest
    needs: build-and-test
    if: github.ref == 'refs/heads/main' && github.event_name == 'push'
    environment: production

    permissions:
      contents: read
      id-token: write  # Required for WIF OIDC token exchange

    steps:
      - name: Checkout
        uses: actions/checkout@v5

      - name: Setup Node.js
        uses: actions/setup-node@v5
        with:
          node-version: '24'
          cache: 'npm'

      - name: Authenticate to Google Cloud
        id: auth
        uses: google-github-actions/auth@v3
        with:
          project_id: ${{ vars.GCP_PROJECT_ID }}
          workload_identity_provider: ${{ vars.GCP_WIF_PROVIDER }}
          service_account: ${{ vars.GCP_SERVICE_ACCOUNT }}
          token_format: 'access_token'

      - name: Write production environment file
        env:
          GCP_PROJECT_ID: ${{ vars.GCP_PROJECT_ID }}
          FIREBASE_APP_ID: ${{ vars.FIREBASE_APP_ID }}
          FIREBASE_API_KEY: ${{ vars.FIREBASE_API_KEY }}
          GCP_PROJECT_NUMBER: ${{ vars.GCP_PROJECT_NUMBER }}
        run: |
          mkdir -p src/environments
          cat > src/environments/environment.ts << ENVEOF
          export const environment = {
            production: true,
            firebase: {
              projectId: '${GCP_PROJECT_ID}',
              appId: '${FIREBASE_APP_ID}',
              storageBucket: '${GCP_PROJECT_ID}.firebasestorage.app',
              apiKey: '${FIREBASE_API_KEY}',
              authDomain: '${GCP_PROJECT_ID}.firebaseapp.com',
              messagingSenderId: '${GCP_PROJECT_NUMBER}',
              projectNumber: '${GCP_PROJECT_NUMBER}',
              version: '2',
            },
          };
          ENVEOF

      - name: Install frontend dependencies
        run: npm ci

      - name: Build frontend with production environment
        run: npm run build -- --configuration=production

      - name: Install functions dependencies
        working-directory: ./functions
        run: npm ci

      - name: Build functions
        working-directory: ./functions
        run: npm run build

      - name: Deploy to Firebase
        env:
          GOOGLE_OAUTH_ACCESS_TOKEN: ${{ steps.auth.outputs.access_token }}
        run: npx -y firebase-tools@latest deploy
WORKFLOW
```

---
### 10l. Grant the WIF Principal Permission to Mint Access Tokens
The workflow uses `token_format: 'access_token'`, which means the auth action exchanges the
GitHub OIDC token for a short-lived OAuth 2.0 access token on behalf of the service account.
For this to work, the WIF principal (all GitHub Actions runs from this repo) must hold the
`roles/iam.serviceAccountTokenCreator` role **on the service account itself** — not on the
project. Without this binding the auth step fails with HTTP 403 `iam.serviceAccounts.getAccessToken`.
```bash
$ gcloud iam service-accounts add-iam-policy-binding "$SA_EMAIL" \
  --member="principalSet://iam.googleapis.com/${POOL_RESOURCE}/attribute.repository/${REPO}" \
  --role="roles/iam.serviceAccountTokenCreator" \
  --project="$PROJECT_ID"
```
Verify the binding was added:
```bash
$ gcloud iam service-accounts get-iam-policy "$SA_EMAIL" \
  --project="$PROJECT_ID" \
  --format=json \
  | jq '.bindings[] | select(.role == "roles/iam.serviceAccountTokenCreator")'
```
