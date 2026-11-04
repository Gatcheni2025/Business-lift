'use strict';
// Screenshots and real-device-size overflow checks; local static files only.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium}=require('../admin-release/node_modules/playwright');
const root=path.resolve(__dirname,'../../web/app-first/public'),dir=path.resolve(__dirname,'../../premium-site-previews');
const mime={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'application/javascript','.svg':'image/svg+xml','.webp':'image/webp','.jpg':'image/jpeg'};
const server=http.createServer((req,res)=>{
 try{
  const p=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
  const filename=path.resolve(root,'.'+(p==='/'?'/index.html':p));
  if(!filename.startsWith(root+path.sep))throw Error('Forbidden');
  res.writeHead(200,{'Content-Type':mime[path.extname(filename)]||'application/octet-stream'});
  res.end(fs.readFileSync(filename));
 }catch(e){res.writeHead(404);res.end('Not found')}
});
async function main(){
 fs.mkdirSync(dir,{recursive:true});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const browser=await chromium.launch({headless:true});
 try{
  const host='http://127.0.0.1:'+server.address().port;
  for(const [pagePath,file,width,height] of [
   ['/','home-desktop.png',1365,900],['/','home-mobile.png',390,844],
   ['/download.html','download-mobile.png',390,844],
   ['/for-shop-owners.html','business-desktop.png',1365,900],
   ['/seller-subscriptions.html','seller-plans-mobile.png',390,844]
  ]){
   const page=await browser.newPage({viewport:{width,height},reducedMotion:'reduce'});
   const errors=[];page.on('pageerror',e=>errors.push(e.message));
   const res=await page.goto(host+pagePath,{waitUntil:'load'});
   if(res.status()!==200)throw Error(pagePath+' HTTP '+res.status());
   const layout=await page.evaluate(()=>{
    const el=document.documentElement;
    return {viewport:innerWidth,scrollWidth:el.scrollWidth,h1:document.querySelectorAll('h1').length,
      fieldLinks:[...document.querySelectorAll('a')].filter(x=>/Field team|Vacancy/i.test(x.textContent)).length};
   });
   if(errors.length||layout.h1!==1||layout.fieldLinks||layout.scrollWidth>layout.viewport+4){
    throw Error(file+': '+JSON.stringify({errors,...layout}));
   }
   if(pagePath==='/' && await page.locator('[data-teyza-demo][data-enhanced="true"]').count()!==1)
     throw Error('Homepage interactive app preview did not load');
   if(width<500){
    await page.locator('.p-mobile-nav summary').click();
    if(!await page.getByRole('navigation',{name:'Mobile navigation'}).isVisible())
      throw Error('Mobile menu did not open on '+pagePath);
    await page.locator('.p-mobile-nav summary').click();
   }
   await page.screenshot({path:path.join(dir,file),fullPage:true,animations:'disabled'});
   console.log('Passed '+file+': no script error, no overflow, accessible mobile navigation');
   await page.close();
  }
 }finally{await browser.close();server.close();}
}
main().catch(e=>{server.close();console.error(e);process.exitCode=1});
