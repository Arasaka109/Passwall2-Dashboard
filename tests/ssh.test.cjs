const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {Server}=require('ssh2');const {Router}=require('../desktop/router.cjs');
test('real SSH handshake verifies host key before authentication, reads state and follows log',async()=>{
  const key=crypto.generateKeyPairSync('rsa',{modulusLength:2048}).privateKey.export({type:'pkcs1',format:'pem'});
  let authenticated=0,commands=[];
  const server=new Server({hostKeys:[key]},client=>{
    client.on('error',()=>{});client.on('authentication',ctx=>{if(ctx.method==='password')authenticated++;ctx.username==='root'&&ctx.password==='unit-test-password'?ctx.accept():ctx.reject();});
    client.on('ready',()=>client.on('session',accept=>{
      const session=accept();session.on('exec',(accept,_,info)=>{
        const stream=accept();commands.push(info.command);
        if(info.command.includes('tail -n 200 -F')){stream.write('[TEST] 日志流\n');return;}
        if(info.command.startsWith('lua -'))stream.write(JSON.stringify({nodes:{},rules:{},shunts:{},running:false,log:'[TEST] snapshot'}));
        stream.exit(0);stream.end();
      });
    }));
  });
  await new Promise(r=>server.listen(0,'127.0.0.1',r));const router=new Router(),p={host:'127.0.0.1',port:server.address().port,username:'root',password:'unit-test-password'};
  try{
    let fingerprint;try{await router.connect(p);}catch(e){fingerprint=e.fingerprint;}
    assert.match(fingerprint,/^SHA256:/);assert.equal(authenticated,0,'credentials must not be sent to an untrusted host');
    await assert.rejects(router.connect(p,'SHA256:wrong-key'),e=>e.fingerprint===fingerprint);assert.equal(authenticated,0,'a changed host must not receive credentials');
    await router.connect(p,fingerprint);assert.equal(authenticated,1);
    const snapshot=await router.snapshot();assert.deepEqual(snapshot.nodes,[]);assert.equal(snapshot.running,false);
    const data=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('log timeout')),2000);router.followLog(chunk=>{clearTimeout(timer);resolve(chunk);},reject);});assert.match(data,/日志流/);
    assert.ok(commands.some(c=>c.startsWith('lua -')));assert.ok(commands.every(c=>!c.includes('scp ')&&!c.includes('opkg ')&&!c.includes('apk ')));
  }finally{router.disconnect();await new Promise(r=>server.close(r));}
});
