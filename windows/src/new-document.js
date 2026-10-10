const units = { px: { name: '像素' }, in: { name: '英寸', perInch: 1 }, mm: { name: '毫米', perInch: 25.4 }, cm: { name: '厘米', perInch: 2.54 }, pt: { name: '点', perInch: 72 } };
const preset = (id, name, width, height, unit = 'px', resolution = 72, background = '#ffffff') => ({ id, name, width, height, unit, resolution, background });
export const presets = {
  print: [
    preset('letter', '美国信纸 (Letter)', 8.5, 11, 'in', 300),
    preset('legal', '法律文件用纸 (Legal)', 8.5, 14, 'in', 300),
    preset('tabloid', '小报用纸 (Tabloid)', 11, 17, 'in', 300),
    preset('a4', 'A4', 210, 297, 'mm', 300),
    preset('a6', 'A6', 105, 148, 'mm', 300),
    preset('a5', 'A5', 148, 210, 'mm', 300),
    preset('a3', 'A3', 297, 420, 'mm', 300),
    preset('b5', 'B5', 176, 250, 'mm', 300),
    preset('b4', 'B4', 250, 353, 'mm', 300),
    preset('b3', 'B3', 353, 500, 'mm', 300),
    preset('c4', 'C4', 229, 324, 'mm', 300),
    preset('c5', 'C5', 162, 229, 'mm', 300),
    preset('a2', 'A2', 420, 594, 'mm', 300),
    preset('postcard', '明信片', 100, 148, 'mm', 300)
  ],
  photo: [
    preset('photo-4x6', '照片 4 × 6', 4, 6, 'in', 300),
    preset('photo-5x7', '照片 5 × 7', 5, 7, 'in', 300),
    preset('photo-8x10', '照片 8 × 10', 8, 10, 'in', 300),
    preset('photo-square', '方形照片', 2000, 2000, 'px', 300),
    preset('photo-landscape', '横向照片', 3000, 2000, 'px', 300),
    preset('photo-portrait', '纵向照片', 2000, 3000, 'px', 300)
  ],
  art: [
    preset('art-square', '方形插画', 2000, 2000, 'px', 300, 'transparent'),
    preset('art-a4', 'A4 插画', 210, 297, 'mm', 300, 'transparent'),
    preset('art-a3', 'A3 海报', 297, 420, 'mm', 300),
    preset('art-hd', '高清图稿', 1920, 1080, 'px', 300, 'transparent'),
    preset('art-icon', '图标', 512, 512, 'px', 72, 'transparent'),
    preset('art-banner', '横幅', 2400, 800, 'px', 72, 'transparent')
  ],
  web: [
    preset('web-1280', '网页 1280', 1280, 800),
    preset('web-1440', '网页 1440', 1440, 900),
    preset('web-1920', '网页 1920', 1920, 1080),
    preset('web-square', '社交媒体方形', 1080, 1080),
    preset('web-story', '竖屏故事', 1080, 1920),
    preset('web-cover', '封面横幅', 1600, 900)
  ],
  mobile: [
    preset('mobile-small', '手机 750 × 1334', 750, 1334),
    preset('mobile-hd', '手机 1080 × 1920', 1080, 1920),
    preset('mobile-tall', '手机 1170 × 2532', 1170, 2532),
    preset('mobile-android', 'Android 1080 × 2400', 1080, 2400),
    preset('mobile-tablet', '平板 1536 × 2048', 1536, 2048)
  ],
  video: [
    preset('video-720', 'HD 720p', 1280, 720),
    preset('video-1080', 'Full HD 1080p', 1920, 1080),
    preset('video-4k', 'UHD 4K', 3840, 2160),
    preset('video-vertical', '竖屏视频', 1080, 1920),
    preset('video-cinema', '电影宽屏', 2048, 858)
  ]
};
export function toPixels(value, unit, resolution) {
  return unit === 'px' ? value : value / units[unit].perInch * resolution;
}
function fromPixels(value, unit, resolution) {
  return unit === 'px' ? value : value / resolution * units[unit].perInch;
}
const rounded = value => Math.round(value * 1000000) / 1000000;
const number = value => Number(value.toFixed(3)).toString();
const storageKey = 'compositor.new-document.v1';
function isPreset(value) {
  return value && typeof value.id === 'string' && typeof value.name === 'string' && value.name.length <= 100 &&
    Number.isFinite(value.width) && value.width > 0 && Number.isFinite(value.height) && value.height > 0 &&
    units[value.unit] && Number.isFinite(value.resolution) && value.resolution >= 1 && value.resolution <= 9600 &&
    (value.background === 'transparent' || /^#[\da-f]{6}$/i.test(value.background));
}
export function setupNewDocument(onCreate) {
  const $ = id => document.getElementById(id);
  let store = { saved: [], recent: [] };
  try {
    const value = JSON.parse(localStorage.getItem(storageKey));
    if (value) store = { saved: (Array.isArray(value.saved) ? value.saved : []).filter(isPreset).slice(0, 30), recent: (Array.isArray(value.recent) ? value.recent : []).filter(isPreset).slice(0, 10) };
  } catch {}
  let category = 'print', selected = 'letter', unit = 'in', resolutionUnit = 'ppi', sequence = 1;
  const persist = () => { try { localStorage.setItem(storageKey, JSON.stringify(store)); } catch { status('预设已保存在当前会话；本机存储不可用。'); } };
  const all = () => category === 'saved' || category === 'recent' ? store[category] : presets[category];
  const resolution = () => Math.round(Number($('new-resolution').value) * (resolutionUnit === 'ppcm' ? 2.54 : 1) * 10000) / 10000;
  function settings() {
    const width = Number($('new-width').value), height = Number($('new-height').value), ppi = resolution();
    const pixelWidth = Math.round(toPixels(width, unit, ppi)), pixelHeight = Math.round(toPixels(height, unit, ppi));
    if (![width, height, ppi].every(n => Number.isFinite(n) && n > 0) || ppi < 1 || ppi > 9600) throw new Error('请输入有效的宽度、高度和分辨率（1–9600 ppi）。');
    if (pixelWidth < 1 || pixelHeight < 1 || pixelWidth > 16384 || pixelHeight > 16384 || pixelWidth * pixelHeight > 64 * 1024 * 1024) throw new Error('画布每边需为 1–16384 像素，总像素不可超过 6400 万。请减小尺寸或分辨率。');
    return {
      width: pixelWidth, height: pixelHeight, resolution: ppi,artboard:$('new-artboard').checked,colorMode:$('new-color-mode').value,
      background: $('new-background').value === 'custom' ? $('new-background-color').value : $('new-background').value,
      title: $('new-name').value.trim() || '未标题-' + sequence,
      preset: { width, height, unit, resolution: ppi }
    };
  }
  function update() {
    $('preset-status').hidden = true;
    const w = Number($('new-width').value), h = Number($('new-height').value);
    $('portrait').setAttribute('aria-pressed', String(h >= w));
    $('landscape').setAttribute('aria-pressed', String(w > h));
    $('new-error').hidden = true;
    try {
      const p = settings();
      $('new-size-preview').textContent = p.width + ' × ' + p.height + ' 像素 · ' + number(p.resolution) + ' ppi';
      $('create-document').disabled = false;
    } catch (error) {
      $('new-size-preview').textContent = '';
      $('new-error').textContent = error.message; $('new-error').hidden = false;
      $('create-document').disabled = true;
    }
  }
  function status(message) { $('preset-status').textContent = message; $('preset-status').hidden = false; }
  function select(item) {
    selected = item.id; unit = item.unit; resolutionUnit = 'ppi';
    $('new-artboard').checked=!!item.artboard;
    $('new-width').value = item.width; $('new-height').value = item.height;
    $('new-unit').value = unit; $('new-resolution-unit').value = 'ppi'; $('new-resolution').value = item.resolution;
    $('new-resolution').min = 1; $('new-resolution').max = 9600;
    const known = ['#ffffff', '#000000', 'transparent'].includes(item.background);
    $('new-background').value = known ? item.background : 'custom';
    $('new-background-color').value = item.background === 'transparent' ? '#ffffff' : item.background;
    $('new-background-color').disabled = item.background === 'transparent';
    update(); markSelected();
  }
  function markSelected() {
    document.querySelectorAll('.preset-card').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.preset === selected)));
    $('delete-preset').hidden = category !== 'saved' || !store.saved.some(item => item.id === selected);
  }
  function renderPresets() {
    const query = $('preset-search').value.trim().toLowerCase();
    const list = all().filter(item => (item.name + ' ' + item.width + ' ' + item.height + ' ' + units[item.unit].name).toLowerCase().includes(query));
    $('preset-heading').textContent = (category === 'recent' ? '最近使用的预设' : category === 'saved' ? '已保存的预设' : '空白文档预设') + ' (' + list.length + ')';
    const grid = $('preset-grid'); grid.replaceChildren();
    for (const item of list) {
      const button = document.createElement('button'); button.type = 'button'; button.className = 'preset-card'; button.dataset.preset = item.id;
      button.setAttribute('aria-pressed', String(item.id === selected));
      const holder = document.createElement('span'); holder.className = 'preset-icon';
      const icon = document.createElement('img'); icon.src = 'icons/file.svg'; icon.alt = '';
      const area = toPixels(item.width, item.unit, 72) * toPixels(item.height, item.unit, 72);
      const paperSizes = { letter: 58, legal: 62, tabloid: 112, a4: 84, a6: 54, a5: 68, a3: 112, b5: 72, b4: 96, b3: 110, c4: 90, c5: 74 };
      const size = paperSizes[item.id] || Math.max(50, Math.min(102, 76 * Math.sqrt(area / (595 * 842))));
      icon.style.width = size + 'px'; icon.style.height = size + 'px'; holder.append(icon);
      const title = document.createElement('span'); title.className = 'preset-title'; title.textContent = item.name;
      const sizeText = document.createElement('span'); sizeText.className = 'preset-size';
      const shortUnit = { mm: 'mm', cm: 'cm', pt: 'pt' }[item.unit] || units[item.unit].name;
      sizeText.textContent = number(item.width) + ' × ' + number(item.height) + ' ' + shortUnit + ' @ ' + number(item.resolution) + ' ppi';
      button.title = item.name + '\n' + sizeText.textContent;
      button.append(holder, title, sizeText); button.onclick = () => select(item);
      grid.append(button);
    }
    $('preset-empty').hidden = list.length !== 0;
    $('preset-empty').textContent = query ? '没有找到匹配的预设，请尝试其他名称或尺寸。' : category === 'saved' ? '设置右侧参数，然后点击名称旁的保存图标，即可添加自己的预设。' : '创建画布后，使用过的尺寸会显示在这里。';
    markSelected();
  }
  function chooseCategory(next) {
    category = next; $('preset-search').value = '';
    document.querySelectorAll('[data-category]').forEach(button => { const active = button.dataset.category === category; button.setAttribute('aria-selected', String(active)); button.tabIndex = active ? 0 : -1; });
    if (!all().some(item => item.id === selected) && all().length) select(all()[0]);
    renderPresets(); document.querySelector('.new-library-scroll').scrollTop = 0;
  }
  for (const button of document.querySelectorAll('[data-category]')) {
    button.onclick = () => chooseCategory(button.dataset.category);
    button.onkeydown = event => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const tabs = [...document.querySelectorAll('[data-category]')], index = tabs.indexOf(button);
      const next = event.key === 'Home' ? tabs[0] : event.key === 'End' ? tabs.at(-1) : tabs[(index + (event.key === 'ArrowLeft' ? -1 : 1) + tabs.length) % tabs.length];
      chooseCategory(next.dataset.category); next.focus();
    };
  }
  for (const id of ['new-width', 'new-height', 'new-resolution']) $(id).addEventListener('input', () => { selected = null; update(); markSelected(); });
  $('new-unit').onchange = () => {
    const next = $('new-unit').value, ppi = resolution();
    for (const id of ['new-width', 'new-height']) {
      const value = Number($(id).value);
      if (Number.isFinite(value) && value > 0 && Number.isFinite(ppi) && ppi > 0) {
        const converted = fromPixels(toPixels(value, unit, ppi), next, ppi);
        $(id).value = next === 'px' ? Math.round(converted) : rounded(converted);
      }
    }
    unit = next; update();
  };
  $('new-resolution-unit').onchange = () => {
    const ppi = resolution();
    resolutionUnit = $('new-resolution-unit').value;
    $('new-resolution').value = rounded(ppi / (resolutionUnit === 'ppcm' ? 2.54 : 1));
    $('new-resolution').min = resolutionUnit === 'ppcm' ? 1 / 2.54 : 1;
    $('new-resolution').max = resolutionUnit === 'ppcm' ? 9600 / 2.54 : 9600;
    update();
  };
  function orientation(landscape) {
    const w = Number($('new-width').value), h = Number($('new-height').value);
    if (Number.isFinite(w) && Number.isFinite(h) && (landscape ? w < h : w > h)) {
      $('new-width').value = h; $('new-height').value = w; selected = null; markSelected();
    }
    update();
  }
  $('portrait').onclick = () => orientation(false); $('landscape').onclick = () => orientation(true);
  $('new-background').onchange = () => {
    const value = $('new-background').value;
    $('new-background-color').disabled = value === 'transparent';
    if (value !== 'transparent' && value !== 'custom') $('new-background-color').value = value;
    update();
  };
  $('new-background-color').oninput = () => { $('new-background').value = 'custom'; update(); };
  $('new-color-mode').onchange=()=>{const cmyk=$('new-color-mode').value==='CMYK';$('new-profile-import').hidden=!cmyk;$('new-color-profile').replaceChildren(new Option(cmyk?'Windows SWOP（CMYK）':'工作中的 RGB: sRGB IEC61966-2.1'));};
  $('preset-search').oninput = renderPresets; $('search-presets').onclick = renderPresets;
  $('preset-search').onkeydown = event => { if (event.key === 'Enter') { event.preventDefault(); renderPresets(); } };
  $('save-preset').onclick = () => {
    try {
      const p = settings();
      const title = $('new-name').value.trim();
      const item = { ...p.preset, id: 'saved-' + crypto.randomUUID(), name: title && !title.startsWith('未标题-') ? title : '自定义 ' + p.preset.width + ' × ' + p.preset.height + ' ' + units[unit].name, background: p.background,artboard:p.artboard };
      store.saved.unshift(item); store.saved = store.saved.slice(0, 30); persist();
      selected = item.id; chooseCategory('saved'); status('预设已保存，可在“已保存”分类中使用。');
    } catch (error) { status(error.message); }
  };
  $('delete-preset').onclick = () => {
    store.saved = store.saved.filter(item => item.id !== selected); selected = null; persist(); chooseCategory('saved'); update();
  };
  $('new-form').onsubmit = async event => {
    event.preventDefault();if($('create-document').disabled)return;$('create-document').disabled=true;
    try {
      const p = settings();await onCreate(p);
      const item = { ...p.preset, id: 'recent-' + crypto.randomUUID(), name: p.title, background: p.background,artboard:p.artboard };
      store.recent = [item, ...store.recent.filter(old => old.width !== item.width || old.height !== item.height || old.unit !== item.unit || old.resolution !== item.resolution || old.background !== item.background)].slice(0, 10);
      persist(); sequence++; $('new-dialog').close();
    } catch (error) { $('new-error').textContent = error.message; $('new-error').hidden = false; }finally{$('create-document').disabled=false;}
  };
  chooseCategory('print');
  return {
    open() { $('new-name').value = '未标题-' + sequence; update(); renderPresets(); $('new-dialog').showModal(); }
  };
}
