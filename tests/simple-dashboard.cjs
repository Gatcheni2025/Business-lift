const {chromium}=require('C:/Users/PC/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict');
(async()=>{
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.route('https://www.gstatic.com/**',r=>{const u=r.request().url();r.fulfill({contentType:'text/javascript',body:u.includes('firebase-auth')?'export const getAuth=()=>({});export const onAuthStateChanged=(a,cb)=>{queueMicrotask(()=>cb({uid:"test",displayName:"Test Seller",getIdToken:async()=>"test"}));return ()=>{}};export const signOut=async()=>{};':u.includes('firebase-app')?'export const getApps=()=>[];export const initializeApp=()=>({});':u.includes('firebase-functions')?'export const getFunctions=()=>({});export const httpsCallable=()=>async()=>({data:{connections:[]}});':u.includes('firebase-firestore')?'export const getFirestore=()=>({});':u.includes('firebase-storage')?'export const getStorage=()=>({});':''})});
await page.route('**/js/auth.js',r=>r.fulfill({contentType:'text/javascript',body:''}));
await page.route('**/js/live-chat-seller.js*',r=>r.fulfill({contentType:'text/javascript',body:''}));
let saved={reviewComplete:true};
await page.route('**/api/workspace.php?*',r=>{const url=new URL(r.request().url());const a=url.searchParams.get('action');if(r.request().method()==='POST')saved=JSON.parse(r.request().postData());r.fulfill({json:{ok:true,businessId:'test',business:{businessName:'My shop'},data:saved,orders:[],products:[],productReady:true,companyApproval:{status:'approved'}}})});
await page.route('**/api/chat.php*',r=>r.fulfill({json:{ok:true,threads:[]}}));
for(const width of [1440,390]){await page.setViewportSize({width,height:900});await page.goto('http://127.0.0.1:4173/dashboard.html');await page.waitForTimeout(500);await page.getByRole('tab',{name:'Orders',exact:true}).click();assert(await page.locator('#sales-panel').isVisible());await page.getByRole('tab',{name:'Chats',exact:true}).click();assert(await page.locator('#chats-panel').isVisible());assert(!await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth));await page.screenshot({path:`tests/artifacts/simple-dashboard-${width}.png`,fullPage:true});}
await page.goto('http://127.0.0.1:4173/settings.html');await page.waitForTimeout(300);assert.equal(await page.locator('.settings-row').count(),7);
for(const name of ['dashboard','payments','products','settings','orders','customers']){
 await page.goto('http://127.0.0.1:4173/'+name+'.html');
 await page.locator('[data-teyza-app-dock]').waitFor();
 assert.deepEqual(await page.locator('[data-teyza-app-dock] a').allTextContents(),['Chats','Banking','Products','Settings']);
 assert.equal(await page.locator('[data-teyza-app-dock]').count(),1);
 assert.equal(await page.locator('[data-dock="banking"]').getAttribute('href'),'payments.html');
}
await page.goto('http://127.0.0.1:4173/products.html');
await page.locator('[data-products-table-body]').getByText('No products yet.',{exact:false}).waitFor();
assert(await page.locator('[data-product-catalog]').isVisible());assert(await page.locator('[data-product-workspace]').isHidden());
await page.locator('[data-show-product-form]').click();await page.locator('[data-product-workspace]').waitFor({state:'visible'});
await page.getByRole('link',{name:'← All products',exact:true}).click();await page.locator('[data-product-catalog]').waitFor({state:'visible'});
await page.screenshot({path:'tests/artifacts/products-list-mobile.png',fullPage:true});
assert(!await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth));
// Use real page documents and the real shared guard/navigation (not iframe stubs).
await page.route('**/js/business-profile.js*',r=>r.fulfill({contentType:'text/javascript',body:''}));
await page.route('**/js/delivery-settings.js*',r=>r.fulfill({contentType:'text/javascript',body:''}));
await page.route('**/js/seller-onboarding.js*',r=>r.fulfill({contentType:'text/javascript',body:''}));
await page.route('**/js/shop-settings.js*',r=>r.fulfill({contentType:'text/javascript',body:''}));
await page.route('**/js/sales-channels*.js*',r=>r.fulfill({contentType:'text/javascript',body:''}));
await page.route('**/js/network*.js*',r=>r.fulfill({contentType:'text/javascript',body:''}));
saved={};
await page.goto('http://127.0.0.1:4173/dashboard.html');await page.waitForTimeout(500);
assert(new URL(page.url()).pathname==='/dashboard.html','Incomplete setup must not redirect dashboard');
await page.goto('http://127.0.0.1:4173/settings.html');
await page.locator('.settings-intro .simple-action').click();
for(let i=0;i<7;i++){
 await page.locator('[data-setup-next]').waitFor();
 assert.match(await page.locator('.setup-navigation strong').textContent(),new RegExp(`Step ${i+1} of 7`));
 assert.equal(page.frames().filter(frame=>frame.url().includes('127.0.0.1')&&frame!==page.mainFrame()).length,0,'No nested app pages');
 await Promise.all([page.waitForURL(url=>i===6?url.searchParams.get('reviewed')==='1':url.searchParams.get('setupStep')===String(i+1)),page.locator('[data-setup-next]').click()]);
}
await page.waitForURL('**/settings.html?reviewed=1');assert(saved.reviewComplete);assert.equal(Object.keys(saved.reviewed).length,7);
console.log('PASS: desktop/mobile layout, activity tabs, no automatic setup redirect, seven standalone setup pages and saved progress');await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
