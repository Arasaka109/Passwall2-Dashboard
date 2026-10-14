const { Client } = require('ssh2');
const crypto = require('node:crypto');
const net = require('node:net');
const {classifyService}=require('./lifecycle.cjs');

const quote = value => "'" + String(value).replace(/'/g, "'\\''") + "'";
const identifier = value => { if (!/^[a-zA-Z0-9_]+$/.test(value || '')) throw Error('无效的配置 ID'); return value; };
const READ = `lua - <<'PW_DESKTOP_LUA'
local u = require('luci.model.uci').cursor()
local j = require('luci.jsonc')
local out = {nodes={},rules={},shunts={}, enabled=u:get('passwall2','@global[0]','enabled'),active=u:get('passwall2','@global[0]','node')}
u:foreach('passwall2','nodes',function(s)
  local n = {id=s['.name'],name=s.remarks or s['.name'],type=s.type or '',protocol=s.protocol or '',address=s.address or '',port=s.port or ''}
  if s.protocol == '_shunt' then
    local bindings={}
    u:foreach('passwall2','shunt_rules',function(r) bindings[r['.name']]=s[r['.name']] or '_default' end)
    table.insert(out.shunts,{id=s['.name'],name=n.name,bindings=bindings,default=s.default_node or '_direct'})
  end
  table.insert(out.nodes,n)
end)
u:foreach('passwall2','shunt_rules',function(s)
  table.insert(out.rules,{id=s['.name'],remarks=s.remarks or s['.name'],domain_list=s.domain_list or '',ip_list=s.ip_list or '',network=s.network or 'tcp,udp',port=s.port or '',protocol=s.protocol or ''})
end)
local fs=require('nixio.fs')
out.runtime={defaultRunning=false,corePids={},action=nil,lockHeld=false}
local actions={start=true,stop=true,restart=true,boot=true}
for pid in fs.dir('/proc') do
  if pid:match('^%d+$') then
    local f=io.open('/proc/'..pid..'/cmdline','rb')
    if f then
      local cmd=f:read('*a') or '';f:close()
      local args={};for arg in cmd:gmatch('[^%z]+') do args[#args+1]=arg end
      local exe=args[1] or ''
      if exe:match('^/tmp/etc/passwall2/bin/[^/]+$') then
        for _,arg in ipairs(args) do
          if arg:match('/acl/default%.json$') or arg:match('/acl_default%.json$') or arg:match('/acl/acl_default%.json$') then
            out.runtime.defaultRunning=true;table.insert(out.runtime.corePids,tonumber(pid));break
          end
        end
      end
      for i,arg in ipairs(args) do
        if (arg=='/etc/init.d/passwall2' or arg=='/usr/share/passwall2/app.sh') and actions[args[i+1]] then out.runtime.action=args[i+1] end
      end
    end
  end
end
local locks=fs.readfile('/proc/locks') or ''
for _,file in ipairs({'/tmp/lock/passwall2.lock','/var/lock/passwall2.lock'}) do
  local stat=fs.stat(file)
  if stat and stat.ino then
    for line in locks:gmatch('[^\\n]+') do
      local ino=line:match('%x+:%x+:(%d+)')
      if ino and tonumber(ino)==stat.ino then out.runtime.lockHeld=true end
    end
  end
end
out.running=out.runtime.defaultRunning
local f=io.open('/tmp/log/passwall2.log','r')
if f then local size=f:seek('end'); f:seek('set',math.max(0,size-65536)); out.log=f:read('*a'); f:close() else out.log='' end
print(j.stringify(out))
PW_DESKTOP_LUA`;

function revision(rule, shunts) { const {revision:ignored,...fields}=rule; return crypto.createHash('sha256').update(JSON.stringify({rule:fields,shunts:shunts.map(s=>({id:s.id,value:s.bindings[rule.id]}))})).digest('hex'); }
function validateRules(domains,ips){
  const {domainToASCII}=require('node:url');
  for(const line of domains.split('\n').map(l=>l.trim()).filter(l=>l&&!l.startsWith('#'))){
    if(/^(geosite:|rule-set:(local:|remote:)|rs:(local:|remote:))\S+$/.test(line))continue;
    if(line.startsWith('regexp:')){if(!line.slice(7))throw Error('正则规则不能为空');continue;}
    const host=domainToASCII(line.replace(/^(domain:|full:)/,''));
    if(!host||host.length>253||!host.split('.').every(p=>/^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?$/.test(p)))throw Error('无效的域名规则：'+line);
  }
  for(const line of ips.split('\n').map(l=>l.trim()).filter(l=>l&&!l.startsWith('#'))){
    if(/^(geoip:|rule-set:(local:|remote:)|rs:(local:|remote:))\S+$/.test(line))continue;
    const [ip,prefix,...extra]=line.split('/'),version=net.isIP(ip);
    if(!version||extra.length||prefix!==undefined&&(!/^\d+$/.test(prefix)||Number(prefix)>(version===4?32:128)))throw Error('无效的 IP 规则：'+line);
  }
}
function normalizeSnapshot(s) {
  for (const key of ['nodes','rules','shunts']) if (!Array.isArray(s[key])) s[key] = [];
  s.rules = s.rules.map(r=>({...r,revision:revision(r,s.shunts)}));
  s.service=classifyService(s);
  s.time=Date.now(); return s;
}
function validateProfile(p) {
  if (!p || !(net.isIP(p.host) || /^(?=.{1,253}$)[a-zA-Z0-9](?:[a-zA-Z0-9.-]*[a-zA-Z0-9])?$/.test(p.host))) throw Error('请输入有效的路由器地址，不含 http:// 或路径');
  if (!Number.isInteger(Number(p.port)) || p.port < 1 || p.port > 65535) throw Error('SSH 端口无效');
  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(p.username)) throw Error('SSH 用户名无效');
  return {host:p.host,port:Number(p.port),username:p.username,password:String(p.password || ''),privateKey:p.privateKey,passphrase:p.passphrase,readyTimeout:12000,keepaliveInterval:10000,keepaliveCountMax:3};
}
function pingTarget(value){
  if(typeof value!=='string')throw Error('请输入 IP 地址或域名');
  const target=value.trim();if(net.isIP(target))return target;
  if(!/^[\p{L}\p{N}.-]+$/u.test(target))throw Error('请输入有效的 IP 地址或域名，不含协议、路径或端口');
  const host=require('node:url').domainToASCII(target);
  if(!host||host.length>253||!host.split('.').every(label=>/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(label)))throw Error('请输入有效的 IP 地址或域名，不含协议、路径或端口');
  return host;
}
class Router {
  constructor() { this.client=null; this.busy=false; }
  async connect(profile, knownFingerprint) {
    this.disconnect(); const options=validateProfile(profile); let fingerprint;
    const client=new Client();
    try { await new Promise((resolve,reject)=> {
      client.once('ready',resolve); client.once('error',error=>{ if(fingerprint && fingerprint !== knownFingerprint) { const e=Error('请核对路由器 SSH 主机指纹后信任'); e.fingerprint=fingerprint; reject(e); } else reject(error); });
      client.on('close',()=>{ if(this.client===client){this.client=null;this.onDisconnect?.();} });
      client.connect({...options,hostVerifier:key=>{fingerprint='SHA256:'+crypto.createHash('sha256').update(key).digest('base64').replace(/=+$/,''); return fingerprint===knownFingerprint; }});
    }); } catch(e) {client.end();throw e;}
    client.on('error',()=>{}); this.client=client;
    try {await this.exec("test -x /etc/init.d/passwall2 && test -f /etc/config/passwall2 && command -v lua >/dev/null || { echo '缺少 PassWall2 或 Lua，无法使用此适配器' >&2; exit 1; }");}catch(e){this.disconnect();throw e;}
    return fingerprint;
  }
  disconnect() { this.logStream?.close();this.logStream=null;const c=this.client; this.client=null; c?.end(); }
  followLog(onData,onError){
    this.logStream?.close();const client=this.client;if(!client)return;
    client.exec("test -f /tmp/log/passwall2.log || { echo '日志文件暂不存在' >&2; exit 1; }; tail -n 200 -F /tmp/log/passwall2.log",(error,stream)=>{
      if(error)return onError(error);if(client!==this.client){stream.close();return;}
      this.logStream=stream;let message='';const {StringDecoder}=require('node:string_decoder'),decoder=new StringDecoder('utf8');
      stream.on('data',chunk=>onData(decoder.write(chunk)));stream.stderr.on('data',chunk=>message+=chunk.toString());stream.on('error',onError);stream.on('close',()=>{if(client===this.client)onError(Error(message.trim()||'日志流已关闭'));});
    });
  }
  exec(command, timeout=20000) {
    if(!this.client) return Promise.reject(Error('SSH 未连接，请打开连接设置'));
    return new Promise((resolve,reject)=> {
      let stream, output='', errors='', done=false;
      const finish=(err,value)=>{ if(done)return; done=true; clearTimeout(timer); err?reject(err):resolve(value); };
      const timer=setTimeout(()=>{stream?.close(); finish(Error('路由器命令超时；操作可能仍在执行，请刷新状态后再试'));},timeout);
      this.client.exec(command,(err,s)=>{
        if(err)return finish(err); stream=s;
        s.on('data',b=>{output+=b.toString(); if(output.length>2*1024*1024){s.close();finish(Error('响应超过大小限制'));}});
        s.stderr.on('data',b=>errors+=b.toString());
        s.on('error',finish); s.on('close',(code)=>code===0?finish(null,output):finish(Error(errors.trim() || `路由器命令失败 (${code})`)));
      });
    });
  }
  async snapshot() { return normalizeSnapshot(JSON.parse(await this.exec(READ))); }
  async ping(value){
    const target=pingTarget(value);if(this.pinging)throw Error('Ping 检测正在执行');this.pinging=true;
    try{
      const output=await this.exec(`LC_ALL=C ${net.isIP(target)===6?'ping6':'ping'} -c 4 -W 2 ${quote(target)} 2>&1; result=$?; printf '\\nPW_PING_EXIT=%s\\n' "$result"`,15000);
      const code=Number(output.match(/PW_PING_EXIT=(\d+)/)?.[1]??1),text=output.replace(/\nPW_PING_EXIT=\d+\s*$/,'').trim();
      const stats=text.match(/(\d+) packets transmitted,\s*(\d+)(?: packets)? received,\s*([\d.]+)% packet loss/),times=text.match(/(?:round-trip|rtt)[^=]*=\s*([\d.]+)\/([\d.]+)\/([\d.]+)/);
      return {target,ok:code===0,time:Date.now(),output:text,transmitted:stats?Number(stats[1]):null,received:stats?Number(stats[2]):null,loss:stats?Number(stats[3]):null,ms:times?Number(times[2]):null};
    }finally{this.pinging=false;}
  }
  async control(action) {
    if(!['start','stop','restart'].includes(action))throw Error('不支持的服务操作');
    if(this.busy) throw Error('另一项配置或服务操作正在执行');
    this.busy=true;
    try {
      if(action==='start') await this.exec("uci set passwall2.@global[0].enabled='1' && uci commit passwall2");
      await this.exec(`/etc/init.d/passwall2 ${action}`,120000);
      return await this.snapshot();
    } finally { this.busy=false; }
  }
  async probe() {
    const results=[];
    for(const [name,url] of [['Google','https://www.google.com/generate_204'],['Cloudflare','https://www.cloudflare.com/cdn-cgi/trace'],['Baidu','https://www.baidu.com']]) {
      try {const result=await this.exec(`curl -sS -L --connect-timeout 3 --max-time 6 -o /dev/null -w '%{http_code}:%{time_total}' ${quote(url)}`,9000); const [code,time]=result.trim().split(':'); results.push({name,ok:Number(code)>=200&&Number(code)<400,code,ms:Math.round(Number(time)*1000)});}
      catch(e){results.push({name,ok:false,error:e.message});}
    }
    return {time:Date.now(),scope:'路由器出站 HTTPS · 依当前分流规则',results};
  }
  async nodeTest(id) {
    if(this.busy)throw Error('另一项配置、服务或节点测试正在执行');this.busy=true;
    try {
    identifier(id); const snapshot=await this.snapshot();
    if(!snapshot.nodes.some(n=>n.id===id && !n.protocol.startsWith('_')))throw Error('只能检测真实节点');
    const result=await this.exec(`/usr/share/passwall2/test.sh url_test_node ${quote(id)}`,30000);
    const match=result.trim().match(/(\d{3}):([\d.]+)$/); const ok=!!match&&Number(match[1])>=200&&Number(match[1])<400;
    return {id,ok,ms:ok?Math.round(Number(match[2])*1000):null,time:Date.now()};
    }finally{this.busy=false;}
  }
  async saveRule(input, backup) {
    if(this.busy)throw Error('另一项配置或服务操作正在执行');
    this.busy=true;
    try {
      identifier(input.id); if(typeof input.domain_list!=='string'||typeof input.ip_list!=='string'||input.domain_list.length+input.ip_list.length>65536||/[\x00-\x08\x0b-\x1f]/.test(input.domain_list+input.ip_list))throw Error('规则内容格式或大小无效');
      validateRules(input.domain_list,input.ip_list);
      const current=await this.snapshot(), rule=current.rules.find(r=>r.id===input.id);
      if(!rule || input.revision!==rule.revision) throw Error('规则已被其他会话修改，请关闭编辑器、刷新后重试');
      const shunt=current.shunts.find(s=>s.id===input.shuntId);
      if(input.shuntId && !shunt)throw Error('分流节点不存在');
      const routes=['_direct','_blackhole','_default',...current.nodes.filter(n=>!n.protocol.startsWith('_')).map(n=>n.id)];
      if(shunt && !routes.includes(input.target) && input.target!==shunt.bindings[input.id])throw Error('目标节点不存在或不受支持');
      const changes=await this.exec('uci -q changes passwall2');
      if(changes.trim())throw Error('LuCI 中有尚未提交的 PassWall2 更改，请先保存或撤销');
      await backup({time:new Date().toISOString(),rule,shunts:current.shunts});
      let commands=[`set passwall2.${input.id}.domain_list=${quote(input.domain_list)}`,`set passwall2.${input.id}.ip_list=${quote(input.ip_list)}`];
      if(shunt)commands.push(`set passwall2.${identifier(shunt.id)}.${input.id}=${quote(input.target)}`);
      commands.push("set passwall2.@global[0].flush_set='1'",'commit passwall2');
      // Entire batch is supplied as one shell-quoted argument, never an interpolated heredoc.
      await this.exec(`printf '%s\\n' ${quote(commands.join('\n'))} | uci batch`);
      return {saved:true};
    } finally {this.busy=false;}
  }
  async switchNode(input,backup){
    if(this.busy)throw Error('另一项配置或服务操作正在执行');this.busy=true;
    try{
      identifier(input?.id);const current=await this.snapshot();
      if(!current.nodes.some(n=>n.id===input.id))throw Error('节点不存在，请刷新后重试');
      if(current.active!==input.expectedActive)throw Error('当前节点已被其他会话修改，请刷新后重试');
      if(!['running','stopped'].includes(current.service?.status))throw Error('服务状态尚未稳定，请等待后重试');
      if(current.active===input.id)return {saved:true,changed:false};
      if((await this.exec('uci -q changes passwall2')).trim())throw Error('LuCI 中有尚未提交的 PassWall2 更改，请先保存或撤销');
      await backup({time:new Date().toISOString(),previous:current.active,next:input.id,enabled:current.enabled});
      const commands=[`set passwall2.@global[0].node=${quote(input.id)}`,"set passwall2.@global[0].flush_set='1'",'commit passwall2'];
      await this.exec(`printf '%s\\n' ${quote(commands.join('\n'))} | uci batch`);
      return {saved:true,changed:true,restart:current.service.status==='running',id:input.id};
    }finally{this.busy=false;}
  }
}
module.exports={Router,quote,identifier,validateProfile,validateRules,normalizeSnapshot,revision,READ,pingTarget};
