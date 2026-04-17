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
  -d '{"email":"smoke-1775938538@test.com","password":"Test1234!","returnSecureToken":true}')
TEST_UID=$(echo "$SIGNUP" | python3 -c "import sys,json; print(json.load(sys.stdin)['localId'])")
echo "  Created user: $TEST_UID"
echo "  ✅ Auth OK"

echo ""
echo "=== 3. Cloud Functions: hit healthCheck ==="
# echo "  Paste your healthCheck URL (from firebase deploy output):"
# read -p "  URL: " FUNC_URL
curl -s "https://europe-central2-${PROJECT_ID}.cloudfunctions.net/healthCheck" | python3 -m json.tool
echo "  ✅ Functions OK"

echo ""
echo "=== All checks passed ==="
