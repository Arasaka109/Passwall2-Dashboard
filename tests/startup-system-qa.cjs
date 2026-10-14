const {_electron}=require('C:/Users/admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const path=require('node:path'),assert=require('node:assert/strict'),{windowsStartup}=require('../desktop/startup.cjs');
(async()=>{
 const root=path.resolve(__dirname,'..'),executable=path.join(process.env.LOCALAPPDATA,'Programs','PassWall2 Monitor','PassWall2 Monitor.exe'),options={name:'PassWall2Monitor',path:executable,args:['--background']},previous=windowsStartup(options),env={...process.env,PASSWALL2_DATA_DIR:path.join(root,'qa-output','startup-system-profile')};delete env.ELECTRON_RUN_AS_NODE;
 let app;try{
  app=await _electron.launch({executablePath:executable,args:[],env,cwd:root});const page=await app.firstWindow();await page.locator('#hero-title').waitFor();await page.locator('.heading-actions [data-action="settings"]').click();await page.locator('#launch-at-login:not(:disabled)').waitFor();
  assert.equal(await page.locator('#launch-at-login').isChecked(),previous.enabled);await page.locator('#launch-at-login').setChecked(!previous.enabled);await page.locator('#launch-at-login:not(:disabled)').waitFor();assert.equal(await page.locator('#launch-at-login').isChecked(),!previous.enabled);assert.equal(windowsStartup(options).enabled,!previous.enabled);
  await page.locator('[data-close="settings-dialog"]').click();await page.locator('#settings-dialog').waitFor({state:'hidden'});await page.locator('.heading-actions [data-action="settings"]').click();await page.locator('#launch-at-login:not(:disabled)').waitFor();assert.equal(await page.locator('#launch-at-login').isChecked(),!previous.enabled);assert.doesNotMatch(await page.locator('#toast').innerText(),/失败|异常/);
  console.log(JSON.stringify({result:'PASS',checks:['installed EXE real startup checkbox changes Windows Run entry','reopened settings retains checked state','original preference restored after QA']},null,2));
 }finally{windowsStartup(options,previous.enabled);if(app){await app.evaluate(({app})=>app.quit());await app.close();}}
})().catch(e=>{console.error(e);process.exitCode=1;});
