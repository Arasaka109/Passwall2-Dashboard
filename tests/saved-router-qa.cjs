const {_electron}=require('C:/Users/admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{
 const root=path.resolve(__dirname,'..'),dir=path.join(root,'qa-output','saved-router-profile'),profile=path.join(dir,'connection.json'),localState=path.join(dir,'Local State');fs.mkdirSync(dir,{recursive:true});fs.copyFileSync(path.join(process.env.APPDATA,'passwall2-desktop','connection.json'),profile);fs.copyFileSync(path.join(process.env.APPDATA,'passwall2-desktop','Local State'),localState);
 const env={...process.env,PASSWALL2_DATA_DIR:dir};delete env.ELECTRON_RUN_AS_NODE;
 let app;
 try{
  app=await _electron.launch({executablePath:process.env.PASSWALL2_TEST_EXE||require('electron'),args:process.env.PASSWALL2_TEST_EXE?[]:[root],cwd:root,env});const page=await app.firstWindow();
  let ready=false;for(let i=0;i<100;i++){const r=await page.evaluate(()=>window.desktop.invoke('state'));if(r.ok&&r.data.connected&&r.data.snapshot){ready=true;break;}await page.waitForTimeout(250);}if(!ready){const info=await page.evaluate(async()=>{const s=(await window.desktop.invoke('state')).data,p=(await window.desktop.invoke('profile')).data;return {error:s.error,connected:s.connected,remember:p.remember,hasSavedPassword:p.hasSavedPassword,encryption:p.encryption};});throw Error('Auto-connect: '+JSON.stringify(info));}
  const results=[];for(const target of ['1.1.1.1','www.baidu.com']){const r=await page.evaluate(target=>window.desktop.invoke('ping',target),target);if(!r.ok){const info=await page.evaluate(async()=>{const {data}=await window.desktop.invoke('state');return {connected:data.connected,error:data.error,hasSnapshot:!!data.snapshot};});throw Error(JSON.stringify({pingError:r.error,state:info}));}assert.equal(r.data.target,target);assert.match(r.data.output,/PING|packets transmitted|unreachable|bad address|not found/i);results.push({target,reachable:r.data.ok,received:r.data.received,loss:r.data.loss});}
  console.log(JSON.stringify({result:'PASS',checks:['normal launch auto-connects saved trusted router without clicking','real router IPv4 and domain Ping (read only)'],ping:results},null,2));
 }finally{if(app){await app.evaluate(({app})=>app.quit());await app.close();}for(const file of [profile,localState])if(fs.existsSync(file))fs.unlinkSync(file);}
})().catch(e=>{console.error(e);process.exitCode=1;});
