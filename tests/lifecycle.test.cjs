const test=require('node:test'),assert=require('node:assert/strict');
const {classifyService,analyzeLog}=require('../desktop/lifecycle.cjs');
const start='2026-10-12 16:18:46: 开始加载 nftables 防火墙规则...\n2026-10-12 16:19:02: - Xray[2001] DNS[2002]\n2026-10-12 16:19:02: - Dnsmasq[2004]\n';
const ready=start+'2026-10-12 16:19:06: nftables 防火墙规则加载完成！\n2026-10-12 16:19:07: 运行完成！\n';
test('iStoreOS default core evidence is authoritative after readiness',()=>{
  const s=classifyService({runtime:{defaultRunning:true},log:ready});assert.equal(s.status,'running');assert.equal(s.phase,'启动流程完成');
});
test('core process can appear before DNS and firewall finish',()=>{
  const s=classifyService({runtime:{defaultRunning:true,action:'start',lockHeld:true},log:start});assert.equal(s.status,'starting');assert.equal(s.detail,'启动 DNS');
});
test('an exited startup script without its completion log is not ready',()=>{
  const s=classifyService({runtime:{defaultRunning:true},log:start});assert.equal(s.status,'unknown');assert.match(s.detail,/日志尚未完成/);
});
test('stop completion message does not mean service running',()=>{
  const log=ready+'2026-10-12 16:20:01: 清空并关闭相关程序和缓存完成。\n2026-10-12 16:20:02: 运行完成！';
  assert.equal(analyzeLog(log).cycle,'stop');assert.equal(classifyService({runtime:{defaultRunning:false},log}).status,'stopped');
});
test('startup operation waits for actual core after command returns',()=>{
  const op={action:'start',stage:'verifying',startedAt:1000};
  const state=classifyService({runtime:{defaultRunning:false},log:start},op,22000);assert.equal(state.status,'starting');assert.equal(state.elapsed,21);assert.equal(state.done,false);
  assert.equal(classifyService({runtime:{defaultRunning:true},log:ready},op,23000).done,true);
});
test('old completion logs never imply a running process',()=>{
  assert.equal(classifyService({runtime:{defaultRunning:false},log:ready}).status,'stopped');
});
test('restarting remains pending through its stop phase',()=>{
  const s=classifyService({runtime:{defaultRunning:false,action:'stop'},log:ready},{action:'restart',stage:'executing',startedAt:1000},6000);assert.equal(s.status,'starting');assert.equal(s.done,false);
});
test('an active stop reports stopping even if core has not exited',()=>{
  assert.equal(classifyService({runtime:{defaultRunning:true,action:'stop'},log:ready}).status,'stopping');
});
test('a held lifecycle lock prevents a premature ready state',()=>{
  assert.equal(classifyService({runtime:{defaultRunning:true,lockHeld:true},log:start}).status,'starting');
});
test('timeout does not silently report a successful startup',()=>{
  const s=classifyService({runtime:{defaultRunning:false},log:start},{action:'start',stage:'verifying',startedAt:1000},181000);assert.equal(s.status,'failed');assert.equal(s.done,true);
});
test('a present but unlocked stale lock does not affect stable process evidence',()=>{
  assert.equal(classifyService({runtime:{defaultRunning:true,lockHeld:false},log:ready}).status,'running');
});
