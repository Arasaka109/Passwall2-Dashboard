// Local app integration QA. Only connection, snapshots and log streaming; no router writes.
const fs=require('node:fs'),path=require('node:path'),readline=require('node:readline'),assert=require('node:assert/strict');
const {_electron}=require('C:/Users/admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
if(process.stdin.isTTY)process.stdin.setRawMode(true);
console.log('Ready for connection JSON on stdin (input hidden)');
const input=readline.createInterface({input:process.stdin,terminal:false});
input.once('line',async line=>{
  input.close();let electron;
  try{
    const credentials=JSON.parse(line),root=path.resolve(__dirname,'..'),out=path.join(root,'qa-output'),data=path.join(out,'live-profile');
    const saved=JSON.parse(fs.readFileSync(path.join(root,'release/PassWall2-Data/connection.json'),'utf8'));
    fs.mkdirSync(data,{recursive:true});fs.writeFileSync(path.join(data,'connection.json'),JSON.stringify({profile:{host:credentials.host,port:credentials.port,username:credentials.username,remember:false},pins:saved.pins}));
    const env={...process.env,PASSWALL2_DATA_DIR:data};delete env.ELECTRON_RUN_AS_NODE;
    electron=await _electron.launch({executablePath:process.env.PASSWALL2_TEST_EXE||require('electron'),args:process.env.PASSWALL2_TEST_EXE?[]:[root],cwd:root,env});
    const page=await electron.firstWindow();await page.waitForLoadState('domcontentloaded');
    const result=await page.evaluate(async p=>window.desktop.invoke('connect',{...p,remember:false}),credentials);assert.equal(result.ok,true);assert.equal(result.data.connected,true);
    await page.locator('#service-title').filter({hasText:'运行中'}).waitFor();
    await page.locator('#hero-title').filter({hasText:/连接畅通|外网探测异常/}).waitFor({timeout:25000});
    await page.screenshot({path:path.join(out,'dashboard-live.png')});
    await page.locator('.rail-button[data-view="rules"]').click();assert.match(await page.locator('#rule-pagination').innerText(),/11 项/);
    const paging=await page.locator('#rule-pagination').innerText();await page.locator('[data-page-kind="rule"][data-direction="1"]').click();assert.notEqual(await page.locator('#rule-pagination').innerText(),paging);
    await page.screenshot({path:path.join(out,'rules-live.png')});
    await page.locator('.rail-button[data-view="logs"]').click();await page.screenshot({path:path.join(out,'logs-live.png')});
    const stateResult=await page.evaluate(()=>window.desktop.invoke('state'));assert.equal(stateResult.data.snapshot.service.status,'running');assert.equal(stateResult.data.snapshot.runtime.defaultRunning,true);
    const savedAfter=JSON.parse(fs.readFileSync(path.join(data,'connection.json'),'utf8'));assert.equal(savedAfter.secret,undefined);
    console.log(JSON.stringify({result:'PASS',service:stateResult.data.snapshot.service.status,processDetected:true,rules:stateResult.data.snapshot.rules.length,credentialsSaved:false,routerChanges:false}));
  }catch(e){console.error(e.message);process.exitCode=1;}finally{if(electron){await electron.evaluate(({app})=>app.quit());await electron.close();}}
});
