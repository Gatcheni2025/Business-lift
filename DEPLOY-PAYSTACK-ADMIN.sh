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
