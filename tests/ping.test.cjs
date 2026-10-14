const test=require('node:test'),assert=require('node:assert/strict');
const {Router,pingTarget}=require('../desktop/router.cjs');
test('ping accepts IPs and IDN but rejects shell syntax, flags and URLs',()=>{
  for(const host of ['1.1.1.1','2001:4860:4860::8888','example.com'])assert.equal(pingTarget(host),host);
  assert.equal(pingTarget('例子.中国'),'xn--fsqu00a.xn--fiqs8s');
  for(const host of ['-c','a; reboot','$(id)','https://example.com','a/b','a:80','foo\nbar','a..com',''])assert.throws(()=>pingTarget(host));
});
test('ping parses BusyBox replies and reports loss without claiming success',async()=>{
  const router=new Router(),calls=[];router.exec=async(cmd,timeout)=>{calls.push({cmd,timeout});return '4 packets transmitted, 4 packets received, 0% packet loss\nround-trip min/avg/max = 10.1/20.2/30.3 ms\nPW_PING_EXIT=0\n';};
  const result=await router.ping('example.com');assert.equal(result.ok,true);assert.equal(result.loss,0);assert.equal(result.ms,20.2);assert.match(calls[0].cmd,/-c 4 -W 2 'example.com'/);assert.equal(calls[0].timeout,15000);assert.doesNotMatch(result.output,/PW_PING_EXIT/);
  router.exec=async()=> '4 packets transmitted, 0 received, 100% packet loss\nPW_PING_EXIT=1\n';const failed=await router.ping('1.1.1.1');assert.equal(failed.ok,false);assert.equal(failed.loss,100);assert.equal(failed.ms,null);
  router.exec=async()=>{throw Error('SSH lost');};await assert.rejects(router.ping('example.com'),/SSH lost/);assert.equal(router.pinging,false);
});
test('ping rejects concurrent requests without issuing another router command',async()=>{
  const router=new Router();let finish,count=0;router.exec=()=>{count++;return new Promise(resolve=>finish=resolve);};const first=router.ping('::1');await assert.rejects(router.ping('example.com'),/正在执行/);assert.equal(count,1);finish('PW_PING_EXIT=0');await first;
});
