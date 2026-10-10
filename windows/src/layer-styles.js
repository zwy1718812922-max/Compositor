import { effectNames, defaultEffect, effectBlends, validateStyles } from './effect-model.mjs';
import { applyEffects } from './effects.js';
const $ = id => document.getElementById(id);
const blendLabels = ['正常', '正片叠底', '滤色', '叠加', '变暗', '变亮', '差值', '柔光', '强光'];
const fields = {
  stroke: ['blend','opacity','color','size','position'], dropShadow: ['blend','opacity','color','angle','distance','spread','size'], innerShadow: ['blend','opacity','color','angle','distance','size'],
  innerGlow: ['blend','opacity','color','source','size'], outerGlow: ['blend','opacity','color','spread','size'], satin: ['blend','opacity','color','angle','distance','size','invert'],
  colorOverlay: ['blend','opacity','color'], gradientOverlay: ['blend','opacity','color','color2','angle','gradientType','reverse'], patternOverlay: ['blend','opacity','color','color2','pattern','size'],
  bevel: ['size','depth','direction','angle','altitude','color','opacity','color2','shadowOpacity'], 'bevel-contour': ['contour'], 'bevel-texture': ['texture','textureDepth']
};
const labels = { blend: '混合模式', opacity: '不透明度', color: '颜色', color2: '第二颜色', size: '大小（px）', position: '位置', angle: '角度（°）', distance: '距离（px）', spread: '扩展（%）', source: '源', invert: '反相', gradientType: '渐变类型', reverse: '反向', pattern: '图案', depth: '深度（%）', direction: '方向', altitude: '高度（°）', shadowOpacity: '阴影不透明度', contour: '等高线', texture: '启用纹理', textureDepth: '纹理深度（%）' };
const choices = { position: [['outside','外部'],['inside','内部'],['center','居中']], source: [['edge','边缘'],['center','中心']], gradientType: [['linear','线性'],['radial','径向']], pattern: [['checker','棋盘格'],['stripes','斜条纹'],['dots','圆点']], direction: [['up','上'],['down','下']], contour: [['linear','线性'],['cone','圆锥'],['ring','环形']] };
export function setupLayerStyles(state) {
  const dialog = $('fx-dialog'); let session = null, selected = 'blending', frame;
  function presets() { try { const p = JSON.parse(localStorage.getItem('compositor.layerStyles') || '[]'); return Array.isArray(p) ? p.slice(0,20).filter(v => { try { return typeof v.name === 'string' && v.name.length <= 80 && !!validateStyles(v.styles); } catch { return false; } }) : []; } catch { return []; } }
  function refreshPresets() { $('fx-presets').replaceChildren(new Option('选择已保存样式…', '')); presets().forEach((p, i) => $('fx-presets').add(new Option(p.name, String(i)))); }
  const get = () => session.layer;
  function preview() {
    cancelAnimationFrame(frame); frame = requestAnimationFrame(() => {
      const l = get(), original = session.original;
      if (!$('fx-preview').checked)state.renderLayer(l,original);
      else state.render();
      const c = document.createElement('canvas'); c.width = c.height = 192; const ctx = c.getContext('2d'); ctx.fillStyle = '#bfbfbf'; ctx.fillRect(54,54,84,84);
      const sample = applyEffects(c, l), target = $('fx-sample').getContext('2d'); target.clearRect(0,0,192,192); target.globalAlpha = l.opacity; target.drawImage(sample,0,0); target.globalAlpha = 1;
    });
  }
  function control(key, value, change) {
    const row = document.createElement('label'); row.className = 'fx-field'; const caption = document.createElement('span'); caption.textContent = labels[key] || key; row.append(caption);
    let input;
    if (key === 'blend' || choices[key]) { input = document.createElement('select'); (key === 'blend' ? effectBlends.map((v,i) => [v,blendLabels[i]]) : choices[key]).forEach(([v,n]) => input.add(new Option(n,v))); input.value = value; }
    else { input = document.createElement('input'); input.type = typeof value === 'boolean' ? 'checkbox' : key.startsWith('color') ? 'color' : 'number';
      if (input.type === 'checkbox') input.checked = value;
      else if (input.type === 'number') { input.value = ['opacity','shadowOpacity'].includes(key) ? Math.round(value * 100) : value; input.step = 1; input.min = key === 'angle' ? -360 : 0; input.max = { opacity:100,shadowOpacity:100,size:250,angle:360,distance:1000,spread:100,depth:1000,altitude:90,textureDepth:100 }[key] || 1000; }
      else input.value = value;
    }
    input.id = 'fx-' + key; input.setAttribute('aria-label', caption.textContent); row.append(input);
    input.oninput = () => { if (!input.checkValidity()) return; const next = input.type === 'checkbox' ? input.checked : input.type === 'number' ? Number(input.value) / (['opacity','shadowOpacity'].includes(key) ? 100 : 1) : input.value; change(next); preview(); };
    return row;
  }
  function showSettings(kind) {
    selected = kind; $('fx-settings').replaceChildren(); $('fx-heading').textContent = kind === 'blending' ? '混合选项' : kind === 'bevel-contour' ? '等高线' : kind === 'bevel-texture' ? '纹理' : effectNames[kind];
    document.querySelectorAll('.fx-kind').forEach(b => b.classList.toggle('active', b.dataset.effect === kind));
    const l = get();
    if (kind === 'blending') {
      $('fx-settings').append(control('blend', l.blend === 'pass-through' ? 'source-over' : l.blend, v => l.blend = v), control('opacity', l.opacity, v => l.opacity = v));
      const fill = control('opacity', l.fillOpacity ?? 1, v => l.fillOpacity = v); fill.firstChild.textContent = '填充不透明度'; fill.querySelector('input').id = 'fx-fill-opacity'; fill.querySelector('input').setAttribute('aria-label','填充不透明度'); $('fx-settings').append(fill);
      const note = document.createElement('p'); note.className = 'fx-note'; note.textContent = '填充控制图层内容；图层样式保持独立。效果保存在图层上，可随时重新编辑。'; $('fx-settings').append(note);
    } else {
      const key = kind.startsWith('bevel-') ? 'bevel' : kind;
      l.styles[key] ||= defaultEffect(key); const e = l.styles[key];
      for (const field of fields[kind]) $('fx-settings').append(control(field, e[field], v => { e[field] = v; l.stylesModified = true; }));
    }
  }
  function list() {
    $('fx-list').replaceChildren();
    for (const [key, title] of [['blending','混合选项'], ...Object.entries(effectNames).flatMap(([k,n]) => k === 'bevel' ? [[k,n],['bevel-contour','等高线'],['bevel-texture','纹理']] : [[k,n]])]) {
      const row = document.createElement('div'); row.className = 'fx-list-row';
      if (key !== 'blending' && key !== 'bevel-contour') {
        const check = document.createElement('input'); check.type = 'checkbox'; check.dataset.effectCheck = key;
        const e = get().styles[key === 'bevel-texture' ? 'bevel' : key]; check.checked = key === 'bevel-texture' ? !!e?.texture : !!e?.enabled; check.setAttribute('aria-label', '启用' + title);
        check.onchange = () => { const k = key === 'bevel-texture' ? 'bevel' : key; get().styles[k] ||= defaultEffect(k); get().styles[k][key === 'bevel-texture' ? 'texture' : 'enabled'] = check.checked; if (key === 'bevel-texture' && check.checked) get().styles.bevel.enabled = true; get().stylesModified = true; showSettings(key); preview(); }; row.append(check);
      }
      const b = document.createElement('button'); b.type = 'button'; b.className = 'fx-kind' + (key.startsWith('bevel-') ? ' fx-sub' : ''); b.dataset.effect = key; b.textContent = title; b.onclick = () => showSettings(key); row.append(b); $('fx-list').append(row);
    }
  }
  $('fx-reset').onclick = () => { get().styles = {}; get().fillOpacity = 1; get().opacity = 1; get().blend = 'source-over'; get().stylesModified = true; list(); showSettings('blending'); preview(); };
  $('fx-save-style').onclick = () => { const name = $('fx-preset-name').value.trim(); if (!name) { $('fx-preset-name').focus(); return; } const p = presets().filter(v => v.name !== name); p.unshift({ name, styles: structuredClone(get().styles), fillOpacity: get().fillOpacity ?? 1 }); localStorage.setItem('compositor.layerStyles', JSON.stringify(p.slice(0,20))); refreshPresets(); state.toast('样式已保存在本机，可应用到其他图层'); };
  $('fx-presets').onchange = () => { const p = presets()[Number($('fx-presets').value)]; if ($('fx-presets').value === '' || !p) return; get().styles = structuredClone(p.styles); get().fillOpacity = p.fillOpacity; get().stylesModified = true; list(); showSettings('blending'); preview(); };
  $('fx-preview').onchange = preview;
  $('fx-apply').onclick = () => { dialog.returnValue = 'apply'; dialog.close(); };
  $('fx-cancel').onclick = () => dialog.close('cancel');
  dialog.addEventListener('close', () => {
    if (!session) return; cancelAnimationFrame(frame); const { layer, original, before } = session;
    const modified = JSON.stringify({ styles:layer.styles, stylesEnabled:layer.stylesEnabled, fillOpacity:layer.fillOpacity, opacity:layer.opacity, blend:layer.blend, stylesModified:layer.stylesModified });
    const previous = JSON.stringify(original); session = null;
    if (dialog.returnValue !== 'apply') { for (const key of Object.keys(original)) { if (original[key] === undefined) delete layer[key]; else layer[key] = original[key]; } state.render(); state.refresh(); }
    else if (modified !== previous) { state.history.push(before); state.changed('已应用图层样式，可双击 fx 再次编辑'); } else { state.render(); state.refresh(); }
  });
  return { open() {
    const l = state.active(); if (state.locked(l)) { state.toast('请先解锁图层。'); return; }
    session = { layer: l, before: state.snapshot(), original: { styles: l.styles ? structuredClone(l.styles) : undefined, stylesEnabled:l.stylesEnabled, fillOpacity:l.fillOpacity, opacity:l.opacity, blend:l.blend, stylesModified:l.stylesModified } };
    l.styles = structuredClone(l.styles || {}); l.stylesEnabled = true; $('fx-layer-name').textContent = l.name; $('fx-preview').checked = true;
    dialog.returnValue = 'cancel'; refreshPresets(); list(); showSettings('blending'); dialog.showModal(); preview();
  } };
}
