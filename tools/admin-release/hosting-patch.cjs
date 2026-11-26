'use strict';
const fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib'),crypto=require('node:crypto');
const {PROJECT}=require('./firebase-client.cjs');
const SITE=PROJECT,BASE='sites/'+SITE;
const aliases=['/admin.html','/admin-review.html','/admin-sellers.html','/admin-login.html','/admin-dashboard.html','/admin/index.html','/admin-payments.html','/admin-support.html','/admin-users.html'];
const assets=['/assets/teyza-app-admin.css','/assets/teyza-map-first.css','/assets/teyza-southern-africa-land.geojson','/js/teyza-app-admin.js','/js/teyza-app-admin-model.mjs','/js/teyza-app-admin-firebase.mjs','/js/teyza-operations.js','/js/teyza-mandate-pdf.mjs','/js/teyza-operations-model.mjs','/js/teyza-field-admin.js','/js/teyza-admin-map.mjs','/js/teyza-premium-coverage.mjs','/js/teyza-combined-coverage.mjs'];
// Optional, explicitly scoped release of only the reviewed marketplace pages.
const workPaths=['/agents.html','/work.html','/owner-confirm.html','/assets/teyza-agents-map-first.css','/assets/work.css','/js/work.js','/js/owner-confirm.js'];
const supportPaths=['/support-inbox.html','/js/teyza-support-inbox.js','/assets/teyza-support-inbox.css'];
const MAP_CONFIG='/assets/teyza-maps-config.json';
const overlayPaths=new Set([...aliases,...assets,MAP_CONFIG]);
function overlay(root,{workRoot=null}={}){
 const files=new Map();
 for(const publicPath of [...aliases,...assets]){
  const source=aliases.includes(publicPath)?'admin.html':publicPath.slice(1);
  const bytes=zlib.gzipSync(fs.readFileSync(path.join(root,source)),{level:9});
  files.set(publicPath,{hash:crypto.createHash('sha256').update(bytes).digest('hex'),bytes});
 }
 if(workRoot){
  for(const [sourceRoot,paths] of [[root,supportPaths],[workRoot,workPaths]]){
   for(const p of paths){
    const bytes=zlib.gzipSync(fs.readFileSync(path.join(sourceRoot,p.slice(1))),{level:9});
    files.set(p,{hash:crypto.createHash('sha256').update(bytes).digest('hex'),bytes});
   }
  }
 }
 // A browser key is public by nature; Google Cloud MUST restrict it to the site
 // HTTP referrers and only Maps JavaScript/Geocoding APIs. Never use a Places server key.
 const key=(process.env.TEYZA_MAPS_BROWSER_KEY||'').trim();
 if(key){
  if(!/^AIza[A-Za-z0-9_-]{30,80}$/.test(key))throw Error('Invalid browser-restricted Google Maps key configuration.');
  const bytes=zlib.gzipSync(Buffer.from(JSON.stringify({browserKey:key})+'\n','utf8'),{level:9});
  files.set(MAP_CONFIG,{hash:crypto.createHash('sha256').update(bytes).digest('hex'),bytes});
 }
 return files;
}
function servingConfig(original,{marketplace=false}={}){
 const config=structuredClone(original||{}),routes=['/admin','/admin/','/admin/**'];
 config.redirects=(config.redirects||[]).filter(r=>!routes.includes(r.glob)&&!aliases.includes(r.glob));
 config.rewrites=[{glob:'/admin',path:'/admin.html'},{glob:'/admin/**',path:'/admin.html'},
  ...(config.rewrites||[]).filter(r=>!routes.includes(r.glob))];
 // Retain unrelated headers. Admin routes require an origin Referer for Google Maps\n // browser-key authorization; never use no-referrer for these routes.\n // strict-origin-when-cross-origin sends only the site origin to Google.\n // Replace stale Admin-specific entries inherited from previous releases.
 const managedGlobs=['/admin{,/**,.html,-review.html,-sellers.html,-login.html,-dashboard.html,-payments.html,-support.html,-users.html}','/js/teyza-app-admin*','/js/teyza-operations*','/js/teyza-mandate-pdf.mjs','/js/teyza-field-admin.js','/js/teyza-admin-map.mjs','/js/teyza-premium-coverage.mjs','/js/teyza-combined-coverage.mjs','/assets/teyza-maps-config.json','/assets/teyza-app-admin.css','/assets/teyza-map-first.css','/assets/teyza-southern-africa-land.geojson'];
 config.headers=[...(config.headers||[]).filter(h=>!managedGlobs.includes(h.glob)),
  ...['/admin{,/**,.html,-review.html,-sellers.html,-login.html,-dashboard.html,-payments.html,-support.html,-users.html}','/js/teyza-app-admin*','/js/teyza-operations*','/js/teyza-mandate-pdf.mjs','/js/teyza-field-admin.js','/js/teyza-admin-map.mjs','/js/teyza-premium-coverage.mjs','/js/teyza-combined-coverage.mjs','/assets/teyza-maps-config.json','/assets/teyza-app-admin.css','/assets/teyza-map-first.css','/assets/teyza-southern-africa-land.geojson'].map(glob=>({glob,headers:{
   'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'strict-origin-when-cross-origin','X-Robots-Tag':'noindex, nofollow'}}))];
 if(marketplace){
  // Retain existing settings on unrelated routes. Private pages must never
  // become indexed, including the independent staff sign-in.
  const privatePaths=['/support-inbox.html','/work.html','/owner-confirm.html'];
  for(const glob of privatePaths){
   const existing=config.headers.find(x=>x.glob===glob);
   if(existing)Object.assign(existing.headers,{'Cache-Control':'no-store','X-Robots-Tag':'noindex, nofollow'});
   else config.headers.push({glob,headers:{'Cache-Control':'no-store','X-Robots-Tag':'noindex, nofollow','X-Content-Type-Options':'nosniff','Referrer-Policy':'strict-origin-when-cross-origin'}});
  }
 }
 return config;
}
async function allFiles(client,version){
 const rows=new Map();let token;
 do{const result=await client.hosting('GET','/'+version+'/files',undefined,{status:'ACTIVE',pageSize:1000,...(token?{pageToken:token}:{})});
  for(const f of result.files||[])rows.set(f.path,f.hash);token=result.nextPageToken;
 }while(token);return rows;
}
function preserved(before,after,files){
 for(const [p,hash] of before)if(!files.has(p)&&after.get(p)!==hash)throw new Error('Existing website file was not preserved: '+p);
 for(const [p,file] of files)if(after.get(p)!==file.hash)throw new Error('Admin file was not verified: '+p);
 if(after.size!==new Set([...before.keys(),...files.keys()]).size)throw new Error('Unexpected Hosting file count.');
}
function versionName(name){
 const clean=String(name||'').replace(/^projects\/(?:-|business-lift-3c19c)\//,'');
 if(!/^sites\/business-lift-3c19c\/versions\/[A-Za-z0-9_-]+$/.test(clean))throw new Error('Unexpected Hosting version or project.');
 return clean;
}
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function clone(client,source,wait=pause){
 let result=await client.hosting('POST','/'+BASE+'/versions:clone',{sourceVersion:source,finalize:false});
 const operation=result.name;
 if(!operation)throw new Error('Hosting did not return a clone operation.');
 const started=Date.now();
 while(!result.done){if(Date.now()-started>300000)throw new Error('Hosting clone timed out; the live website was not changed.');
  await wait(1000);result=await client.hosting('GET','/'+operation.replace(/^\//,''));}
 if(result.error)throw new Error(result.error.message||'Hosting clone failed.');
 return versionName(result.response?.name);
}
async function current(client,channel='live'){
 const r=await client.hosting('GET','/'+BASE+'/channels/'+channel);
 return versionName(r.release?.version?.name);
}
async function patch({client,root,workRoot=null,backupPath,wait=pause,log=console.log}){
 const domain=await client.hosting('GET','/projects/'+PROJECT+'/sites/'+SITE+'/customDomains/teyza.co.za');
 if(!domain.name?.endsWith('/customDomains/teyza.co.za'))throw new Error('teyza.co.za is not attached to the expected Firebase Hosting site.');
 const source=await current(client),original=await client.hosting('GET','/'+source),before=await allFiles(client,source),files=overlay(root,{workRoot});
 if(!before.has('/index.html'))throw new Error('The live version has no index.html. Stopping before changing Hosting.');
 if(workRoot){
  for(const p of ['/assets/teyza-sprout-wordmark.svg','/assets/app/wordmark.svg','/assets/app/wordmark-light.svg','/assets/app/spaza-owner.webp','/assets/app/icon.svg','/assets/app-first.css','/assets/agent-map-first.css','/js/work-auth.mjs','/js/work-phone.mjs','/js/work-discovery.mjs']){
   if(!before.has(p))throw Error('Required existing website dependency missing: '+p);
  }
 }
 const config=servingConfig(original.config,{marketplace:!!workRoot}),version=await clone(client,source,wait);
 // A local rollback record contains version metadata only; never tokens or seller evidence.
 const backup={release:workRoot?'marketplace-v61':'R327-premium-netcash',site:SITE,sourceVersion:source,patchedVersion:version,createdAt:new Date().toISOString(),oldConfig:original.config};
 const checkpoint=backupPath.replace(/\.json$/, '-'+version.split('/').at(-1)+'.json');
 fs.writeFileSync(checkpoint,JSON.stringify(backup,null,2),{mode:0o600});
 log('Cloned the active website. Uploading '+files.size+' admin files.');
 await client.hosting('PATCH','/'+version,{config},{updateMask:'config'});
 const population=await client.hosting('POST','/'+version+':populateFiles',{files:Object.fromEntries([...files].map(([p,f])=>[p,f.hash]))});
 const byHash=new Map([...files.values()].map(f=>[f.hash,f]));
 for(const hash of population.uploadRequiredHashes||[]){
  if(!byHash.has(hash))throw new Error('Hosting requested an unexpected file.');
  await client.upload(population.uploadUrl+'/'+hash,byHash.get(hash).bytes);
 }
 preserved(before,await allFiles(client,version),files);
 const configured=await client.hosting('GET','/'+version);
 if(JSON.stringify(configured.config)!==JSON.stringify(config)){
  // Protobuf servers can omit empty arrays or reorder object keys.
  const canonical=v=>JSON.stringify(v,(k,val)=>val&&typeof val==='object'&&!Array.isArray(val)?Object.fromEntries(Object.entries(val).sort()):val);
  const normal=v=>{const c=structuredClone(v);for(const key of ['redirects','rewrites','headers'])if(!c[key]?.length)delete c[key];return c;};
  if(canonical(normal(configured.config))!==canonical(normal(config)))throw new Error('Hosting configuration did not match the reviewed admin overlay.');
 }
 await client.hosting('PATCH','/'+version,{status:'FINALIZED'},{updateMask:'status'});
 // Refuse to overwrite a newer deployment published while this overlay was prepared.
 if(await current(client)!==source)throw new Error('The live website changed during preparation. Nothing was published. Run DEPLOY-ADMIN again to use the new live version.');
 const release=await client.hosting('POST','/'+BASE+'/channels/live/releases',{message:workRoot?'Teyza marketplace v61 Admin, Agents and Work branding':'Teyza scoped Admin update'},{versionName:version});
 if(await current(client)!==version)throw new Error('Hosting did not confirm the new live version. Check Firebase Hosting before retrying.');
 backup.releaseName=release.name;backup.publishedAt=new Date().toISOString();fs.writeFileSync(backupPath,JSON.stringify(backup,null,2),{mode:0o600});
 log((workRoot?'Marketplace Admin and Work published':'Admin published')+': https://teyza.co.za/admin · '+(before.size-[...before.keys()].filter(p=>overlayPaths.has(p)).length)+' existing files preserved.');
 return backup;
}
async function rollback({client,backupPath,log=console.log}){
 const b=JSON.parse(fs.readFileSync(backupPath,'utf8'));
 if(b.site!==SITE)throw new Error('Rollback belongs to another site.');
 const source=versionName(b.sourceVersion),patched=versionName(b.patchedVersion);
 if(await current(client)!==patched)throw new Error('A different website release is live. Stopping so that a newer deployment is not overwritten.');
 await client.hosting('POST','/'+BASE+'/channels/live/releases',{message:'Restore website before R3.16 admin overlay'},{versionName:source});
 log('Restored the website version that preceded this admin update.');
}
module.exports={SITE,BASE,aliases,assets,workPaths,supportPaths,overlayPaths,overlay,servingConfig,allFiles,preserved,versionName,patch,rollback};
