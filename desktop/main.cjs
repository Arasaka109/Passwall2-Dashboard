const {app,BrowserWindow,ipcMain,Tray,Menu,nativeImage,screen,shell,safeStorage,dialog}=require('electron');
const path=require('node:path'),fs=require('node:fs');
const {Router,validateProfile}=require('./router.cjs');
const {classifyService}=require('./lifecycle.cjs');
const {startupOptions,readStartup,setStartup,windowsStartup}=require('./startup.cjs');
const launchOptions=startupOptions(app);
const backgroundLaunch=process.argv.includes('--background');
const portableDir=process.env.PORTABLE_EXECUTABLE_DIR;
const explicitDataDir=process.env.PASSWALL2_DATA_DIR;
if(portableDir||explicitDataDir){const dataDir=explicitDataDir||path.join(portableDir,'PassWall2-Data');fs.mkdirSync(dataDir,{recursive:true});app.setPath('userData',dataDir);}
let main,mini,tray,quitting=false,timer,probing=false,polling=false,pendingTrust=null,pendingKey=null,epoch=0;
const router=new Router();
let state={connected:false,snapshot:null,probe:null,error:null,nodeTests:{}};
router.onDisconnect=()=>{state.connected=false;state.error='SSH 连接已中断，请重新连接路由器';broadcast();};
let profile={host:'192.168.100.1',port:22,username:'root',remember:false},pins={};
let savedPasswordIdentity=null;
const profileIdentity=()=>JSON.stringify([profile.host,Number(profile.port),profile.username]);
const dataFile=()=>path.join(app.getPath('userData'),'connection.json');
function persist(secret) {
  const record={profile:{host:profile.host,port:profile.port,username:profile.username,remember:profile.remember},pins};
  if(secret&&safeStorage.isEncryptionAvailable())record.secret=safeStorage.encryptString(secret).toString('base64');
  fs.writeFileSync(dataFile(),JSON.stringify(record,null,2));
  savedPasswordIdentity=record.secret&&profile.password?profileIdentity():null;
}
function updateService(){
  if(!state.snapshot)return;
  const service=classifyService(state.snapshot,state.operation);
  if(service.status==='running')state.serviceFailure=null;
  if(service.done){state.serviceFailure=service.status==='failed'?service:null;state.operation=null;}
  state.snapshot.service=!state.operation&&service.status==='stopped'&&state.serviceFailure?state.serviceFailure:service;
}
function publicState(){return {...state,probing,window:{maximized:!!main?.isMaximized()}};}
function broadcast(){for(const w of [main,mini]) if(w&&!w.isDestroyed())w.webContents.send('state',publicState());tray?.setToolTip(`PassWall2 · ${state.connected?(state.snapshot?.service?.label||'等待状态'):'未连接'}`);}
async function poll(){if(polling||!router.client)return;polling=true;const version=epoch;try{const snapshot=await router.snapshot();if(version!==epoch)return;state.snapshot=snapshot;updateService();state.connected=true;state.error=null;if(state.logWarning)state.log=snapshot.log;}catch(e){if(version!==epoch)return;state.error=e.message;state.connected=!!router.client;}finally{polling=false;broadcast();}}
async function probe(){if(probing||!router.client)return;probing=true;broadcast();const version=epoch;try{const result=await router.probe();if(version===epoch)state.probe=result;}catch(e){if(version===epoch)state.error=e.message;}finally{probing=false;broadcast();}}
function followLog(){const version=epoch;state.log='';state.logWarning=null;router.followLog(chunk=>{if(version!==epoch)return;state.log=(state.log+chunk).slice(-131072);broadcast();},error=>{if(version!==epoch)return;state.logWarning=error.message;state.log=state.snapshot?.log||'';broadcast();});}
function windowOptions(){return {icon:path.join(__dirname,'icon.png'),webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true},backgroundColor:'#040506',autoHideMenuBar:true};}
function protect(w){w.webContents.setWindowOpenHandler(()=>({action:'deny'}));w.webContents.on('will-navigate',e=>e.preventDefault());}
function showMain(){if(main.isMinimized())main.restore();main.show();main.focus();}
function showMini(){if(!mini){const work=screen.getPrimaryDisplay().workArea;mini=new BrowserWindow({...windowOptions(),width:294,height:78,x:work.x+work.width-310,y:work.y+work.height-94,frame:false,resizable:false,skipTaskbar:true,alwaysOnTop:true});mini.loadFile(path.join(__dirname,'../ui/mini.html'));protect(mini);mini.on('closed',()=>mini=null);mini.webContents.on('did-finish-load',broadcast);}else mini.isVisible()?mini.hide():mini.show();}
const methods={
  state:()=>publicState(),
  startup:()=>process.platform==='win32'?windowsStartup(launchOptions):readStartup(app,launchOptions),
  setStartup:enabled=>process.platform==='win32'?windowsStartup(launchOptions,enabled):setStartup(app,launchOptions,enabled),
  windowControl(action){if(action==='minimize')main.minimize();else if(action==='maximize'){main.isMaximized()?main.unmaximize():main.maximize();}else if(action==='close')main.close();else throw Error('未知窗口操作');return publicState();},
  profile:()=>({...profile,password:undefined,privateKey:undefined,passphrase:undefined,hasSavedPassword:!!profile.password&&savedPasswordIdentity===profileIdentity(),encryption:safeStorage.isEncryptionAvailable()}),
  async connect(p){
    const sameHost=p.host===profile.host&&Number(p.port)===Number(profile.port)&&p.username===profile.username;
    const credentials={...p,password:p.password||(sameHost?profile.password:'')||'',privateKey:pendingKey||p.privateKey||(sameHost?profile.privateKey:undefined),passphrase:p.passphrase||(sameHost?profile.passphrase:'')};
    validateProfile(credentials);profile={...credentials,remember:!!p.remember}; const key=`${profile.host}:${profile.port}`;
    epoch++;state={connected:false,snapshot:null,probe:null,error:null,nodeTests:{}};broadcast();
    try {await router.connect(profile,pins[key]); pendingTrust=null;pendingKey=null;state.connected=true;persist(profile.remember?JSON.stringify({password:profile.password,privateKey:profile.privateKey,passphrase:profile.passphrase}):null);await poll();followLog();probe();return {connected:true};}
    catch(e){state.error=e.message;broadcast();if(e.fingerprint){pendingTrust={key,fingerprint:e.fingerprint};return {trustRequired:true,fingerprint:e.fingerprint,changed:!!pins[key]};}throw e;}
  },
  async trust(p){if(!pendingTrust||p.fingerprint!==pendingTrust.fingerprint)throw Error('指纹请求已过期');pins[pendingTrust.key]=p.fingerprint;pendingTrust=null;persist(null);return methods.connect(profile);},
  disconnect(){epoch++;router.disconnect();state.connected=false;state.snapshot=null;state.probe=null;state.nodeTests={};state.log='';state.error=null;broadcast();return true;},
  refresh:async()=>{await poll();return publicState();},
  probe:async()=>{await probe();return state.probe;},
  async ping(target){const version=epoch,result=await router.ping(target);if(version!==epoch)throw Error('路由器连接已变化，请重新检测');return result;},
  async control(action){
    if(!['start','stop','restart'].includes(action))throw Error('不支持的服务操作');
    if(state.operation||state.nodeSwitch||router.busy)throw Error('服务正在切换，请等待当前操作完成');
    state.serviceFailure=null;state.operation={action,startedAt:Date.now(),stage:'executing'};updateService();broadcast();
    try{state.snapshot=await router.control(action);state.operation.stage='verifying';updateService();broadcast();if(!state.operation)probe();return state.snapshot;}
    catch(e){state.operation.stage='verifying';state.error=e.message;updateService();broadcast();throw e;}
  },
  async nodeTest(id){const result=await router.nodeTest(id);state.nodeTests[id]=result;broadcast();return result;},
  async switchNode(input){
    if(state.operation||state.nodeSwitch||router.busy)throw Error('另一项配置或服务操作正在执行');
    state.nodeSwitch=true;broadcast();
    try{
      const result=await router.switchNode(input,async record=>{const dir=path.join(app.getPath('userData'),'node-backups');fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(path.join(dir,`${Date.now()}-node.json`),JSON.stringify(record,null,2));});
      if(!result.changed)return result;
      state.probe=null;state.nodeSwitch=false;
      if(result.restart){try{await methods.control('restart');}catch(e){throw Error('节点配置已保存，但重启未确认：'+e.message);}}
      else await poll();
      return result;
    }finally{state.nodeSwitch=false;broadcast();}
  },
  async saveRule(input){return router.saveRule(input,async record=>{const dir=path.join(app.getPath('userData'),'rule-backups');fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(path.join(dir,`${Date.now()}-${input.id}.json`),JSON.stringify(record,null,2));});},
  async chooseKey(){const result=await dialog.showOpenDialog(main,{title:'选择 SSH 私钥（仅保存在本机）',properties:['openFile']});if(result.canceled)return null;const file=result.filePaths[0];if(fs.statSync(file).size>65536)throw Error('私钥文件过大');pendingKey=fs.readFileSync(file,'utf8');return {name:path.basename(file)};},
  mini:()=>showMini(),open:()=>showMain(),hide:()=>main.hide(),
  webui:()=>{validateProfile(profile);return shell.openExternal(`http://${profile.host.includes(':')?'['+profile.host+']':profile.host}/`);},
  backups:()=>shell.openPath(path.join(app.getPath('userData'),'rule-backups')),
  async exportLogs(){const result=await dialog.showSaveDialog(main,{defaultPath:'passwall2.log'});if(!result.canceled)fs.writeFileSync(result.filePath,state.log??state.snapshot?.log??'');return !result.canceled;}
};
const lock=app.requestSingleInstanceLock();if(!lock)app.quit();else{
app.on('second-instance',(_event,argv)=>{if(main&&!argv.includes('--background'))showMain();});
app.whenReady().then(()=>{
  try{const saved=JSON.parse(fs.readFileSync(dataFile(),'utf8'));profile={...profile,...saved.profile};pins=saved.pins||{};if(saved.secret){try{Object.assign(profile,JSON.parse(safeStorage.decryptString(Buffer.from(saved.secret,'base64'))));if(profile.remember&&profile.password)savedPasswordIdentity=profileIdentity();}catch{profile.remember=false;}}}catch{}
  const area=screen.getPrimaryDisplay().workAreaSize;
  main=new BrowserWindow({...windowOptions(),show:!backgroundLaunch,frame:false,width:Math.min(1320,area.width),height:Math.min(860,area.height),minWidth:1000,minHeight:660,title:'PassWall2 · Desktop Monitor'});protect(main);main.loadFile(path.join(__dirname,'../ui/index.html'));main.on('close',e=>{if(!quitting){e.preventDefault();main.hide();}});main.on('maximize',broadcast);main.on('unmaximize',broadcast);
  tray=new Tray(nativeImage.createFromPath(path.join(__dirname,'icon.png')));tray.setContextMenu(Menu.buildFromTemplate([{label:'打开 PassWall2',click:showMain},{label:'显示 / 隐藏迷你状态条',click:showMini},{type:'separator'},{label:'退出',click:()=>{quitting=true;app.quit();}}]));tray.on('click',showMain);tray.on('double-click',showMain);broadcast();
  let ticks=0;timer=setInterval(()=>{ticks++;if(ticks%(state.operation?2:5)===0)poll();if(!state.operation&&(!state.probe||Date.now()-state.probe.time>30000))probe();},1000);
  ipcMain.handle('api',async(event,method,payload)=>{if(![main?.webContents,mini?.webContents].includes(event.sender)||!Object.hasOwn(methods,method))return {ok:false,error:'未知操作'};try{return {ok:true,data:await methods[method](payload)};}catch(e){return {ok:false,error:e.message};}});
  if(profile.remember&&(profile.password||profile.privateKey)&&pins[`${profile.host}:${profile.port}`]){
    const version=epoch;main.webContents.once('did-finish-load',()=>setTimeout(()=>{if(epoch===version)methods.connect(profile).then(result=>{if(result.trustRequired){state.error='路由器指纹已变化，请打开连接设置重新核对';broadcast();}}).catch(e=>{state.error='自动连接失败：'+e.message;broadcast();});},backgroundLaunch?5000:500));
  }
});
app.on('before-quit',()=>{quitting=true;clearInterval(timer);router.disconnect();});
}
