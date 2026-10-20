# TEYZA — Simplified Spaza Shop onboarding and R99 monthly activation

## Purpose
Keep the **Spaza Shop** flow much shorter than wholesale and retail registration.

The old dashboard popup had an embedded copy of `business-profile.html`, a proof-of-address demand and unwanted delivery/banking steps. A first-time Spaza owner now gets a separate full-page registration by signing up at `index.html`, choosing Spaza Shop and completing the form at `business-profile.html?setup=spaza`.

## Fields
- Shop name, verified cellphone number (Firebase OTP), street address and confirmed map pin
- One shop photo (JPG or PNG, max 5 MB)
- Owner's SA ID / passport and camera-captured selfie with consent (private admin review)
- Optional company registration number, **not** required for informal traders
- Proof of address **not** required for Spaza owners (still required for other retail / wholesale accounts)
- Admin verifies submitted identity; a selfie capture is *not* a certified biometric face match or liveness check

After submitting, the user can visit `seller-activation.html` to request the **Basic R99/month** listing. The form does **not** request bank account details.

## Safe hosted debit order (critical)
1. Seller saves their public-listing consent and requests `basic` via `seller-subscription` API.
2. Create a **unique seller-specific hosted mandate URL** inside the chosen South African recurring debit-order provider's dashboard.
3. Configure server environment variable `TEYZA_MANDATE_ALLOWED_HOSTS`, e.g. just the exact provider host(s) separated by commas. Do **not** set it to a public URL; do **not** use wildcard hosts.
4. A Teyza admin goes to the seller's review card and clicks **Assign R99 debit-order link**, pasting the generated HTTPS link. The server checks the domain allowlist and stores only that link privately.
5. Seller opens the link in the provider's secure checkout; **all banking, mandate authentication, debit-date selection and future cancellations happen with the provider**. Teyza saves no debit-order bank numbers from this onboarding.
6. Seller account status remains pending until the provider has confirmed the mandate and funds/payment are independently verified and Teyza admin uses existing payment activation process.

**Provider integration is not configured by this repository change.** No payment is collected or activated automatically by clicking the link, and the presence of a mandate URL alone does not prove an authorised debit order or first payment. Do not request bank details through email or WhatsApp.

## Backwards compatibility
- Previously approved Spaza accounts continue to be sell-ready without a newly required shop photo field.
- Existing product/catalogue/payment and buyer data are untouched.
- Retail and wholesale accounts retain enhanced verification and their separate dashboards.
- Bank settlement preferences in `payments.html` are *not* the same as authorising Teyza's monthly collection.

## Deployment
1. Wait for the green GitHub Actions `Teyza Shopper APK` run on `feature/teyza-spaza-simplified-onboarding-r99`.
2. In Artifacts download `teyza-spaza-simplified-onboarding-website`.
3. Backup the actual `teyza.co.za` live `public_html` and private data paths before extracting to the folder with `index.html`; do not just upload an unextracted ZIP.
4. Extract with replacement, preserving untouched files like `api/teyza-firebase-verify.php`, `js/firebase-config.js`, any private user files and `uploads`.
5. Verify: spaza signup → full-page quick setup (no iframe) → shop photo → OTP → map address → ID/passport and camera selfie → R99 activation request → admin review → secure link when configured.
6. Test denied camera permission, incorrect OTP, absent location service, unconfigured provider, and unsubscribed seller.
7. Verify retailer/wholesaler advanced registration and existing approved shops still work.

**Do not launch recurring bank debits until your PSP contract, recurring mandate disclosures, consent, payment confirmation, POPIA practices and cancellation process are finalised.**
