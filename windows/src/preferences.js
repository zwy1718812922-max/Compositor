import {getPreferences,preferenceDefaults,savePreferences} from './preferences-store.mjs';

const $ = id => document.getElementById(id);
export function setupPreferences(state) {
  const dialog = $('preferences-dialog'), form = $('preferences-form');
  function apply(values) {
    document.documentElement.style.setProperty('--workspace-background', values.canvasBackground);
    document.documentElement.style.setProperty('--checker-size', values.checkerSize + 'px');
    state.refreshRecents();
    state.trimHistory();
  }
  function fill(values, snap) {
    for (const name of Object.keys(preferenceDefaults)) $('pref-' + name).value = values[name];
    $('pref-snap').checked = snap;
  }
  apply(getPreferences());
  form.onsubmit = event => {
    event.preventDefault();
    const values = Object.fromEntries(Object.keys(preferenceDefaults).map(name => [name,$('pref-' + name).value]));
    for (const name of ['checkerSize','historySteps','recentLimit']) values[name] = Number(values[name]);
    apply(savePreferences(values));
    const snap = $('snap-enabled');
    if (snap.checked !== $('pref-snap').checked) { snap.checked = $('pref-snap').checked; snap.dispatchEvent(new Event('change')); }
    dialog.close(); state.toast('首选项已保存');
  };
  $('preferences-reset').onclick = () => fill(preferenceDefaults, true);
  return {open() { fill(getPreferences(), $('snap-enabled').checked); dialog.showModal(); }};
}
