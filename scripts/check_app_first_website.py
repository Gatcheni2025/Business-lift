"""Check app-only registration, published metadata and real local assets."""
from pathlib import Path
from html.parser import HTMLParser
from urllib.parse import urlsplit
import json,subprocess,xml.etree.ElementTree as ET
ROOT=Path(__file__).resolve().parents[1]
PUBLIC=ROOT/'web/app-first/public'
# Local development may contain untracked, private Work backups or built bundles.
# Validate the Git-tracked website content that CI and release packaging use.
tracked_output=subprocess.check_output(
 ['git','-C',str(ROOT),'ls-files','-z','--','web/app-first/public'],
)
TRACKED_PUBLIC={ROOT/path for item in tracked_output.split(bytes([0])) if item
                for path in [Path(item.decode('utf-8'))]}
class Page(HTMLParser):
 def __init__(self):super().__init__();self.links=[];self.meta={};self.headings=0;self.schemas=[];self.in_schema=False;self.buffer='';self.canonical=None
 def handle_starttag(self,tag,attrs):
  a=dict(attrs)
  if tag in ('a','link','img','script'):
   u=a.get('src',a.get('href',''));self.links.append(u)
  if tag=='img':assert a.get('alt') and a.get('width') and a.get('height'),'Missing image accessibility/dimensions'
  if tag=='meta':self.meta[a.get('name',a.get('property'))]=a.get('content')
  if tag=='link' and a.get('rel')=='canonical':self.canonical=a.get('href')
  if tag=='h1':self.headings+=1
  if tag=='script' and a.get('type')=='application/ld+json':self.in_schema=True;self.buffer=''
 def handle_data(self,data):
  if self.in_schema:self.buffer+=data
 def handle_endtag(self,tag):
  if tag=='script' and self.in_schema:self.schemas.append(json.loads(self.buffer));self.in_schema=False
for p in PUBLIC.glob('*.html'):
 if p not in TRACKED_PUBLIC:continue
 page=Page();text=p.read_text(encoding='utf-8');page.feed(text)
 if p.name in ['work.html','owner-confirm.html','pay.html']:
  assert page.meta.get('robots')=='noindex,nofollow',p.name
  assert 'type="module"' in text,p.name
  if p.name=='pay.html':
   # Google, Facebook, Apple are the primary sign-in methods; existing
   # email-only sellers retain a collapsed, explicit legacy sign-in so that
   # they can link another provider without losing the original Firebase UID.
   assert '<details id="webLegacyAccess"' in text and 'id="webEmailForm"' in text,p.name
   assert all('id="'+value+'"' in text for value in (
       'webGoogle','webFacebook','webApple','webShopUid','webCheckout')),p.name
   assert text==(PUBLIC/'pay/index.html').read_text(encoding='utf-8'),'Pay clean-url alias has diverged'
  else:
   assert '<form' in text,p.name
  continue
 assert page.headings==1,p.name
 assert page.meta['description'] and page.canonical.startswith('https://teyza.co.za/'),p.name
 assert page.meta.get('og:image')=='https://teyza.co.za/assets/app/social-preview.jpg'
 if p.name=='seller-subscriptions.html':
  # Informational plans refer to the separate web-only /pay checkout portal.
  assert 'href="/pay"' in text
  assert 'id="webCheckout"' not in text
  assert 'seller-web-billing.mjs' not in text
  assert not any(s in text for s in ['data-open-register','landing-auth.js','auth=register']),p.name
 else:
  assert not any(s in text for s in ['data-open-register','landing-auth.js','<form','auth=register']),p.name
 for u in page.links:
  route=urlsplit(u)
  if u.startswith('/') and route.path!='/':assert (PUBLIC/route.path.lstrip('/')).exists() or route.path in ['/privacy.html','/terms.html','/data-deletion.html','/admin'],(p.name,u)
  if 'apps.apple.com' in u:assert u=='https://apps.apple.com/za/app/id6827037733',(p.name,u)
  if 'play.google.com/store/apps/details' in u:assert u=='https://play.google.com/store/apps/details?id=com.asiyedriver.asiye',(p.name,u)
 if p.name=='index.html':
  assert page.schemas and 'aggregateRating' not in text
  assert 'actual' in text.lower() and 'class="p-hero"' in text
  assert 'p-cta-band' in text and 'p-feature-grid' in text
  assert 'Field team' not in text and 'href="/agents.html"' not in text
  assert 'Get the Teyza app ↗' not in text
  assert 'https://apps.apple.com/za/app/id6827037733' in page.links
  assert 'https://play.google.com/store/apps/details?id=com.asiyedriver.asiye' in page.links
  assert 'iPhone release coming soon' not in text
 if p.name=='download.html':
  assert 'https://apps.apple.com/za/app/id6827037733' in page.links
  assert 'https://play.google.com/store/apps/details?id=com.asiyedriver.asiye' in page.links
  assert 'App Store release coming soon' not in text
sitemap=ET.fromstring((PUBLIC/'sitemap.xml').read_text(encoding='utf-8'))
urls=[e.text for e in sitemap.iter('{http://www.sitemaps.org/schemas/sitemap/0.9}loc')]
assert len(urls)==len(set(urls))==9
assert not any('/agents.html' in u or '/work-privacy.html' in u for u in urls)
assert not any(u.endswith('/work.html') or 'owner-confirm' in u for u in urls)
assert not any('register' in u or 'admin' in u for u in urls)
assert 'Sitemap: https://teyza.co.za/sitemap.xml' in (PUBLIC/'robots.txt').read_text(encoding='utf-8')
for p in PUBLIC.rglob('*'):
 if p.is_file() and p in TRACKED_PUBLIC:
  relative=p.relative_to(PUBLIC)
  # Dedicated /pay is deployed from the scoped Hosting overlay only.
  # All existing root-mirrored marketing pages remain parity checked.
  if relative==Path('pay.html') or relative.parts[0]=='pay':continue
  if relative==Path('work.html'):
   # The public app-first Work overlay is deliberately map-enabled while the
   # root Work entry is independently managed. Do not force-copy either page:
   # doing so could replace a newer React-based workspace in deployment.
   overlay=p.read_text(encoding='utf-8')
   # Validate the committed root entry rather than an uncommitted local
   # React Work replacement. The latter is not part of this PR or deployment.
   root_work=subprocess.check_output(
    ['git','-C',str(ROOT),'show','HEAD:work.html'],
   ).decode('utf-8')
   for name,page in [('overlay',overlay),('root',root_work)]:
    assert 'noindex,nofollow' in page,(name,'Work must stay private')
    assert all(marker in page for marker in ('id="google"', 'id="apple"', 'id="applyForm"')),(name,'Work sign-in or application controls missing')
    assert all(marker not in page for marker in ('id="loginForm"', 'id="signInPhone"', 'id="resetPassword"')),(name,'Legacy Work sign-in is visible')
    assert '/work-privacy.html' in page,(name,'Work privacy notice missing')
   assert '/assets/agent-map-first.css' in overlay,'Map-first Work overlay missing stylesheet'
   assert '/js/work.js' in overlay,'Map-first Work overlay missing authenticated script'
   continue
  assert p.read_bytes()==(ROOT/relative).read_bytes(),p
print('Marketing pages, links, image metadata, JSON-LD, sitemap, registration removal and root/overlay parity pass.')
