const test=require('node:test'),assert=require('node:assert/strict');
const {Router,quote,identifier,validateProfile,validateRules,normalizeSnapshot,revision}=require('../desktop/router.cjs');
function snapshot(){return normalizeSnapshot({nodes:[{id:'node1',name:'节点 1',protocol:'vless'}],rules:[{id:'work',remarks:'工作',domain_list:'domain:example.com',ip_list:'',network:'tcp,udp'}],shunts:[{id:'shunt1',bindings:{work:'node1'}}]});}
test('shell arguments stay quoted with quotes, newlines and command substitutions',()=>{
  assert.equal(quote("a'b\n$(reboot)`id`"),"'a'\\''b\n$(reboot)`id`'");
  for(const bad of ['a;reboot','../work','work.x','$(id)',''])assert.throws(()=>identifier(bad));
});
test('only a host, numeric SSH port and safe username are accepted',()=>{
  assert.equal(validateProfile({host:'192.168.100.1',port:22,username:'root'}).port,22);
  for(const host of ['http://router/','router;id','-host','', 'router name'])assert.throws(()=>validateProfile({host,port:22,username:'root'}));
  assert.throws(()=>validateProfile({host:'router.lan',port:65536,username:'root'}));
});
test('empty Lua tables normalize to arrays and revisions stay stable',()=>{
  assert.deepEqual(normalizeSnapshot({nodes:{},rules:{},shunts:{}}).nodes,[]);
  const s=snapshot();assert.equal(s.rules[0].revision,revision(s.rules[0],s.shunts));
  s.shunts[0].bindings.work='_direct';assert.notEqual(s.rules[0].revision,revision(s.rules[0],s.shunts));
});
test('rule validation accepts supported matching styles, rejects malformed domains and CIDR',()=>{
  validateRules('domain:example.com\nfull:api.example.com\ngeosite:google\nregexp:^a.*$\n# hello','192.168.1.0/24\n::1/128\ngeoip:cn');
  for(const [d,i] of [['domain:a bad.com',''],['','1.1.1.1/33'],['','2001:db8::/129'],['','not-ip']])assert.throws(()=>validateRules(d,i));
});
test('concurrent LuCI edits block all writes and backups',async()=>{
  const r=new Router(),s=snapshot();r.snapshot=async()=>s;r.exec=async()=>'+pending';
  let backed=false;await assert.rejects(r.saveRule({...s.rules[0],shuntId:'shunt1',target:'node1'},()=>backed=true),/尚未提交/);assert.equal(backed,false);assert.equal(r.busy,false);
});
test('changed revision blocks save before any remote write',async()=>{
  const r=new Router(),s=snapshot();r.snapshot=async()=>s;r.exec=()=>assert.fail('must not execute');
  await assert.rejects(r.saveRule({...s.rules[0],revision:'old'},()=>assert.fail()),/其他会话/);
});
test('backup failure prevents writes',async()=>{
  const r=new Router(),s=snapshot();r.snapshot=async()=>s;let writes=0;r.exec=async c=>{if(c.includes('uci batch'))writes++;return '';};
  await assert.rejects(r.saveRule({...s.rules[0]},async()=>{throw Error('disk full');}),/disk full/);assert.equal(writes,0);
});
test('save limits modifications to selected rule and mapping, backup happens first',async()=>{
  const r=new Router(),s=snapshot();r.snapshot=async()=>s;const calls=[];r.exec=async c=>{calls.push(c);return '';};
  const input={...s.rules[0],domain_list:'domain:openai.com',shuntId:'shunt1',target:'_direct'};
  await r.saveRule(input,async b=>{assert.equal(calls.length,1);assert.equal(b.rule.domain_list,'domain:example.com');});
  assert.equal(calls.length,2);assert.match(calls[1],/set passwall2.work.domain_list=/);assert.match(calls[1],/set passwall2.shunt1.work=/);assert.match(calls[1],/commit passwall2/);assert.doesNotMatch(calls[1],/init.d|\/usr\/share|delete /);
});
test('service actions are allowlisted, startup enables configuration and stop stays temporary',async()=>{
  const r=new Router(),commands=[];r.exec=async c=>commands.push(c);r.snapshot=async()=>({running:true});
  await assert.rejects(r.control('start;reboot'));await r.control('start');assert.match(commands[0],/enabled='1'/);assert.equal(commands[1],'/etc/init.d/passwall2 start');
  commands.length=0;await r.control('stop');assert.deepEqual(commands,['/etc/init.d/passwall2 stop']);
});
test('node test distinguishes policy nodes and release lock after failure',async()=>{
  const r=new Router();r.snapshot=async()=>({nodes:[{id:'shunt',protocol:'_shunt'}]});
  await assert.rejects(r.nodeTest('shunt'),/真实节点/);assert.equal(r.busy,false);
});
test('HTTPS errors are not treated as connectivity success',async()=>{
  const r=new Router();r.exec=async()=> '500:0.200';const p=await r.probe();assert.equal(p.results.length,3);assert.ok(p.results.every(r=>!r.ok));
});
