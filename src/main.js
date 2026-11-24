import './style.css';
import { Engine } from './engine.js';
import { Input } from './input.js';
import { AudioSystem } from './audio.js';
import { UI } from './ui.js';
import { HUD } from './hud.js';
import { Match } from './game.js';
import { settings, saveSettings, profile } from './settings.js';

window.addEventListener('error', (e) => {
  const sub = document.querySelector('.loading-sub');
  const msg = e.message || String(e.error || 'unknown error');
  const stack = (e.error && e.error.stack ? e.error.stack : '').split('\n').slice(0, 4).join(' | ');
  window.__lastErr = msg + ' :: ' + stack;
  if (sub) sub.textContent = 'ERROR: ' + msg + ' :: ' + stack.slice(0, 260);
  document.title = 'ERROR: ' + msg;
});
window.addEventListener('unhandledrejection', (e) => {
  const sub = document.querySelector('.loading-sub');
  if (sub) sub.textContent = 'ASYNC ERROR: ' + (e.reason?.message || e.reason);
  document.title = 'ERROR: ' + (e.reason?.message || e.reason);
});

const canvas = document.getElementById('stage');
const engine = new Engine(canvas);
const audio = new AudioSystem();
const input = new Input(canvas);

let match = null;
let lastMode = 'br';
let lastTeam = 1;

const hud = new HUD({
  input,
  audio,
  onInventoryToggle: (open) => {
    if (match) input.setEnabled(!open && !match.paused && !match.finished);
  }
});
hud.hide();
document.documentElement.style.setProperty('--hud-scale', settings.hudScale);

const ui = new UI({
  engine,
  audio,
  onDeploy: (modeId, teamSize) => startMatch(modeId, teamSize)
});
ui.onExitMatch = () => exitToLobby();
ui.onRematch = () => {
  const mode = lastMode, team = lastTeam;
  exitToLobby();
  startMatch(mode, team);
};
ui.onResume = () => match?.resume();
ui.onSettingsChange = () => applySettings();
ui.onCustomizeLayout = () => startLayoutEditor();

window.ui = ui;
window.settings = settings;

// Auto-pick a sensible quality on phones the first time the game runs.
try {
  if (!localStorage.getItem('skyfall.settings.v1') && (input.usingTouch || (navigator.hardwareConcurrency || 8) <= 4)) {
    settings.graphics = 'medium';
    saveSettings();
  }
} catch { /* ignore */ }

function applySettings() {
  engine.setQuality(settings.graphics);
  audio.updateVolumes();
  document.documentElement.style.setProperty('--hud-scale', settings.hudScale);
  hud.applyTouchLayout();
  hud.updateTouchVisibility();
}

engine.onQualityChange = () => {
  if (ui.menuChar) ui.setMenuCharacter();
};

function cleanupMatch() {
  if (!match) return;
  try { match.dispose(); } catch (e) { console.error('match dispose', e); }
  match = null;
  hud.hide();
  input.onAction = null;
  input.setEnabled(false);
  ui.root.classList.remove('ending');
  ui.hideModal();
}

function startMatch(modeId, teamSize) {
  cleanupMatch();
  audio.ensure();
  audio.resume?.();
  lastMode = modeId;
  lastTeam = teamSize;
  try {
    match = new Match({ engine, audio, ui, hud, input, modeId, teamSize });
  } catch (e) {
    window.__matchErr = e.stack || String(e);
    console.error('failed to start match', e.stack || e);
    ui.toast('Could not start match: ' + e.message, 4000);
    ui.show();
    ui.renderHome();
    return;
  }
  hud.show({ mode: match.mode, bus: match.phase === 'bus' });
  input.setEnabled(true);
  if (match.phase !== 'bus' && !input.usingTouch) {
    setTimeout(() => input.requestPointerLock(), 120);
  }
  audio.setListener(match.player.pos);
  ui.root.classList.add('hidden');
  document.getElementById('loading')?.classList.add('hidden');
  if (match.mode.practice) hud.toast('Practice range: unlimited materials, respawning targets', 3200);
  if (match.mode.creative) hud.toast('Creative: unlimited materials - press Q to build', 3200);
}

function exitToLobby() {
  cleanupMatch();
  ui.hideModal();
  ui.root.classList.remove('hidden', 'ending');
  ui.renderHome();
  ui.show();
  engine.activeScene = null;
  engine.activeCamera = null;
}

function startLayoutEditor() {
  ui.hideModal();
  ui.hide();
  ui.root.classList.add('hidden');
  hud.show({ mode: null, bus: false });
  hud.toggleTouchControls(true);
  hud.startLayoutEditor();
  const done = document.createElement('button');
  done.className = 'btn primary layout-done';
  done.textContent = 'Save Layout';
  document.body.appendChild(done);
  const finish = () => {
    hud.stopLayoutEditor();
    hud.toggleTouchControls(input.usingTouch);
    hud.hide();
    done.remove();
    ui.show();
    ui.renderSettings('touch');
  };
  done.addEventListener('click', finish);
}

// Pause handling: escape releases pointer lock, which pauses the match.
input.onPauseRequest = () => {
  if (match && match.player?.alive && !match.paused && !match.finished) match.pause();
};
window.addEventListener('keydown', (e) => {
  if (e.code === 'Escape') {
    if (match?.paused) match.resume();
  }
  if (e.code === 'KeyP' && match && !match.finished) {
    if (match.paused) match.resume(); else match.pause();
  }
});
hud.pauseBtn.addEventListener('click', () => {
  if (match) {
    if (match.paused) match.resume(); else match.pause();
  }
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden && match && match.player?.alive && !match.paused && !match.finished) match.pause();
});

// Boot
applySettings();
ui.show();
ui.setMenuCharacter();
setTimeout(() => {
  document.getElementById('loading')?.classList.add('hidden');
}, 450);

let last = performance.now();
let frames = 0;
function frame(now) {
  const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
  last = now;
  frames++;
  try {
    if (match) {
      match.update(dt);
      engine.render(false, dt);
    } else {
      engine.activeScene = null;
      engine.activeCamera = null;
      engine.render(true, dt);
    }
  } catch (err) {
    console.error('frame error', err);
    if (!frame._warned) {
      frame._warned = true;
      ui.toast('Runtime error: ' + err.message, 5000);
    }
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// Expose for debugging / automated smoke checks.
window.__skyfall = {
  get match() { return match; },
  engine, ui, hud, input, audio, profile, startMatch, exitToLobby
};
