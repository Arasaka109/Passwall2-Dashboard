const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('desktop',{
  invoke:(method,payload)=>ipcRenderer.invoke('api',method,payload),
  onState:callback=>{const listener=(_,s)=>callback(s);ipcRenderer.on('state',listener);return()=>ipcRenderer.removeListener('state',listener);}
});
