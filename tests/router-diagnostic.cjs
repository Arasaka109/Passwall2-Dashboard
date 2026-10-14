// Read-only diagnostics. Credentials arrive on stdin and are never written to disk.
const fs=require('node:fs'),path=require('node:path'),readline=require('node:readline');
const {Router}=require('../desktop/router.cjs');
if(process.stdin.isTTY)process.stdin.setRawMode(true);
console.log('Ready for connection JSON on stdin (input hidden)');
const input=readline.createInterface({input:process.stdin,terminal:false});
input.once('line',async line=>{
  input.close();const router=new Router();
  try{
    const profile=JSON.parse(line);let pin;
    for(const file of [path.resolve('release/PassWall2-Data/connection.json'),path.join(process.env.APPDATA||'','passwall2-desktop/connection.json')]){try{pin=JSON.parse(fs.readFileSync(file,'utf8')).pins?.[`${profile.host}:${profile.port}`]||pin;}catch{}}
    if(!pin)throw Error('没有已信任的主机指纹');
    await router.connect(profile,pin);
    if(profile.mode==='snapshot'){
      const s=await router.snapshot();console.log(JSON.stringify({runtime:s.runtime,service:s.service,running:s.running,nodeCount:s.nodes.length,ruleCount:s.rules.length}));return;
    }
    const commands={processes:"ps w | grep -E 'passwall2|xray|sing-box|chinadns' | grep -v grep",locks:"ls -l /tmp/lock/*passwall2* /var/lock/*passwall2* 2>/dev/null || true",log:'tail -n 100 /tmp/log/passwall2.log',init:"sed -n '1,160p' /etc/init.d/passwall2",runtime:"find /tmp/etc/passwall2 -maxdepth 3 -name '*.pid' -o -name '*default*.json' -o -name '*ready*' 2>/dev/null"};
    for(const [name,command] of Object.entries(commands)){try{console.log(JSON.stringify({name,result:await router.exec(command)}));}catch(e){console.log(JSON.stringify({name,error:e.message}));}}
  }catch(e){console.error(e.message);process.exitCode=1;}finally{router.disconnect();}
});
