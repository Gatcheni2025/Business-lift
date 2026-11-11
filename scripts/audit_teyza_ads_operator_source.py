"""Exact-byte operator fingerprint gate for independently hosted Teyza Ads.

Owner approval is not a third-party malware verdict or a payment-release grant.
"""
from pathlib import Path
from hashlib import sha256
import json
import re

ROOT=Path(__file__).resolve().parents[1]
approval=json.loads((ROOT/'docs/TEYZA_ADS_OPERATOR_SOURCE_APPROVAL_20261111.json').read_text(encoding='utf8'))
assert approval['policyVersion']=='teyza-ads-operator-source-approval-v1'
assert approval['approvalType']=='authorised_project_owner_and_operator'
assert approval['decision']=='approved' and approval['operatorApprovalPr']==149
assert approval['waivesExternalThirdPartyMalwareVerdict'] is True
assert approval['externalAnalystVerdict']=='not_received'
assert approval['lineEndingEquivalenceVerified'] is True
assert approval['approvedSha256Representation']=='Canonical Git checkout LF UTF-8'
files={f['file']:f for f in approval['approvedFiles']}
assert set(files)=={
 'web/app-first/public/ads/index.html',
 'web/app-first/public/js/ads-web-billing.mjs',
}
paths=json.loads((ROOT/'tools/app-first-release/paths.json').read_text(encoding='utf8'))
assert '/ads/index.html' in paths and '/js/ads-web-billing.mjs' in paths, 'Hosted advertiser pages are not included in the scoped release overlay'
for name,item in files.items():
 content=(ROOT/name).read_bytes()
 assert b'\\r' not in content, 'Canonical source line endings changed: '+name
 assert re.fullmatch(r'[a-f0-9]{64}',item['sha256'])
 assert sha256(content).hexdigest()==item['sha256'], 'Unapproved source change: '+name
 assert sha256(content.replace(b'\\n',b'\\r\\n')).hexdigest()==item['windowsCrLfSha256'], 'CRLF equivalence changed: '+name
 mirror=ROOT/name.removeprefix('web/app-first/public/')
 assert content==mirror.read_bytes(), 'Public root mirror differs: '+name
 print('Operator-approved exact LF SHA-256',name,item['sha256'])
js=(ROOT/'web/app-first/public/js/ads-web-billing.mjs').read_text(encoding='utf8')
html=(ROOT/'web/app-first/public/ads/index.html').read_text(encoding='utf8')
normalized=re.sub(r'\\s+','',js.lower())
for token in ('eval(', 'newfunction(', 'document.write(', 'child_process', 'javascript:', 'data:text/html'):
 assert token not in normalized, 'Potentially unsafe browser source token: '+token
for required in ('https://us-central1-business-lift-3c19c.cloudfunctions.net/teyzaMobile',
 'checkout.paystack.com', 'confirmedSellerUid:uid', "checkoutChannel:'website'",
 'validAdPrice(', 'validAdReference(', 'firebasejs/12.17.1/firebase-auth.js'):
 assert required in js, 'Required website payment guard missing: '+required
assert '/js/ads-web-billing.mjs' in html and 'id="checkout" disabled' in html
assert 'paymentConsent' in html and 'ownerConsent' in html
assert not any(key in js for key in ('sk_live_', 'sk_test_', 'TEYZA_PAYSTACK_SECRET_KEY'))
dart=(ROOT/'apps/teyza_shopper/lib/teyza_ads_page.dart').read_text(encoding='utf8')
assert 'ads_checkout' not in dart and 'checkout.paystack.com' not in dart
assert 'teyza.co.za/ads' not in dart, 'Store mobile app must not link to website checkout'
print('Ads website fingerprint gate PASS; no external malware verdict claimed, and live Paystack enablement remains separate.')
