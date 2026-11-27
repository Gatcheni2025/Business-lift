'use strict';
async function checkLive({fetchImpl=fetch,origin='https://teyza.co.za',log=console.log}={}){
 for(const path of ['/','/how-it-works.html','/for-shop-owners.html','/agents.html','/sitemap.xml']){
  const r=await fetchImpl(origin+path,{cache:'no-store',signal:AbortSignal.timeout(30000)});if(!r.ok)throw Error('Public page failed: '+path+' ('+r.status+')');
  if(/noindex|none/i.test(r.headers.get('x-robots-tag')||''))throw Error('A public page still blocks indexing: '+path);
  const body=await r.text();if(path.endsWith('.html')||path==='/'){if(!body.includes('rel="canonical"')||/<meta[^>]+name=["']robots["'][^>]+content=["'][^"']*noindex/i.test(body))throw Error('Unexpected public metadata: '+path);}
 }
 for(const path of ['/work.html','/owner-confirm.html','/admin']){const r=await fetchImpl(origin+path,{cache:'no-store',signal:AbortSignal.timeout(30000)});if(!r.ok||!/noindex/i.test(r.headers.get('x-robots-tag')||''))throw Error('Private page indexing protection needs checking: '+path);}
 log('Public pages permit indexing; work, owner confirmation and admin pages remain noindex. Search engines decide indexing and ranking.');return true;
}
if(require.main===module)checkLive().catch(e=>{console.error(e.message);process.exitCode=1;});module.exports={checkLive};
