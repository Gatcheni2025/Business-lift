#!/usr/bin/env bash
# Safely deploy ONLY the Teyza Paystack product-approval backend and admin pages.
set -Eeuo pipefail
cd "$(dirname "$0")"
PROJECT=business-lift-3c19c
BRANCH=feat/teyza-free-signup-paystack-products-promotion-20261104

if [[ ! -f web/teyza-admin/public/admin.html || ! -f firebase.teyza-mobile-v39.json ]]; then
  echo "Run from the Teyza Git checkout root. Nothing changed." >&2; exit 1
fi
if [[ "$(git branch --show-current)" != "$BRANCH" ]]; then
  echo "Checkout the reviewed feature branch first. Nothing changed." >&2; exit 1
fi
if ! command -v node >/dev/null || [[ "$(node -p 'Number(process.versions.node.split(".")[0])')" -lt 22 ]]; then
  echo "Node.js >=22 is required. Nothing changed." >&2; exit 1
fi

echo "1/5: Test admin and backend without touching Firebase."
npm ci --prefix services/teyza-mobile-v39 --no-audit --no-fund
npm test --prefix services/teyza-mobile-v39
npm ci --prefix tools/admin-release --omit=dev --ignore-scripts --no-audit --no-fund
npm test --prefix tools/admin-release
node --input-type=module --check < web/teyza-admin/public/js/teyza-operations.js
node --input-type=module --check < web/teyza-admin/public/js/teyza-app-admin.js

# This ignored .env is required by the existing Firebase Function. Without
# it an otherwise successful redeployment would erase the monthly plan code.
ENV_FILE=services/teyza-mobile-v39/.env.business-lift-3c19c
if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing $ENV_FILE. Restore verified Paystack plan code before deployment." >&2
  echo "Nothing changed in Firebase." >&2; exit 1
fi
if ! grep -Eq '^TEYZA_PAYSTACK_MONTHLY_PLAN_CODE=PLN_[A-Za-z0-9]+[[:space:]]*$' "$ENV_FILE"; then
  echo "Expected TEYZA_PAYSTACK_MONTHLY_PLAN_CODE=PLN_... in the ignored project .env." >&2
  echo "Never paste Paystack secret keys into this file or the chat." >&2; exit 1
fi

echo "Checking three existing Firebase Secret Manager references (without printing values)."
for name in TEYZA_PAYSTACK_SECRET_KEY TEYZA_VERIFICATION_ENCRYPTION_KEY TEYZA_GOOGLE_PLACES_KEY; do
  if ! node tools/admin-release/node_modules/firebase-tools/lib/bin/firebase.js \
      functions:secrets:get "$name" --project "$PROJECT" >/dev/null; then
    echo "Missing existing Firebase Secret Manager entry: $name. Nothing deployed." >&2
    exit 1
  fi
done

echo "2/5: Deploy only the existing teyza-mobile:teyzaMobile function."
node tools/admin-release/node_modules/firebase-tools/lib/bin/firebase.js deploy \
  --config firebase.teyza-mobile-v39.json \
  --only functions:teyza-mobile:teyzaMobile \
  --project "$PROJECT"

echo "3/5: Verify live backend Paystack-admin capabilities before touching Hosting."
node - <<'NODE'
(async()=>{
  const r=await fetch('https://us-central1-business-lift-3c19c.cloudfunctions.net/teyzaMobile');
  if(!r.ok)throw Error('Teyza mobile backend health request failed');
  const s=await r.json();
  for(const key of ['adminOperations','adminReview','adminUsers','adminSellerDocuments',
    'adminProductReview','adminPaystackVerify','manualReceiptsRetired',
    'adminPhonePrecheck','adminComplimentaryAccess','physicalGoodsPaystack','sellerPaystackSubaccounts']){
    if(s[key]!==true)throw Error('Missing Paystack admin backend capability: '+key);
  }
  if(s.billingMode!=='paystack_checkout')throw Error('Paystack billing mode is not enabled');
  console.log('Verified Paystack admin backend. TEST payments cannot unlock live product selling.');
})().catch(e=>{console.error(e.message);process.exitCode=1});
NODE

echo "4/5: Clone live Hosting and publish ONLY admin aliases and admin CSS/JS."
node tools/admin-release/run.cjs deploy
echo "5/5: Admin update published. Sign out/in at https://teyza.co.za/admin.html"
echo "Check Product approvals, Paystack billing and the absence of manual receipts."
