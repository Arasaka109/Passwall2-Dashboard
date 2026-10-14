const LABELS={running:'运行中',stopped:'服务已停止',starting:'正在启动',stopping:'正在停止',failed:'启动未完成',unknown:'状态待确认'};
function analyzeLog(log=''){
  let cycle=null,phase='',lastLine='';
  for(const line of log.split('\n').slice(-300).filter(l=>l.trim())){
    if(/开始加载.*防火墙|Start loading.*firewall|Starting PassWall/i.test(line)){cycle='start';phase='加载防火墙规则';}
    else if(/删除.*规则完成|清空并关闭相关程序|Deleting.*rules|Clear and close/i.test(line)){cycle='stop';phase='清理进程和规则';}
    else if(cycle==='start'&&phase!=='启动流程完成'){
      if(/追加|白名单|nftset/i.test(line))phase='配置防火墙与直连规则';
      if(/访问控制|Access control/i.test(line))phase='加载访问控制';
      if(/Xray\[|Sing.Box\[/i.test(line))phase='启动代理核心';
      if(/Dnsmasq\[/i.test(line))phase='启动 DNS';
      if(/【默认】|【本机】/.test(line))phase='配置透明代理';
      if(/防火墙规则加载完成|firewall rules.*complete/i.test(line))phase='防火墙就绪';
    }
    if(/运行完成|Run complete|Running complete/i.test(line))phase=cycle==='start'?'启动流程完成':cycle==='stop'?'停止流程完成':'流程完成';
    lastLine=line.trim();
  }
  return {cycle,phase,lastLine};
}
function classifyService(snapshot,operation=null,now=Date.now()){
  const log=analyzeLog(snapshot.log),runtime=snapshot.runtime||{},core=runtime.defaultRunning??!!snapshot.running;
  const remoteAction=runtime.action;
  const incompleteStart=core&&log.cycle==='start'&&log.phase!=='启动流程完成';
  let status=remoteAction==='stop'?'stopping':['start','restart','boot'].includes(remoteAction)?'starting':runtime.lockHeld?'unknown':core?(incompleteStart?'unknown':'running'):'stopped';
  let elapsed=null,done=false;
  if(operation){
    elapsed=Math.max(0,Math.floor((now-operation.startedAt)/1000));
    const target=operation.action==='stop'?'stopped':'running';
    if(operation.stage==='verifying'&&status===target)done=true;
    else if(elapsed>=180){status=core?'unknown':operation.action==='stop'?'unknown':'failed';done=true;}
    else status=operation.action==='stop'?'stopping':'starting';
  }
  if(status==='unknown'&&runtime.lockHeld&&!operation){status=log.cycle==='stop'?'stopping':'starting';}
  let detail=status==='running'?'默认代理进程已确认':status==='stopped'?'未检测到默认代理进程':status==='starting'?(log.cycle==='start'?log.phase:'等待服务启动'):status==='stopping'?'等待进程退出与规则清理':status==='failed'?'等待超过 180 秒，未检测到就绪进程':incompleteStart?'代理进程存在，启动日志尚未完成':'请查看日志并刷新状态';
  return {status,label:LABELS[status],detail,phase:log.phase,lastLine:log.lastLine,elapsed,done,coreRunning:!!core};
}
module.exports={classifyService,analyzeLog};
