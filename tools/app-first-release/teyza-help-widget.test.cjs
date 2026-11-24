'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../..');
const mirror=path.join(root,'web/app-first/public');
const pages=['index.html','support.html','for-shop-owners.html',
 'seller-getting-started.html','seller-subscriptions.html',
 'register.html','how-it-works.html','download.html'];
for(const name of pages){
 test(name+' presents the same contact popup assets on root and hosting mirror',()=>{
  const a=fs.readFileSync(path.join(root,name),'utf8');
  const b=fs.readFileSync(path.join(mirror,name),'utf8');
  assert.equal(a,b,'hosting mirror must not drift from root');
  assert(a.includes('/assets/teyza-help-widget.css'));
  assert(a.includes('/assets/teyza-help-widget.js'));
  assert.equal((a.match(/teyza-help-widget\.js/g)||[]).length,1);
 });
}
test('Contact widget uses explicit approved-seller WhatsApp number and safe fallback',()=>{
 const js=fs.readFileSync(path.join(root,'assets/teyza-help-widget.js'),'utf8');
 const css=fs.readFileSync(path.join(root,'assets/teyza-help-widget.css'),'utf8');
 new Function(js);
 assert(js.includes('https://wa.me/27798261972?text=AGENT'));
 assert(js.includes('Approved sellers'));
 assert(js.includes('mailto:support@teyza.co.za'));
 assert(js.includes('not instantly'));
 assert(js.includes('rel="noopener noreferrer"'));
 assert(js.includes('aria-expanded'));
 assert(js.includes("Escape"));
 assert(css.includes('@media(max-width:500px)'));
 assert.equal(js,fs.readFileSync(path.join(mirror,'assets/teyza-help-widget.js'),'utf8'));
 assert.equal(css,fs.readFileSync(path.join(mirror,'assets/teyza-help-widget.css'),'utf8'));
});

test('Scoped publisher manages only public information pages and widget assets',()=>{
 const publisher=require('./publish-help-widget-only.cjs');
 assert.equal(publisher.paths.length,10);
 assert(publisher.paths.includes('/assets/teyza-help-widget.js'));
 assert(publisher.paths.includes('/assets/teyza-help-widget.css'));
 for(const bad of ['/pay/index.html','/ads/index.html','/work.html','/admin.html','/assets/app-first.css'])
  assert(!publisher.paths.includes(bad));
 const managed=publisher.managedFiles();
 assert.equal(managed.size,10);
 const previous=new Map([['/index.html','old'],['/pay/index.html','private-same']]);
 const after=new Map([['/index.html',managed.get('/index.html').hash],
  ['/pay/index.html','private-same'],
  ...[...managed].filter(([p])=>p!=='/index.html').map(([p,v])=>[p,v.hash])]);
 publisher.verify(previous,after,managed);
 after.set('/pay/index.html','changed-unsafe');
 assert.throws(()=>publisher.verify(previous,after,managed),/Unrelated Hosting file changed/);
});
