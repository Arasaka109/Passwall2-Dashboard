const closingDialogs=new WeakMap();
window.closeUiDialog=dialog=>{
 if(!dialog.open)return Promise.resolve();
 if(closingDialogs.has(dialog))return closingDialogs.get(dialog);
 const close=()=>{dialog.close();delete dialog.dataset.closing;closingDialogs.delete(dialog);};
 if(matchMedia('(prefers-reduced-motion: reduce)').matches){close();return Promise.resolve();}
 dialog.getAnimations().forEach(animation=>animation.cancel());dialog.dataset.closing='true';
 const animation=dialog.animate([{transform:'none',opacity:1},{transform:'translateY(10px) scale(.93)',opacity:0}],{duration:240,easing:'cubic-bezier(.4,0,.7,.3)',fill:'forwards'});
 const pending=animation.finished.catch(()=>{}).then(()=>{close();animation.cancel();});closingDialogs.set(dialog,pending);return pending;
};
document.querySelectorAll('dialog:not(#glass-detail)').forEach(dialog=>{
 dialog.addEventListener('cancel',e=>{e.preventDefault();window.closeUiDialog(dialog);});
 dialog.addEventListener('click',e=>{const r=dialog.getBoundingClientRect();if(e.target===dialog&&(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom))window.closeUiDialog(dialog);});
});
// The mask represents a stored credential; the real password never enters the renderer.
const connectionForm=document.getElementById('connection-form'),passwordInput=connectionForm.elements.password;
passwordInput.addEventListener('input',()=>delete passwordInput.dataset.savedMask);
for(const name of ['host','port','username'])connectionForm.elements[name].addEventListener('input',()=>{if(passwordInput.dataset.savedMask){passwordInput.value='';delete passwordInput.dataset.savedMask;}});
const nodeSelect=document.getElementById('node-switch-select'),picker=document.getElementById('node-picker'),trigger=document.getElementById('node-picker-trigger'),listbox=document.getElementById('node-picker-options');
function closePicker(focus=false){listbox.hidden=true;trigger.setAttribute('aria-expanded','false');if(focus)trigger.focus();}
function updatePicker(){
 document.getElementById('node-picker-value').textContent=nodeSelect.selectedOptions[0]?.textContent||'选择节点';
 listbox.replaceChildren();
 for(const [index,option] of [...nodeSelect.options].entries()){
  const button=document.createElement('button');button.type='button';button.className='glass-option';button.id='node-option-'+index;button.setAttribute('role','option');button.setAttribute('aria-selected',String(option.selected));button.dataset.value=option.value;button.tabIndex=-1;
  const name=document.createElement('span');name.textContent=option.textContent;button.append(name);
  const check=document.createElementNS('http://www.w3.org/2000/svg','svg');check.setAttribute('viewBox','0 0 24 24');check.setAttribute('aria-hidden','true');const path=document.createElementNS('http://www.w3.org/2000/svg','path');path.setAttribute('d','m5 12 4 4L19 6');check.append(path);button.append(check);listbox.append(button);
 }
}
window.syncNodePicker=()=>{closePicker();updatePicker();};
function openPicker(){updatePicker();listbox.hidden=false;trigger.setAttribute('aria-expanded','true');if(!matchMedia('(prefers-reduced-motion: reduce)').matches)listbox.animate([{opacity:0,transform:'translateY(-5px) scale(.98)'},{opacity:1,transform:'none'}],{duration:220,easing:'cubic-bezier(.2,.85,.2,1)'});const active=listbox.querySelector('[aria-selected="true"]')||listbox.firstElementChild;active?.focus({preventScroll:true});active?.scrollIntoView({block:'nearest'});}
trigger.addEventListener('click',()=>listbox.hidden?openPicker():closePicker());
trigger.addEventListener('keydown',e=>{if(['ArrowDown','ArrowUp'].includes(e.key)){e.preventDefault();openPicker();}});
nodeSelect.addEventListener('change',updatePicker);
listbox.addEventListener('click',e=>{const option=e.target.closest('[role="option"]');if(!option)return;nodeSelect.value=option.dataset.value;nodeSelect.dispatchEvent(new Event('change',{bubbles:true}));closePicker(true);});
picker.addEventListener('keydown',e=>{if(listbox.hidden)return;const items=[...listbox.children],index=items.indexOf(document.activeElement);if(e.key==='Escape'){e.preventDefault();e.stopPropagation();closePicker(true);}else if(['ArrowDown','ArrowUp','Home','End'].includes(e.key)){e.preventDefault();const next=e.key==='Home'?0:e.key==='End'?items.length-1:Math.max(0,Math.min(items.length-1,index+(e.key==='ArrowDown'?1:-1)));items[next]?.focus();}});
document.addEventListener('click',e=>{if(!picker.contains(e.target))closePicker();});
document.getElementById('node-switch-dialog').addEventListener('close',()=>closePicker());
