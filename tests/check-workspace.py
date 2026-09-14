from pathlib import Path
import subprocess,json
from html.parser import HTMLParser
from urllib.parse import urlsplit,unquote
class Page(HTMLParser):
 def __init__(self,s):super().__init__();self.links=[];self.ids=[];self.sheets=[];self.feed(s)
 def handle_starttag(self,tag,attrs):
  a=dict(attrs)
  if 'id' in a:self.ids.append(a['id'])
  if tag=='a' and 'href' in a:self.links.append(a['href'])
  if tag=='link' and a.get('rel')=='stylesheet' and not a.get('href','').startswith('https:'):self.sheets.append(a.get('href'))
pages=json.loads(Path('ui/pages.json').read_text())
for name in pages:
 p=Page(Path(name+'.html').read_text(encoding='utf-8'))
 assert len(p.ids)==len(set(p.ids)),(name,'duplicate IDs')
 assert p.sheets==['assets/workspace.css?v=2'],(name,p.sheets)
 for href in p.links:
  u=urlsplit(href)
  if u.scheme or u.netloc:continue
  target=Path(u.path or name+'.html');assert target.exists(),(name,href)
  if u.fragment:assert unquote(u.fragment) in Page(target.read_text(encoding='utf-8')).ids,(name,'missing anchor',href)
print('PASS: all workspace stylesheets, IDs, local links and anchor destinations')
for p in list(Path('js').glob('*.js'))+[Path('assets/workspace.js')]+list(Path('functions').glob('*.js')):
 result=subprocess.run(['node','--check',str(p)],capture_output=True,text=True)
 assert result.returncode==0,(str(p),result.stderr)
print('PASS: all browser and server JavaScript syntax')
