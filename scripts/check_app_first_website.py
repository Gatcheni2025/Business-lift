"""Check app-only registration, published metadata and real local assets."""
from pathlib import Path
from html.parser import HTMLParser
from urllib.parse import urlsplit
import json,xml.etree.ElementTree as ET
ROOT=Path(__file__).resolve().parents[1]
PUBLIC=ROOT/'web/app-first/public'
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
 page=Page();text=p.read_text();page.feed(text)
 assert page.headings==1,p.name
 assert page.meta['description'] and page.canonical.startswith('https://teyza.co.za/'),p.name
 assert page.meta.get('og:image')=='https://teyza.co.za/assets/app/social-preview.jpg'
 assert not any(s in text for s in ['data-open-register','landing-auth.js','<form','auth=register']),p.name
 for u in page.links:
  route=urlsplit(u)
  if u.startswith('/') and route.path!='/':assert (PUBLIC/route.path.lstrip('/')).exists() or route.path in ['/privacy.html','/terms.html','/data-deletion.html','/admin'],(p.name,u)
  if 'apps.apple.com' in u:raise AssertionError('Unreleased Apple listing is linked')
 if p.name=='index.html':
  assert page.schemas and 'aggregateRating' not in text
  assert 'actual' in text.lower() and 'Android early access' in text
sitemap=ET.fromstring((PUBLIC/'sitemap.xml').read_text())
urls=[e.text for e in sitemap.iter('{http://www.sitemaps.org/schemas/sitemap/0.9}loc')]
assert len(urls)==len(set(urls))==7
assert not any('register' in u or 'admin' in u for u in urls)
assert 'Sitemap: https://teyza.co.za/sitemap.xml' in (PUBLIC/'robots.txt').read_text()
for p in PUBLIC.rglob('*'):
 if p.is_file():assert p.read_bytes()==(ROOT/p.relative_to(PUBLIC)).read_bytes(),p
print('Marketing pages, links, image metadata, JSON-LD, sitemap, registration removal and root/overlay parity pass.')
