const key = 'compositor.preferences.v1';
export const preferenceDefaults = Object.freeze({canvasBackground:'#262626',checkerSize:16,historySteps:25,recentLimit:20});
const allowed = {
  canvasBackground:['#262626','#404040','#606060'],
  checkerSize:[8,16,32],
  historySteps:[5,10,25,50],
  recentLimit:[5,10,20]
};
function normalize(value) {
  return Object.fromEntries(Object.entries(preferenceDefaults).map(([name, fallback]) => [name,allowed[name].includes(value?.[name]) ? value[name] : fallback]));
}
let preferences = preferenceDefaults;
try { preferences = normalize(JSON.parse(localStorage.getItem(key))); } catch {}
export function getPreferences() { return preferences; }
export function savePreferences(value) {
  preferences = normalize(value);
  try { localStorage.setItem(key, JSON.stringify(preferences)); } catch {}
  return preferences;
}
