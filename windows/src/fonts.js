export function setupFonts(api, refresh, toast) {
  const selectors=['font','type-font'].map(id=>document.getElementById(id));let catalog=[],favorites=[];
  try { favorites=JSON.parse(localStorage.getItem('compositor.fontFavorites')||'[]'); } catch {}
  const search=document.getElementById('font-search'),star=document.getElementById('font-favorite'),style=document.getElementById('font-style');
  function populate() {
    for(const select of selectors) {
      const value=select.value, query=search.value.trim().toLocaleLowerCase(), all=catalog.filter(f=>f.family.toLocaleLowerCase().includes(query));
      all.sort((a,b)=>Number(favorites.includes(b.family))-Number(favorites.includes(a.family))||a.family.localeCompare(b.family,'zh-CN'));
      select.replaceChildren();for(const f of all){const o=new Option((favorites.includes(f.family)?'★ ':'')+f.family,f.family);o.style.fontFamily=f.family;select.add(o);}
      if(value && !all.some(f=>f.family===value))select.add(new Option(value,value));select.value=value;
    }
    document.getElementById('font-count').textContent=`${catalog.length} 个本地字体`;
    update();
  }
  function update() {
    const value=selectors[0].value;star.classList.toggle('active',favorites.includes(value));star.setAttribute('aria-pressed',String(favorites.includes(value)));
    const selected=style.value;style.replaceChildren();
    for(const s of catalog.find(f=>f.family===value)?.styles || [{name:'Regular',weight:400,italic:false},{name:'Bold',weight:700,italic:false}]) {const o=new Option(s.name,`${s.weight}:${s.italic}`);style.add(o);}
    style.value=[...style.options].some(o=>o.value===selected)?selected:style.options[0]?.value;
  }
  star.onclick=()=>{const name=selectors[0].value;if(!name)return;favorites=favorites.includes(name)?favorites.filter(f=>f!==name):[...favorites,name];try{localStorage.setItem('compositor.fontFavorites',JSON.stringify(favorites));}catch{}populate();};
  search.oninput=populate;selectors.forEach(s=>s.addEventListener('change',update));
  // Enumeration is deferred until the workspace has painted and never delays startup.
  requestAnimationFrame(()=>api.fonts().then(r=>{if(!r.ok)throw new Error(r.error);catalog=r.value;populate();}).catch(e=>toast('本地字体读取失败：'+e.message)));
  return {update};
}
