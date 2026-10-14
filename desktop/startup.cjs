const path=require('node:path');
function startupOptions(app,env=process.env,execPath=process.execPath,platform=process.platform){
  const portable=env.PORTABLE_EXECUTABLE_FILE,project=app.isPackaged?null:app.getAppPath?.();
  const executable=portable||(app.isPackaged||project?execPath:null);
  if(platform!=='win32'||!executable||!path.isAbsolute(executable))return null;
  if(!portable&&!app.isPackaged&&(!project||!path.isAbsolute(project)))return null;
  return {name:'PassWall2Monitor',path:executable,args:portable||app.isPackaged?['--background']:[`"${project}"`,'--background']};
}
function readStartup(app,options){
  if(!options)return {available:false,enabled:false};
  const settings=app.getLoginItemSettings(options);
  const normalize=p=>path.win32.normalize(p||'').toLowerCase();
  const args=values=>JSON.stringify((Array.isArray(values)?values:typeof values==='string'?values.match(/(?:[^\s"]+|"[^"]*")+/g)||[]:[]).map(value=>{const raw=value.replace(/^"(.*)"$/,'$1');return path.win32.isAbsolute(raw)?normalize(raw):raw;}));
  const entry=settings.launchItems?.find(item=>item.name===options.name&&item.scope!=='machine'&&normalize(item.path)===normalize(options.path)&&args(item.args)===args(options.args));
  return {available:true,enabled:entry?entry.enabled!==false:!!settings.openAtLogin&&settings.executableWillLaunchAtLogin!==false};
}
// Use a fixed user-owned Run entry on Windows and verify the actual persisted value.
function windowsStartup(options,enabled,run=require('node:child_process').execFileSync){
  if(!options)return {available:false,enabled:false};
  const key='HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run',approved='HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\StartupApproved\\Run';
  const reg=args=>run('reg.exe',args,{encoding:'utf8',windowsHide:true,timeout:5000,stdio:['ignore','pipe','pipe']});
  const query=(key)=>{try{return reg(['query',key,'/v',options.name]);}catch(e){if(e.status===1)return '';throw Error('无法读取 Windows 自启动设置：'+e.message);}};
  const command='"'+options.path+'"'+(options.args.length?' '+options.args.join(' '):'');
  if(enabled!==undefined){
    if(typeof enabled!=='boolean')throw Error('开机启动设置无效');
    if(enabled){reg(['add',key,'/v',options.name,'/t','REG_SZ','/d',command,'/f']);reg(['add',approved,'/v',options.name,'/t','REG_BINARY','/d','020000000000000000000000','/f']);}
    else if(query(key))reg(['delete',key,'/v',options.name,'/f']);
  }
  const saved=query(key).match(/REG_(?:EXPAND_)?SZ\s+([^\r\n]+)/)?.[1]?.trim();
  const approval=query(approved).match(/REG_BINARY\s+([\da-f]+)/i)?.[1];
  const active=saved?.toLowerCase()===command.toLowerCase()&&!/^(03|07)/i.test(approval||'');
  if(enabled!==undefined&&!!active!==enabled)throw Error('Windows 自启动设置未保存，请重试');
  return {available:true,enabled:!!active};
}
function setStartup(app,options,enabled){if(!options)throw Error('当前环境无法设置 Windows 开机启动');if(typeof enabled!=='boolean')throw Error('开机启动设置无效');app.setLoginItemSettings({...options,openAtLogin:enabled,enabled});const result=readStartup(app,options);if(result.enabled!==enabled)throw Error('Windows 自启动设置未保存，请重试');return result;}
module.exports={startupOptions,readStartup,setStartup,windowsStartup};
