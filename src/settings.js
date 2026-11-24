// Persistent settings + player profile (localStorage).
const KEY = 'skyfall.settings.v1';
const PROFILE_KEY = 'skyfall.profile.v1';

export const DEFAULT_KEYBINDS = {
  forward: 'KeyW', back: 'KeyS', left: 'KeyA', right: 'KeyD',
  jump: 'Space', sprint: 'ShiftLeft', crouch: 'KeyC',
  fire: 'Mouse0', aim: 'Mouse2', reload: 'KeyR', interact: 'KeyE',
  build: 'KeyQ', edit: 'KeyG', resetEdit: 'KeyH',
  inventory: 'Tab', map: 'KeyM', emote: 'KeyT',
  slot1: 'Digit1', slot2: 'Digit2', slot3: 'Digit3', slot4: 'Digit4', slot5: 'Digit5',
  pieceWall: 'Digit1', pieceFloor: 'Digit2', pieceRamp: 'Digit3', pieceRoof: 'Digit4'
};

export const DEFAULT_TOUCH = {
  scale: 1,
  layout: {
    fire: { x: 84, y: 72, size: 1.25 },
    aim: { x: 68, y: 82, size: 1 },
    jump: { x: 91, y: 50, size: 0.95 },
    crouch: { x: 76, y: 55, size: 0.8 },
    sprint: { x: 95, y: 36, size: 0.75 },
    reload: { x: 60, y: 90, size: 0.8 },
    build: { x: 72, y: 94, size: 0.95 },
    edit: { x: 52, y: 82, size: 0.8 },
    interact: { x: 40, y: 78, size: 0.8 },
    inventory: { x: 12, y: 88, size: 0.7 },
    emote: { x: 22, y: 90, size: 0.65 },
    slot1: { x: 33, y: 92, size: 0.62 },
    slot2: { x: 40, y: 92, size: 0.62 },
    slot3: { x: 47, y: 92, size: 0.62 },
    slot4: { x: 54, y: 92, size: 0.62 }
  }
};

export const DEFAULTS = {
  version: 1,
  name: 'RiftRunner',
  graphics: 'high',
  hudScale: 1,
  fov: 78,
  showFps: false,
  crosshair: 'classic',
  touchMode: 'auto',
  sensitivity: { mouse: 0.0023, touch: 0.0062, gamepad: 2.6, scoped: 0.55, build: 1.0, edit: 1.0 },
  invertY: false,
  toggleSprint: false,
  toggleCrouch: false,
  autoFire: true,
  vibration: true,
  deadzone: 0.16,
  audio: { master: 0.8, sfx: 0.9, music: 0.28 },
  keybinds: { ...DEFAULT_KEYBINDS },
  touch: JSON.parse(JSON.stringify(DEFAULT_TOUCH)),
  locker: { outfit: 'outfit_rift', pickaxe: 'pick_rift', glider: 'glider_rift', emote: 'emote_floss' },
  weather: 'auto'
};

function deepMerge(base, extra) {
  const out = Array.isArray(base) ? base.slice() : { ...base };
  for (const k of Object.keys(extra || {})) {
    const v = extra[k];
    if (v && typeof v === 'object' && !Array.isArray(v) && typeof base[k] === 'object' && base[k] !== null) {
      out[k] = deepMerge(base[k], v);
    } else if (v !== undefined) {
      out[k] = v;
    }
  }
  return out;
}

export const settings = (() => {
  let stored = {};
  try { stored = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { stored = {}; }
  return deepMerge(DEFAULTS, stored);
})();

let saveTimer = null;
export function saveSettings() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch { /* storage full */ }
  }, 120);
}

export function resetSettings() {
  const fresh = JSON.parse(JSON.stringify(DEFAULTS));
  for (const k of Object.keys(settings)) delete settings[k];
  Object.assign(settings, fresh);
  saveSettings();
}

const PROFILE_DEFAULT = {
  level: 1, xp: 0, matches: 0, wins: 0, kills: 0, damage: 0, top10: 0,
  rankPoints: 0, bestPlacement: 0, playtime: 0, modeWins: {}, challenges: {}
};

export const profile = (() => {
  let stored = {};
  try { stored = JSON.parse(localStorage.getItem(PROFILE_KEY) || '{}'); } catch { stored = {}; }
  return deepMerge(PROFILE_DEFAULT, stored);
})();

export function saveProfile() {
  try { localStorage.setItem(PROFILE_KEY, JSON.stringify(profile)); } catch { /* ignore */ }
}

export function addXP(amount) {
  profile.xp += amount;
  const need = () => 400 + (profile.level - 1) * 250;
  while (profile.xp >= need()) {
    profile.xp -= need();
    profile.level++;
  }
  saveProfile();
}

export const xpForNext = () => 400 + (profile.level - 1) * 250;
