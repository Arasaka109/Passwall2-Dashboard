const $=id=>document.getElementById(id);
function render(s){const p=s.probe?.results?.find(p=>p.name==='Google'),service=s.snapshot?.service,transition=['starting','stopping'].includes(service?.status);$('mini-title').textContent=s.connected?(service?.label||(s.snapshot?.running?'运行中':'已停止')):'PassWall2';$('mini-status').textContent=s.connected?(transition?(service.detail+(service.elapsed!=null?' · '+service.elapsed+'s':'')):p?(p.ok?'外网可达 · '+p.ms+' ms':'外网探测失败'):'正在检测外网…'):'SSH 未连接';$('mini-latency').textContent=transition?'◌':s.connected&&s.snapshot?.running?'●':'○';}
window.desktop.onState(render);window.desktop.invoke('state').then(r=>r.ok&&render(r.data));
$('mini-open').onclick=()=>window.desktop.invoke('open');$('mini-close').onclick=()=>window.desktop.invoke('mini');
