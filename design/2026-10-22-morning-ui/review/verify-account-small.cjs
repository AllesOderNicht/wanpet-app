const {chromium}=require('playwright');const fs=require('fs');const path=require('path');const assert=require('assert/strict');
(async()=>{const browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:320,height:568},reducedMotion:'reduce'});const checks=[];
for(const screen of ['account','password','logout']){
 await page.goto(`http://127.0.0.1:4176/?embed=1&screen=${screen}`,{waitUntil:'networkidle'});await page.locator('canvas[data-cat-frame]').waitFor({state:'attached'});await page.locator('#room-art').evaluate(img=>img.decode());
 assert(await page.evaluate(()=>document.documentElement.scrollWidth===innerWidth),screen+' horizontal overflow');checks.push(screen+' 320x568 no horizontal overflow');
 await page.screenshot({path:path.join(__dirname,`small-${screen}.png`)});
 const target=screen==='password'?page.locator('#password-submit'):screen==='logout'?page.locator('[data-action="confirm-logout"]'):page.locator('[data-action="password"]');await target.scrollIntoViewIfNeeded();
 assert(await target.evaluate(el=>{const r=el.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight}),screen+' action reachable');checks.push(screen+' small-screen action reachable');
 if(screen==='password')await page.screenshot({path:path.join(__dirname,'small-password-action.png')});
}
fs.writeFileSync(path.join(__dirname,'account-small-verification.json'),JSON.stringify({date:'2026-10-22',viewport:'320x568',checks},null,2));console.log(JSON.stringify({passed:checks.length}));await browser.close();})().catch(e=>{console.error(e);process.exit(1)});
