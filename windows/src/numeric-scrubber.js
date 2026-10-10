export function setupNumericScrubbing(state) {
  let drag=null,ignoreClick=false;
  const numeric=e=>e?.matches('input[type=number],input[type=range]');
  function finish(cancel=false) {
    if(!drag)return;const d=drag;drag=null;document.body.classList.remove('numeric-dragging');state.end?.(cancel,d.transaction);setTimeout(()=>ignoreClick=false,0);
    if(cancel){d.input.value=d.initial;d.input.dispatchEvent(new Event('input',{bubbles:true}));if(!d.transaction?.pushed)d.input.dispatchEvent(new Event('change',{bubbles:true}));}
  }
  document.addEventListener('pointerdown',e=>{
    if(e.button!==0||drag||state.busy())return;
    const label=e.target.closest('label'), input=numeric(e.target)?e.target:label?.querySelector('input[type=number],input[type=range]');
    if(!input||input.disabled||input.readOnly)return;
    const onLabel=e.target!==input;if(onLabel)e.preventDefault();
    drag={input,initial:input.value,x:e.clientX,y:e.clientY,id:e.pointerId,onLabel,active:false,range:input.type==='range'};
    if(drag.range&&!onLabel){drag.active=true;drag.transaction=state.begin(input);}
  },true);
  document.addEventListener('pointermove',e=>{
    if(!drag||e.pointerId!==drag.id)return;const d=drag,dx=e.clientX-d.x;
    if(d.range&&!d.onLabel)return;
    if(!d.active&&Math.abs(dx)<4)return;
    if(!d.active){d.active=true;d.transaction=state.begin(d.input);document.body.classList.add('numeric-dragging');}
    e.preventDefault();const step=d.input.step==='any'?0.1:Number(d.input.step)||1, min=d.input.min===''?-100000:Number(d.input.min),max=d.input.max===''?100000:Number(d.input.max);
    const precision=Math.max(0,(String(step).split('.')[1]||'').length),sensitivity=e.shiftKey?.1:e.altKey?10:1;
    const value=Math.max(min,Math.min(max,Number(d.initial)+Math.round(dx*sensitivity)*step)).toFixed(precision);
    d.input.value=value;d.input.dispatchEvent(new Event('input',{bubbles:true}));d.input.dispatchEvent(new Event('change',{bubbles:true}));ignoreClick=true;
  },{capture:true,passive:false});
  document.addEventListener('pointerup',()=>finish(),true);document.addEventListener('pointercancel',()=>finish(true),true);
  document.addEventListener('click',e=>{if(ignoreClick){e.preventDefault();e.stopPropagation();ignoreClick=false;}},true);
  document.addEventListener('keydown',e=>{if(drag?.active&&e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();finish(true);}},true);
  window.addEventListener('blur',()=>finish());
}
