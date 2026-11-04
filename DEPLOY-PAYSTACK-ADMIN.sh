#!/usr/bin/env bash
# Scoped Teyza Paystack-backed admin rollout from an authorised Git checkout.
set -Eeuo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"
PROJECT=business-lift-3c19c
BRANCH=feat/teyza-free-signup-paystack-products-promotion-20261104
if [[ ! -f "web/teyza-admin/public/admin.html" || ! -f "firebase.teyza-mobile-v39.json" ]]; then
  echo "Run from the reviewed Teyza Git repository root." >&2; exit 1
fi
if [[ "$(git branch --show-current)" != "$BRANCH" ]]; then
  echo "Wrong Git branch. Checkout the reviewed branch first; nothing deployed." >&2; exit 1
fi
if [[ "$(node -p "Number(process.versions.node.split('.')[0])")" -lt 22 ]]; then
  echo "Node.js 22 or newer is required." >&2; exit 1
fi
echo "1/5: Validating Teyza Paystack admin and service code."
npm ci --prefix services/teyza-mobile-v39 --no-audit --no-fund
npm test --prefix services/teyza-mobile-v39
npm ci --prefix tools/admin-release --omit=dev --ignore-scripts --no-audit --no-fund
npm test --prefix tools/admin-release
node --input-type=module --check < web/teyza-admin/public/js/teyza-operations.js
node --input-type=module --check < web/teyza-admin/public/js/teyza-app-admin.js
# A Git checkout intentionally excludes the Paystack environment file.
# Never redeploy an existing payment service without its monthly-plan setting.
ENV_FILE="services/teyza-mobile-v39/.env.business-lift-3c19c"
if [[ ! -f "$ENV_FILE" ]]; then
  echo "Paystack environment file is missing: $ENV_FILE" >&2
  echo "No Firebase changes were made. Restore the verified TEST or LIVE PLN_ monthly plan code in that ignored local file." >&2
  exit 1
fi
if ! grep -Eq '^TEYZA_PAYSTACK_MONTHLY_PLAN_CODE=PLN_[A-Za-z0-9]+[[:space:]]*
node tools/admin-release/node_modules/firebase-tools/lib/bin/firebase.js deploy \
  --config firebase.teyza-mobile-v39.json \
  --only functions:teyza-mobile:teyzaMobile \
  --project "$PROJECT"
echo "3/5: Verifying Paystack admin backend is live."
node - <<'NODE'
(async()=>{
 const r=await fetch('https://us-central1-business-lift-3c19c.cloudfunctions.net/teyzaMobile');
 const s=await r.json();
 for(const key of ['adminOperations','adminReview','adminUsers','adminSellerDocuments',
    'adminProductReview','adminPaystackVerify','manualReceiptsRetired']){
   if(!r.ok||s[key]!==true)throw Error('Backend health verification failed: '+key);
 }
 if(s.billingMode!=='paystack_checkout')throw Error('Backend not configured for Paystack');
 console.log('Backend Paystack admin capabilities confirmed.');
})().catch(e=>{console.error(e.message);process.exitCode=1});
NODE
echo "4/5: Publishing only admin pages/assets; preserving other website files."
node tools/admin-release/run.cjs deploy
echo "5/5: Completed. Sign out and sign in at https://teyza.co.za/admin.html"
echo "Check Product approvals and Paystack billing. Manual receipts must be absent."
 "$ENV_FILE"; then
  echo "Paystack env must include a valid TEYZA_PAYSTACK_MONTHLY_PLAN_CODE=PLN_... . No secret keys belong in this file." >&2
  exit 1
fi
echo "Checking existing Firebase Secret Manager references without printing secrets."
for name in TEYZA_PAYSTACK_SECRET_KEY TEYZA_VERIFICATION_ENCRYPTION_KEY TEYZA_GOOGLE_PLACES_KEY; do
  if ! node tools/admin-release/node_modules/firebase-tools/lib/bin/firebase.js \
      functions:secrets:get "$name" --project "$PROJECT" >/dev/null; then
    echo "Required existing Firebase secret $name is unavailable. No deployment started." >&2
    exit 1
  fi
done
echo "2/5: Deploying only the Teyza mobile backend function."
node tools/admin-release/node_modules/firebase-tools/lib/bin/firebase.js deploy \
  --config firebase.teyza-mobile-v39.json \
  --only functions:teyza-mobile:teyzaMobile \
  --project "$PROJECT"
echo "3/5: Verifying Paystack admin backend is live."
node - <<'NODE'
(async()=>{
 const r=await fetch('https://us-central1-business-lift-3c19c.cloudfunctions.net/teyzaMobile');
 const s=await r.json();
 for(const key of ['adminOperations','adminReview','adminUsers','adminSellerDocuments',
    'adminProductReview','adminPaystackVerify','manualReceiptsRetired']){
   if(!r.ok||s[key]!==true)throw Error('Backend health verification failed: '+key);
 }
 if(s.billingMode!=='paystack_checkout')throw Error('Backend not configured for Paystack');
 console.log('Backend Paystack admin capabilities confirmed.');
})().catch(e=>{console.error(e.message);process.exitCode=1});
NODE
echo "4/5: Publishing only admin pages/assets; preserving other website files."
node tools/admin-release/run.cjs deploy
echo "5/5: Completed. Sign out and sign in at https://teyza.co.za/admin.html"
echo "Check Product approvals and Paystack billing. Manual receipts must be absent."
