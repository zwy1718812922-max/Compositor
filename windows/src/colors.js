const key='compositor.colors.v1';
let foregroundChanges=0;export const foregroundRevision=()=>foregroundChanges;
let colors={last:'#7aa2ff'};
try{const saved=JSON.parse(localStorage.getItem(key));if(saved)for(const [name,color] of Object.entries(saved))if(/^#[\da-f]{6}$/i.test(color))colors[name]=color;}catch{}
export const lastColor=()=>colors.last;
export const lastTextColor=()=>colors['text-color']||colors['type-color']||colors.last;
export function rememberColor(color,id){if(!/^#[\da-f]{6}$/i.test(color))return;colors.last=color;if(id)colors[id]=color;if(['text-color','type-color'].includes(id))colors['text-color']=colors['type-color']=color;try{localStorage.setItem(key,JSON.stringify(colors));}catch{}}
export function setupColors(isMask){
 for(const id of ['color','gradient-color','type-color','new-background-color']){const input=document.getElementById(id);if(colors[id])input.value=colors[id];}
 document.getElementById('type-color').value=lastTextColor();
 document.addEventListener('input',e=>{if(e.target.type==='color'&&!(isMask()&&['color','gradient-color'].includes(e.target.id))){if(e.target.id==='color')foregroundChanges++;rememberColor(e.target.value,e.target.id);}});
 document.addEventListener('change',e=>{if(e.target.type==='color'&&!(isMask()&&['color','gradient-color'].includes(e.target.id)))rememberColor(e.target.value,e.target.id);});
}
