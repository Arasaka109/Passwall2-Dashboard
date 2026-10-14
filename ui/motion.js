const motionReduced=()=>matchMedia('(prefers-reduced-motion: reduce)').matches;
const motionWait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
window.setButtonLabel=(button,text)=>{const label=button.querySelector('.morph-label');if(label)label.textContent=text;else button.textContent=text;};
// One spring-like press language for mouse, touch and keyboard activated buttons.
document.addEventListener('click',e=>{const b=e.target.closest('button');if(!b||b.disabled||b.classList.contains('morph-active')||motionReduced())return;b.animate([{transform:'scale(.94)',opacity:.85},{transform:'scale(1.025)',opacity:1,offset:.65},{transform:'scale(1)',opacity:1}],{duration:360,easing:'cubic-bezier(.2,.85,.2,1)'});},true);
new MutationObserver(records=>{for(const r of records){const d=r.target;if(d.open&&d.id!=='glass-detail'&&!motionReduced())d.animate([{transform:'translateY(12px) scale(.93)',opacity:0},{transform:'none',opacity:1}],{duration:360,easing:'cubic-bezier(.2,.85,.2,1)'});}}).observe(document.body,{subtree:true,attributes:true,attributeFilter:['open']});
function morphButton(button){
 const rect=button.getBoundingClientRect(),style=button.getAttribute('style'),slot=document.createElement('span');slot.className='morph-slot';slot.style.width=rect.width+'px';slot.style.height=rect.height+'px';slot.style.flex=getComputedStyle(button).flex;button.before(slot);slot.append(button);
 const label=document.createElement('span');label.className='morph-label';while(button.firstChild)label.append(button.firstChild);button.append(label);button.insertAdjacentHTML('beforeend','<svg class="morph-spinner" viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="11"/></svg><svg class="morph-mark" viewBox="0 0 32 32" aria-hidden="true"><path d="m8 16 5 5 11-11"/></svg>');
 button.classList.add('morph-active');button.setAttribute('aria-busy','true');button.disabled=true;button.style.width=rect.width+'px';button.style.height=rect.height+'px';button.style.flex='none';button.style.minWidth='0';
 getComputedStyle(label).opacity; // Commit the visible label before fading it out.
 const started=Date.now();let done=false,finishing=false;requestAnimationFrame(()=>button.classList.add('morph-fading'));
 const shrink=setTimeout(()=>{if(!done){button.classList.add('morph-loading');button.style.width=rect.height+'px';button.style.borderRadius=rect.height/2+'px';}},motionReduced()?0:100);
 return {async finish(ok){if(finishing)return;finishing=true;await motionWait(Math.max(0,(motionReduced()?0:400)-(Date.now()-started)));done=true;clearTimeout(shrink);button.classList.remove('morph-loading');button.classList.add(ok?'morph-success':'morph-failure');button.setAttribute('aria-label',ok?'操作成功':'操作失败');button.setAttribute('aria-busy','false');if(!ok)button.querySelector('.morph-mark path').setAttribute('d','m10 10 12 12m0-12L10 22');await motionWait(1000);button.classList.remove('morph-success','morph-failure');button.style.width=rect.width+'px';button.style.borderRadius='12px';await motionWait(motionReduced()?0:300);button.replaceChildren(...label.childNodes);button.classList.remove('morph-active','morph-fading');button.removeAttribute('aria-label');button.removeAttribute('aria-busy');if(style===null)button.removeAttribute('style');else button.setAttribute('style',style);slot.replaceWith(button);button.disabled=false;}};
}
let serviceMorph=null;
window.beginServiceMorph=action=>{
 if(serviceMorph)return;
 const controls=[...document.querySelectorAll('[data-action="power"]')].filter(b=>b.getBoundingClientRect().width>0);
 serviceMorph={target:action==='stop'?'stopped':'running',commandDone:false,finishing:false,controls:controls.map(morphButton)};
 serviceMorph.timeout=setTimeout(()=>window.finishServiceMorph(false),190000);
};
window.finishServiceMorph=async ok=>{const current=serviceMorph;if(!current||current.finishing)return;current.finishing=true;clearTimeout(current.timeout);await Promise.all(current.controls.map(c=>c.finish(ok)));if(serviceMorph===current)serviceMorph=null;render();};
window.serviceCommandReturned=()=>{if(serviceMorph)serviceMorph.commandDone=true;window.updateServiceMorph(state);};
window.updateServiceMorph=s=>{if(!serviceMorph||serviceMorph.finishing||!serviceMorph.commandDone)return;if(!s.connected){window.finishServiceMorph(false);return;}if(s.operation)return;const status=s.snapshot?.service?.status;if(status===serviceMorph.target)window.finishServiceMorph(true);else if(['failed','unknown','stopped','running'].includes(status))window.finishServiceMorph(false);};
