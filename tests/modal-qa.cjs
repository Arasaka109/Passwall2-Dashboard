const {_electron}=require('C:/Users/admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const path=require('node:path'),assert=require('node:assert/strict'),fixture=require('./ui-fixture.cjs');
(async()=>{
 const root=path.resolve(__dirname,'..'),env={...process.env,PASSWALL2_DATA_DIR:path.join(root,'qa-output','modal-profile')};delete env.ELECTRON_RUN_AS_NODE;
 const app=await _electron.launch({executablePath:process.env.PASSWALL2_TEST_EXE||require('electron'),args:process.env.PASSWALL2_TEST_EXE?[]:[root],cwd:root,env});
 try{
  const page=await app.firstWindow(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.locator('#hero-title').waitFor();
  await app.evaluate(({app,shell},s)=>{const {Router}=process.mainModule.require(app.getAppPath()+'/desktop/router.cjs');Router.prototype.connect=async function(){this.client={end(){}};};Router.prototype.snapshot=async()=>s.snapshot;Router.prototype.probe=async()=>s.probe;Router.prototype.followLog=()=>{};globalThis.qaUrls=[];shell.openExternal=async url=>{globalThis.qaUrls.push(url);};},fixture());
  for(const host of ['192.168.100.2','router.lan','2001:db8::1']){const r=await page.evaluate(host=>window.desktop.invoke('connect',{host,port:22,username:'root',password:'test-only',remember:false}),host);assert.equal(r.ok,true,r.error);await page.evaluate(()=>window.desktop.invoke('webui'));}
  assert.deepEqual(await app.evaluate(()=>globalThis.qaUrls),['http://192.168.100.2/','http://router.lan/','http://[2001:db8::1]/']);
  const dismiss=async id=>{const dialog=page.locator('#'+id);await page.waitForTimeout(400);await dialog.click({position:{x:30,y:30}});assert.equal(await dialog.isVisible(),true);await page.mouse.click(6,6);assert.equal(await dialog.getAttribute('data-closing'),'true');await dialog.waitFor({state:'hidden'});};
  await page.locator('.heading-actions [data-action="settings"]').click();await dismiss('settings-dialog');
  await page.locator('[data-action="pingTool"]').click();await dismiss('ping-dialog');
  await page.locator('.node-card [data-action="chooseNode"]').click();await dismiss('node-switch-dialog');
  await page.locator('#power-button').click();await dismiss('confirm-dialog');
  await page.evaluate(()=>document.getElementById('trust-dialog').showModal());await dismiss('trust-dialog');
  await page.locator('.rules-preview').click({position:{x:25,y:18}});await page.locator('#glass-detail').waitFor();await page.waitForTimeout(500);await page.locator('[data-edit-rule]').first().click();await dismiss('rule-dialog');assert.equal(await page.locator('#glass-detail').isVisible(),true);await page.mouse.click(6,6);await page.locator('#glass-detail').waitFor({state:'hidden'});
  await page.locator('[data-action="pingTool"]').click();await page.keyboard.press('Escape');await page.locator('#ping-dialog').waitFor({state:'hidden'});
  await page.emulateMedia({reducedMotion:'reduce'});await page.locator('.node-card [data-action="chooseNode"]').click();await page.mouse.click(6,6);assert.equal(await page.locator('#node-switch-dialog').isVisible(),false);assert.deepEqual(errors,[]);
  console.log(JSON.stringify({result:'PASS',checks:['all six secondary dialogs dismiss by blurred backdrop','inside clicks keep dialog open','nested editor closes only top dialog','Escape / reduced motion','WebUI uses current IPv4, domain and bracketed IPv6 router root']},null,2));
 }finally{await app.evaluate(({app})=>app.quit());await app.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
