import { MODES, modeById, LOCKER_ITEMS, OUTLETS, RARITIES, rarityById, rankFor, RANK_TIERS, WEAPONS, PLAYER_CAPS } from './data.js';
import { settings, saveSettings, profile, saveProfile, resetSettings, addXP, xpForNext, DEFAULT_TOUCH } from './settings.js';
import { Character } from './character.js';

const PRETTY_KEYS = {
  Mouse0: 'Left Click', Mouse1: 'Middle Click', Mouse2: 'Right Click', Space: 'Space', ShiftLeft: 'Left Shift',
  ControlLeft: 'Left Ctrl', Tab: 'Tab', AltLeft: 'Left Alt'
};
const prettyKey = (code) => PRETTY_KEYS[code] || code.replace('Key', '').replace('Digit', '');

const MODE_GROUPS = [
  { title: 'Battle Royale', ids: ['br', 'zero', 'ranked', 'rumble'] },
  { title: 'Arenas', ids: ['boxfights', 'zonewars', 'duel1', 'duel2', 'duel3', 'duel4'] },
  { title: 'Sandbox', ids: ['creative', 'practice'] }
];

export class UI {
  constructor({ engine, audio, onDeploy }) {
    this.engine = engine;
    this.audio = audio;
    this.onDeploy = onDeploy;
    this.selectedMode = 'br';
    this.teamSize = 1;
    this.menuChar = null;
    this.onSettingsChange = null;
    this.matchmakingTimer = null;
    this.buildShell();
    this.renderHome();
    this.setMenuCharacter();
  }

  buildShell() {
    this.root = document.getElementById('menu');
    this.root.innerHTML = `
      <div class="lobby-bg"></div>
      <header class="lobby-top">
        <div class="brand" data-nav="home">
          <div class="brand-mark">SA</div>
          <div class="brand-text"><h1>SKYFALL<span>ARENA</span></h1><p>Original battle royale</p></div>
        </div>
        <nav class="lobby-nav">
          <button class="nav-btn active" data-nav="home">Play</button>
          <button class="nav-btn" data-nav="locker">Locker</button>
          <button class="nav-btn" data-nav="stats">Career</button>
          <button class="nav-btn" data-nav="settings">Settings</button>
          <button class="nav-btn" data-nav="info">How to Play</button>
        </nav>
        <div class="profile-chip">
          <div class="profile-level">1</div>
          <div class="profile-meta"><span class="profile-name">Player</span><span class="profile-rank">Rookie</span></div>
          <div class="profile-xp"><div class="profile-xp-fill"></div></div>
        </div>
      </header>
      <main class="lobby-body" id="lobby-body"></main>
      <footer class="lobby-foot">
        <span>Scroll horizontally for more modes</span>
        <span class="foot-right">v1.0.0 • local matches vs AI • offline friendly</span>
      </footer>
      <div class="lobby-toast" id="lobby-toast"></div>
      <div class="modal-layer" id="modal-layer"></div>
    `;
    this.body = this.root.querySelector('#lobby-body');
    this.toastEl = this.root.querySelector('#lobby-toast');
    this.modalLayer = this.root.querySelector('#modal-layer');
    this.root.querySelectorAll('[data-nav]').forEach((b) => {
      b.addEventListener('click', () => {
        if (this.audio) this.audio.ui();
        const dest = b.dataset.nav;
        this.root.querySelectorAll('.nav-btn').forEach((n) => n.classList.toggle('active', n === b));
        if (dest === 'home') this.renderHome();
        else if (dest === 'locker') this.renderLocker();
        else if (dest === 'settings') this.renderSettings();
        else if (dest === 'stats') this.renderStats();
        else if (dest === 'info') this.renderInfo();
      });
    });
    this.refreshProfileChip();
  }

  get isVisible() { return !this.root.classList.contains('hidden'); }

  show() {
    this.root.classList.remove('hidden');
    this.engine.setMenuCharacter(this.menuChar ? this.menuChar.group : null);
  }

  hide() {
    this.root.classList.add('hidden');
    this.engine.setMenuCharacter(null);
  }

  toast(text, ms = 2200) {
    this.toastEl.textContent = text;
    this.toastEl.classList.add('show');
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => this.toastEl.classList.remove('show'), ms);
  }

  refreshProfileChip() {
    const rank = rankFor(profile.rankPoints);
    const chip = this.root.querySelector('.profile-chip');
    if (!chip) return;
    chip.querySelector('.profile-level').textContent = profile.level;
    chip.querySelector('.profile-name').textContent = settings.name;
    chip.querySelector('.profile-rank').textContent = `${rank.name} • ${profile.rankPoints} RP`;
    chip.querySelector('.profile-rank').style.color = rank.color;
    const pct = Math.min(100, (profile.xp / xpForNext()) * 100);
    chip.querySelector('.profile-xp-fill').style.width = pct + '%';
    const mark = chip.querySelector('.profile-level');
    mark.style.borderColor = rank.color;
  }

  setActiveNav(name) {
    this.root.querySelectorAll('.nav-btn').forEach((n) => n.classList.toggle('active', n.dataset.nav === name));
  }

  // ---------------- menu character ----------------
  setMenuCharacter() {
    const outfit = OUTLETS.find((o) => o.id === settings.locker.outfit) || OUTLETS[0];
    const pick = LOCKER_ITEMS.find((i) => i.id === settings.locker.pickaxe);
    const char = new Character(outfit.palette, { isPlayer: true });
    char.setWeapon('harvester', pick?.color || '#6fe3ff');
    char.group.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    if (this.menuChar) {
      this.menuChar.dispose();
    }
    this.menuChar = char;
    if (this.isVisible) this.engine.setMenuCharacter(char.group);
  }

  // ---------------- home ----------------
  renderHome() {
    this.setActiveNav('home');
    const modesHtml = MODE_GROUPS.map((group) => `
      <section class="mode-group">
        <h3>${group.title}</h3>
        <div class="mode-row">
          ${group.ids.map((id) => this.modeCard(modeById(id))).join('')}
        </div>
      </section>`).join('');
    this.body.innerHTML = `
      <div class="home-grid">
        <section class="home-hero">
          <div class="hero-tag">DROP IN • BUILD • SURVIVE</div>
          <h2>One island.<br><span>One survivor.</span></h2>
          <p>Drop from the Skybus, loot the island, build your cover and outlast everyone else in a fully playable 3D battle royale. Every mode below launches a real match against AI opponents.</p>
          <div class="hero-actions">
            <button class="btn primary" id="quick-play">Quick Play</button>
            <button class="btn ghost" id="hero-locker">Customize</button>
          </div>
          <div class="hero-stats">
            <div><b>${profile.wins}</b><span>Wins</span></div>
            <div><b>${profile.kills}</b><span>Eliminations</span></div>
            <div><b>${profile.matches}</b><span>Matches</span></div>
            <div><b>${profile.level}</b><span>Level</span></div>
          </div>
        </section>
        <aside class="home-side">
          <div class="side-card">
            <h4>Daily Challenges</h4>
            <div class="challenge"><span>Eliminate 10 opponents</span><b>${Math.min(10, profile.kills % 10 || (profile.kills ? 10 : 0))}/10</b></div>
            <div class="challenge"><span>Play 3 matches</span><b>${Math.min(3, profile.matches % 3 || (profile.matches ? 3 : 0))}/3</b></div>
            <div class="challenge"><span>Win a match</span><b>${profile.wins > 0 ? '1/1' : '0/1'}</b></div>
          </div>
          <div class="side-card subtle">
            <h4>Season Progress</h4>
            <div class="xp-line"><span>Level ${profile.level}</span><span>${profile.xp} / ${xpForNext()} XP</span></div>
            <div class="xp-bar"><div style="width:${Math.min(100, (profile.xp / xpForNext()) * 100)}%"></div></div>
            <p class="side-note">Earn XP from eliminations, placement and wins.</p>
          </div>
        </aside>
      </div>
      ${modesHtml}
      <div class="mode-setup" id="mode-setup"></div>
    `;
    this.body.querySelector('#quick-play').addEventListener('click', () => this.selectMode('br'));
    this.body.querySelector('#hero-locker').addEventListener('click', () => this.renderLocker());
    this.body.querySelectorAll('.mode-card').forEach((card) => {
      card.addEventListener('click', () => {
        if (this.audio) this.audio.ui();
        this.selectMode(card.dataset.mode);
      });
    });
    this.renderSetup();
  }

  modeCard(mode) {
    const cap = PLAYER_CAPS[mode.id] || 2;
    const tag = mode.id === 'rumble' ? '20v20' : mode.teamSize > 1 ? `${cap / mode.teamSize} TEAMS` : `${cap} PLAYERS`;
    const active = this.selectedMode === mode.id ? 'selected' : '';
    return `<button class="mode-card ${active}" data-mode="${mode.id}">
      <div class="mode-art art-${mode.id}"></div>
      <div class="mode-info">
        <div class="mode-name">${mode.name}</div>
        <div class="mode-meta">${tag} · ${mode.building ? 'BUILDING' : 'NO BUILD'}</div>
      </div>
      <div class="mode-badge">${mode.short}</div>
    </button>`;
  }

  selectMode(id) {
    this.selectedMode = id;
    const mode = modeById(id);
    this.teamSize = mode.teamSize;
    this.body.querySelectorAll('.mode-card').forEach((c) => c.classList.toggle('selected', c.dataset.mode === id));
    this.renderSetup();
    this.body.querySelector('#mode-setup')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  renderSetup() {
    const mode = modeById(this.selectedMode);
    const wrap = this.body.querySelector('#mode-setup');
    if (!wrap) return;
    const cap = PLAYER_CAPS[mode.id] || 2;
    const teamOptions = mode.lockedTeamSize ? [] : (mode.id === 'br' || mode.id === 'zero' || mode.id === 'ranked' ? [1, 2, 3, 4] : []);
    const total = mode.lockedTeamSize ? cap : mode.id === 'rumble' ? 40 : mode.id === 'zonewars' ? this.teamSize * 2 : cap;
    const teamLabel = (n) => ['Solo', 'Duos', 'Trios', 'Squads'][n - 1] || `${n}v${n}`;
    wrap.innerHTML = `
      <div class="setup-main">
        <div class="setup-head">
          <div>
            <div class="setup-kicker">SELECTED MODE</div>
            <h3>${mode.name}</h3>
          </div>
          <span class="setup-players">${mode.id === 'rumble' ? '20 v 20' : mode.id === 'zonewars' ? `${this.teamSize} v ${this.teamSize}` : `${total} players`}</span>
        </div>
        <p class="setup-desc">${mode.desc}</p>
        <div class="setup-rules">
          <span>${mode.storm ? '⚡ Storm' : '☀ No storm'}</span>
          <span>${mode.building ? '🧱 Building' : '🚫 Zero build'}</span>
          <span>${mode.respawn ? '♻ Respawns' : '💀 One life'}</span>
          <span>${mode.ranked ? '🏆 Ranked' : '🤖 AI opponents'}</span>
        </div>
      </div>
      <div class="setup-actions">
        ${teamOptions.length ? `<div class="fill-row">${teamOptions.map((n) =>
          `<button class="fill-btn ${this.teamSize === n ? 'active' : ''}" data-team="${n}">${teamLabel(n)}</button>`).join('')}</div>` : ''}
        <button class="btn primary deploy-btn" id="deploy">Deploy</button>
        <span class="setup-note">Matches run locally against AI opponents</span>
      </div>`;
    wrap.querySelectorAll('.fill-btn').forEach((b) => b.addEventListener('click', () => {
      this.teamSize = Number(b.dataset.team);
      this.renderSetup();
    }));
    wrap.querySelector('#deploy').addEventListener('click', () => this.deploy());
  }

  deploy() {
    if (this.audio) this.audio.ensure();
    const mode = modeById(this.selectedMode);
    this.showMatchmaking(mode, this.teamSize);
  }

  showMatchmaking(mode, teamSize) {
    const cap = PLAYER_CAPS[mode.id] || 2;
    const players = mode.id === 'br' || mode.id === 'zero' ? 100 : cap;
    this.modalLayer.innerHTML = `
      <div class="modal matchmaking">
        <div class="mm-art art-${mode.id}"></div>
        <div class="mm-body">
          <div class="mm-kicker">FILLING LOBBY</div>
          <h2>${mode.name}</h2>
          <p>${players} participants • ${mode.building ? 'Building enabled' : 'Zero build'} • AI opponents</p>
          <div class="mm-bar"><div class="mm-fill"></div></div>
          <div class="mm-status">Preparing island…</div>
          <button class="btn ghost" id="mm-cancel">Cancel</button>
        </div>
      </div>`;
    this.modalLayer.classList.add('open');
    let progress = 0;
    const fill = this.modalLayer.querySelector('.mm-fill');
    const status = this.modalLayer.querySelector('.mm-status');
    const steps = ['Preparing island…', 'Spawning loot…', 'Deploying opponents…', 'Skybus departing…'];
    clearInterval(this.matchmakingTimer);
    this.matchmakingTimer = setInterval(() => {
      progress = Math.min(100, progress + 14 + Math.random() * 12);
      fill.style.width = progress + '%';
      status.textContent = steps[Math.min(steps.length - 1, Math.floor(progress / 26))];
      if (progress >= 100) {
        clearInterval(this.matchmakingTimer);
        this.modalLayer.classList.remove('open');
        this.modalLayer.innerHTML = '';
        this.hide();
        this.onDeploy(mode.id, teamSize);
      }
    }, 260);
    this.modalLayer.querySelector('#mm-cancel').addEventListener('click', () => {
      clearInterval(this.matchmakingTimer);
      this.modalLayer.classList.remove('open');
      this.modalLayer.innerHTML = '';
    });
  }

  // ---------------- locker ----------------
  renderLocker() {
    this.setActiveNav('locker');
    const groups = [
      { kind: 'outfit', label: 'Outfits' },
      { kind: 'pickaxe', label: 'Harvesting Tools' },
      { kind: 'glider', label: 'Gliders' },
      { kind: 'emote', label: 'Emotes' }
    ];
    this.body.innerHTML = `
      <div class="screen-head"><div><div class="screen-kicker">CUSTOMIZE</div><h2>Locker</h2><p>Original outfits, tools, gliders and emotes.</p></div>
        <button class="btn ghost" id="locker-back">Back to Play</button></div>
      <div class="locker-grid">
        <div class="locker-preview">
          <div class="preview-label">CHARACTER PREVIEW</div>
          <div class="preview-hint">3D preview • updates live</div>
          <div class="preview-info" id="preview-info"></div>
        </div>
        <div class="locker-items">
          ${groups.map((g) => `
            <div class="locker-group">
              <h4>${g.label}</h4>
              <div class="item-row">
                ${LOCKER_ITEMS.filter((i) => i.kind === g.kind).map((item) => `
                  <button class="item-card ${settings.locker[g.kind] === item.id ? 'equipped' : ''}" data-item="${item.id}" data-kind="${g.kind}" style="--rar:${rarityById(item.rarity).color}">
                    <div class="item-swatch ${g.kind}" ${item.palette ? `style="background:linear-gradient(135deg, ${item.palette.shirt}, ${item.palette.pants})"` : `style="background:${item.color || '#7fe6ff'}"`}></div>
                    <div class="item-name">${item.name}</div>
                    <div class="item-rar">${rarityById(item.rarity).name}</div>
                    ${settings.locker[g.kind] === item.id ? '<div class="equipped-tag">EQUIPPED</div>' : ''}
                  </button>`).join('')}
              </div>
            </div>`).join('')}
        </div>
      </div>`;
    this.body.querySelector('#locker-back').addEventListener('click', () => this.renderHome());
    this.body.querySelectorAll('.item-card').forEach((card) => card.addEventListener('click', () => {
      const kind = card.dataset.kind;
      settings.locker[kind] = card.dataset.item;
      saveSettings();
      if (this.audio) this.audio.ui();
      this.setMenuCharacter();
      this.renderLocker();
      const item = LOCKER_ITEMS.find((i) => i.id === card.dataset.item);
      this.root.querySelector('#preview-info').textContent = `${item.name} equipped`;
    }));
    const outfit = LOCKER_ITEMS.find((i) => i.id === settings.locker.outfit);
    this.body.querySelector('#preview-info').textContent = `${outfit?.name || 'Outfit'} equipped`;
  }

  // ---------------- stats ----------------
  renderStats() {
    this.setActiveNav('stats');
    const kd = profile.matches ? (profile.kills / Math.max(1, profile.matches)).toFixed(2) : '0.00';
    const winRate = profile.matches ? Math.round((profile.wins / profile.matches) * 100) : 0;
    const rank = rankFor(profile.rankPoints);
    const nextRank = RANK_TIERS.find((r) => r.min > profile.rankPoints);
    this.body.innerHTML = `
      <div class="screen-head"><div><div class="screen-kicker">PROGRESSION</div><h2>Career</h2><p>Your lifetime performance across every mode.</p></div>
        <button class="btn ghost" id="stats-back">Back to Play</button></div>
      <div class="career-grid">
        <div class="career-card rank-card">
          <div class="rank-emblem" style="--rc:${rank.color}">${rank.name[0]}</div>
          <div><div class="rank-name" style="color:${rank.color}">${rank.name}</div>
          <div class="rank-points">${profile.rankPoints} Rank Points</div>
          <div class="rank-next">${nextRank ? `${nextRank.min - profile.rankPoints} RP to ${nextRank.name}` : 'Top rank reached'}</div></div>
        </div>
        <div class="career-stats">
          <div class="stat"><b>${profile.matches}</b><span>Matches</span></div>
          <div class="stat"><b>${profile.wins}</b><span>Victories</span></div>
          <div class="stat"><b>${profile.kills}</b><span>Eliminations</span></div>
          <div class="stat"><b>${kd}</b><span>Elim / Match</span></div>
          <div class="stat"><b>${Math.round(profile.damage)}</b><span>Damage</span></div>
          <div class="stat"><b>${winRate}%</b><span>Win rate</span></div>
          <div class="stat"><b>${profile.bestPlacement || '-'}</b><span>Best placement</span></div>
          <div class="stat"><b>${profile.level}</b><span>Level</span></div>
        </div>
        <div class="career-card">
          <h4>Level Progress</h4>
          <div class="xp-line"><span>Level ${profile.level}</span><span>${profile.xp} / ${xpForNext()} XP</span></div>
          <div class="xp-bar big"><div style="width:${Math.min(100, (profile.xp / xpForNext()) * 100)}%"></div></div>
          <h4 style="margin-top:18px">Mode Victories</h4>
          <div class="mode-wins">${MODES.map((m) => `<div><span>${m.name}</span><b>${profile.modeWins[m.id] || 0}</b></div>`).join('')}</div>
        </div>
        <div class="career-card">
          <h4>Challenges</h4>
          ${this.challengeRow('First Drop', 'Play your first match', profile.matches >= 1)}
          ${this.challengeRow('Sharpshooter', 'Reach 25 eliminations', profile.kills >= 25)}
          ${this.challengeRow('Sky Champion', 'Win a match', profile.wins >= 1)}
          ${this.challengeRow('Builder', 'Place 100 structures', (profile.structures || 0) >= 100)}
          ${this.challengeRow('Globetrotter', 'Play all mode families', Object.keys(profile.modeWins || {}).length >= 6)}
        </div>
      </div>`;
    this.body.querySelector('#stats-back').addEventListener('click', () => this.renderHome());
  }

  challengeRow(name, desc, done) {
    return `<div class="challenge-row ${done ? 'done' : ''}"><span class="challenge-check">${done ? '✓' : '○'}</span>
      <div><b>${name}</b><span>${desc}</span></div></div>`;
  }

  // ---------------- settings ----------------
  renderSettings(tab = 'game') {
    this.setActiveNav('settings');
    const tabs = [
      ['game', 'Game'], ['graphics', 'Graphics'], ['controls', 'Controls'], ['touch', 'Touch'], ['audio', 'Audio']
    ];
    this.body.innerHTML = `
      <div class="screen-head"><div><div class="screen-kicker">OPTIONS</div><h2>Settings</h2><p>Everything is saved automatically on this device.</p></div>
        <button class="btn ghost" id="settings-back">Back to Play</button></div>
      <div class="settings-tabs">${tabs.map(([id, label]) => `<button class="tab ${tab === id ? 'active' : ''}" data-tab="${id}">${label}</button>`).join('')}</div>
      <div class="settings-body" id="settings-body"></div>`;
    this.body.querySelector('#settings-back').addEventListener('click', () => this.renderHome());
    this.body.querySelectorAll('.tab').forEach((t) => t.addEventListener('click', () => this.renderSettings(t.dataset.tab)));
    const body = this.body.querySelector('#settings-body');
    if (tab === 'game') this.settingsGame(body);
    else if (tab === 'graphics') this.settingsGraphics(body);
    else if (tab === 'controls') this.settingsControls(body);
    else if (tab === 'touch') this.settingsTouch(body);
    else this.settingsAudio(body);
  }

  range(body, label, value, min, max, step, fmt, onChange) {
    const row = document.createElement('label');
    row.className = 'setting-row';
    row.innerHTML = `<span>${label}</span><input type="range" min="${min}" max="${max}" step="${step}" value="${value}"><b>${fmt(value)}</b>`;
    const input = row.querySelector('input');
    const out = row.querySelector('b');
    input.addEventListener('input', () => {
      const v = Number(input.value);
      out.textContent = fmt(v);
      onChange(v);
    });
    body.appendChild(row);
    return row;
  }

  toggle(body, label, value, onChange, hint) {
    const row = document.createElement('label');
    row.className = 'setting-row';
    row.innerHTML = `<span>${label}${hint ? `<em>${hint}</em>` : ''}</span><button class="switch ${value ? 'on' : ''}" role="switch" aria-checked="${value}"><i></i></button>`;
    const btn = row.querySelector('.switch');
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const next = !btn.classList.contains('on');
      btn.classList.toggle('on', next);
      btn.setAttribute('aria-checked', String(next));
      onChange(next);
    });
    body.appendChild(row);
    return row;
  }

  selectRow(body, label, options, value, onChange) {
    const row = document.createElement('div');
    row.className = 'setting-row';
    row.innerHTML = `<span>${label}</span><div class="seg">${options.map(([v, l]) => `<button class="seg-btn ${v === value ? 'active' : ''}" data-v="${v}">${l}</button>`).join('')}</div>`;
    row.querySelectorAll('.seg-btn').forEach((b) => b.addEventListener('click', () => {
      row.querySelectorAll('.seg-btn').forEach((x) => x.classList.toggle('active', x === b));
      onChange(b.dataset.v);
    }));
    body.appendChild(row);
    return row;
  }

  settingsGame(body) {
    body.innerHTML = '';
    const nameRow = document.createElement('label');
    nameRow.className = 'setting-row';
    nameRow.innerHTML = `<span>Display name</span><input class="text-input" maxlength="18" value="${settings.name.replace(/"/g, '&quot;')}">`;
    nameRow.querySelector('input').addEventListener('change', (e) => {
      settings.name = e.target.value.trim() || 'RiftRunner';
      saveSettings();
      profile.name = settings.name;
      saveProfile();
      this.refreshProfileChip();
    });
    body.appendChild(nameRow);
    this.range(body, 'Field of view', settings.fov, 60, 110, 1, (v) => `${v}°`, (v) => { settings.fov = v; saveSettings(); });
    this.range(body, 'HUD scale', settings.hudScale, 0.75, 1.4, 0.05, (v) => `${Math.round(v * 100)}%`, (v) => {
      settings.hudScale = v;
      document.documentElement.style.setProperty('--hud-scale', v);
      saveSettings();
    });
    this.selectRow(body, 'Crosshair', [['classic', 'Cross'], ['dot', 'Dot'], ['circle', 'Circle']], settings.crosshair, (v) => {
      settings.crosshair = v;
      document.documentElement.dataset.crosshair = v;
      saveSettings();
    });
    this.toggle(body, 'Show FPS', settings.showFps, (v) => { settings.showFps = v; saveSettings(); });
    this.toggle(body, 'Toggle sprint', settings.toggleSprint, (v) => { settings.toggleSprint = v; saveSettings(); });
    this.toggle(body, 'Toggle crouch', settings.toggleCrouch, (v) => { settings.toggleCrouch = v; saveSettings(); });
    this.toggle(body, 'Vibration (mobile)', settings.vibration, (v) => { settings.vibration = v; saveSettings(); });
    this.selectRow(body, 'Weather', [['auto', 'Random'], ['clear', 'Clear'], ['rain', 'Rain'], ['fog', 'Fog'], ['snow', 'Snow']], settings.weather, (v) => {
      settings.weather = v;
      saveSettings();
    });
    const reset = document.createElement('button');
    reset.className = 'btn danger';
    reset.textContent = 'Reset all settings';
    reset.addEventListener('click', () => {
      resetSettings();
      document.documentElement.style.setProperty('--hud-scale', settings.hudScale);
      this.refreshProfileChip();
      this.renderSettings('game');
    });
    body.appendChild(reset);
  }

  settingsGraphics(body) {
    body.innerHTML = '';
    this.selectRow(body, 'Graphics quality', [['low', 'Low'], ['medium', 'Medium'], ['high', 'High']], settings.graphics, (v) => {
      settings.graphics = v;
      saveSettings();
      this.engine.setQuality(v);
      this.onSettingsChange?.();
      this.toast(`Graphics set to ${v}`);
    });
    const note = document.createElement('div');
    note.className = 'settings-note';
    note.innerHTML = `<b>Quality presets</b><p>Low disables shadows and caps resolution for older phones. Medium keeps soft shadows. High enables full shadows, higher pixel ratio and denser effects. The game auto-detects a starting preset on mobile.</p>`;
    body.appendChild(note);
    this.toggle(body, 'Shadows', settings.graphics !== 'low', (v) => {
      this.engine.renderer.shadowMap.enabled = v;
    }, 'Also follows quality preset');
    const info = document.createElement('div');
    info.className = 'settings-note';
    const gl = this.engine.renderer.getContext();
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    info.innerHTML = `<b>Renderer</b><p>${dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : 'WebGL'} • ${this.engine.renderer.info.render.triangles.toLocaleString()} triangles in last frame</p>`;
    body.appendChild(info);
  }

  settingsControls(body) {
    body.innerHTML = '';
    const sens = settings.sensitivity;
    this.range(body, 'Mouse sensitivity', sens.mouse, 0.0005, 0.006, 0.0001, (v) => (v * 1000).toFixed(1), (v) => { sens.mouse = v; saveSettings(); });
    this.range(body, 'Touch sensitivity', sens.touch, 0.002, 0.014, 0.0005, (v) => (v * 1000).toFixed(1), (v) => { sens.touch = v; saveSettings(); });
    this.range(body, 'Controller sensitivity', sens.gamepad, 0.8, 6, 0.1, (v) => v.toFixed(1), (v) => { sens.gamepad = v; saveSettings(); });
    this.range(body, 'Scoped sensitivity', sens.scoped, 0.2, 1.4, 0.05, (v) => `${Math.round(v * 100)}%`, (v) => { sens.scoped = v; saveSettings(); });
    this.range(body, 'Build sensitivity', sens.build, 0.3, 2, 0.05, (v) => `${Math.round(v * 100)}%`, (v) => { sens.build = v; saveSettings(); });
    this.range(body, 'Stick dead zone', settings.deadzone, 0.05, 0.4, 0.01, (v) => v.toFixed(2), (v) => { settings.deadzone = v; saveSettings(); });
    this.toggle(body, 'Invert look Y', settings.invertY, (v) => { settings.invertY = v; saveSettings(); });
    const kb = document.createElement('div');
    kb.className = 'keybind-list';
    kb.innerHTML = `<h4>Keybinds <span>(click a key to rebind)</span></h4>`;
    const actions = [
      ['forward', 'Move forward'], ['back', 'Move back'], ['left', 'Move left'], ['right', 'Move right'],
      ['jump', 'Jump / Glide'], ['sprint', 'Sprint'], ['crouch', 'Crouch / Slide'], ['fire', 'Fire'],
      ['aim', 'Aim / Scope'], ['reload', 'Reload'], ['interact', 'Interact'], ['build', 'Build mode'],
      ['edit', 'Edit structure'], ['resetEdit', 'Reset edit'], ['inventory', 'Inventory'], ['map', 'Map'],
      ['emote', 'Emote'], ['slot1', 'Slot 1'], ['slot2', 'Slot 2'], ['slot3', 'Slot 3'], ['slot4', 'Slot 4'], ['slot5', 'Slot 5']
    ];
    for (const [action, label] of actions) {
      const row = document.createElement('div');
      row.className = 'keybind-row';
      row.innerHTML = `<span>${label}</span><button class="key-btn" data-action="${action}">${prettyKey(settings.keybinds[action])}</button>`;
      const btn = row.querySelector('button');
      btn.addEventListener('click', () => {
        btn.textContent = 'Press a key…';
        btn.classList.add('listening');
        const handler = (e) => {
          e.preventDefault();
          if (e.code === 'Escape') { btn.textContent = prettyKey(settings.keybinds[action]); btn.classList.remove('listening'); return; }
          let code = e.code;
          if (e.button !== undefined && e.target === btn && e.type === 'mousedown') code = 'Mouse' + e.button;
          settings.keybinds[action] = code;
          saveSettings();
          btn.textContent = prettyKey(code);
          btn.classList.remove('listening');
          window.removeEventListener('keydown', handler, true);
          window.removeEventListener('mousedown', handler, true);
        };
        window.addEventListener('keydown', handler, true);
        window.addEventListener('mousedown', handler, true);
      });
      kb.appendChild(row);
    }
    body.appendChild(kb);
  }

  settingsTouch(body) {
    body.innerHTML = '';
    this.selectRow(body, 'Touch controls', [['auto', 'Auto'], ['on', 'Always on'], ['off', 'Off']], settings.touchMode, (v) => {
      settings.touchMode = v;
      saveSettings();
      this.onSettingsChange?.();
    });
    this.range(body, 'Button size', settings.touch.scale, 0.7, 1.5, 0.05, (v) => `${Math.round(v * 100)}%`, (v) => {
      settings.touch.scale = v;
      saveSettings();
      this.onSettingsChange?.();
    });
    const row = document.createElement('div');
    row.className = 'setting-row';
    row.innerHTML = `<span>Layout</span><div class="row-actions"><button class="btn small" id="edit-layout">Customize HUD</button><button class="btn small ghost" id="reset-layout">Reset</button></div>`;
    body.appendChild(row);
    row.querySelector('#edit-layout').addEventListener('click', () => {
      this.hide();
      this.onCustomizeLayout?.();
    });
    row.querySelector('#reset-layout').addEventListener('click', () => {
      settings.touch = JSON.parse(JSON.stringify(DEFAULT_TOUCH));
      saveSettings();
      this.onSettingsChange?.();
      this.toast('Touch layout reset');
    });
    const note = document.createElement('div');
    note.className = 'settings-note';
    note.innerHTML = `<b>Controller & mouse support</b><p>Xbox, PlayStation and generic Bluetooth controllers work on Android and desktop (standard gamepad mapping). Connect the controller before starting a match. Left stick moves, right stick aims, RT fires, LT aims, A jumps, X reloads, B crouches, Y toggles building, LB/RB switch pieces, Menu opens inventory.</p>`;
    body.appendChild(note);
  }

  settingsAudio(body) {
    body.innerHTML = '';
    this.range(body, 'Master volume', settings.audio.master, 0, 1, 0.05, (v) => `${Math.round(v * 100)}%`, (v) => { settings.audio.master = v; saveSettings(); this.audio.updateVolumes(); });
    this.range(body, 'Effects volume', settings.audio.sfx, 0, 1, 0.05, (v) => `${Math.round(v * 100)}%`, (v) => { settings.audio.sfx = v; saveSettings(); this.audio.updateVolumes(); });
    this.range(body, 'Ambient music', settings.audio.music, 0, 1, 0.05, (v) => `${Math.round(v * 100)}%`, (v) => { settings.audio.music = v; saveSettings(); });
    const note = document.createElement('div');
    note.className = 'settings-note';
    note.innerHTML = `<b>Audio</b><p>All sound is synthesized in real time with the Web Audio API. Turn the master volume down if effects feel too loud on phone speakers.</p>`;
    body.appendChild(note);
  }

  // ---------------- info ----------------
  renderInfo() {
    this.setActiveNav('info');
    this.body.innerHTML = `
      <div class="screen-head"><div><div class="screen-kicker">GUIDE</div><h2>How to Play</h2><p>Controls, building and surviving the storm.</p></div>
        <button class="btn ghost" id="info-back">Back to Play</button></div>
      <div class="info-grid">
        <div class="info-card">
          <h3>Desktop</h3>
          <ul>
            <li><b>WASD</b> move • <b>Shift</b> sprint • <b>Space</b> jump / glide</li>
            <li><b>Mouse</b> aim • <b>Left click</b> fire / place build</li>
            <li><b>Right click</b> aim down sights</li>
            <li><b>R</b> reload • <b>E</b> interact • <b>Tab</b> inventory</li>
            <li><b>Q</b> build mode • <b>1-4</b> wall / floor / ramp / roof</li>
            <li><b>G</b> edit piece • <b>H</b> reset edit</li>
            <li><b>1-6</b> hotbar slots • wheel cycles slots</li>
            <li><b>Esc</b> pause</li>
          </ul>
        </div>
        <div class="info-card">
          <h3>Mobile</h3>
          <ul>
            <li>Left thumb: movement joystick</li>
            <li>Right side drag: look and aim</li>
            <li>FIRE / AIM / JUMP / BUILD buttons</li>
            <li>Bag opens the inventory</li>
            <li>Customize every button in Settings → Touch → Customize HUD</li>
            <li>Controllers: connect before launching a match</li>
          </ul>
        </div>
        <div class="info-card">
          <h3>Survival</h3>
          <ul>
            <li>Glide by holding jump while falling.</li>
            <li>Harvest trees and rocks with your tool for materials.</li>
            <li>Build walls, floors, ramps and roofs. Edit them into doors and windows.</li>
            <li>Shield up before fights - shields absorb damage first.</li>
            <li>Stay inside the storm circle. It closes in phases.</li>
            <li>Supply drops carry legendary loot.</li>
          </ul>
        </div>
        <div class="info-card">
          <h3>About</h3>
          <ul>
            <li>Skyfall Arena is an original game inspired by the battle royale genre.</li>
            <li>All art, names and sounds are original and procedurally created.</li>
            <li>Not affiliated with or endorsed by any other game or brand.</li>
            <li>Matches are played offline against AI opponents - no account or internet connection required.</li>
          </ul>
        </div>
      </div>`;
    this.body.querySelector('#info-back').addEventListener('click', () => this.renderHome());
  }

  // ---------------- end screen / pause ----------------
  showEnd(result) {
    const won = result.victory;
    this.root.classList.remove('hidden');
    this.modalLayer.innerHTML = `
      <div class="modal end-modal ${won ? 'won' : 'lost'}">
        <div class="end-banner">${won ? 'VICTORY ROYALE' : result.title || 'MATCH OVER'}</div>
        <h2>${won ? '#1' : '#' + (result.placement || '-')}</h2>
        <div class="end-sub">${won ? 'You outlasted the island' : result.subtitle || 'Better luck next drop'}</div>
        <div class="end-stats">
          <div><b>${result.kills}</b><span>Eliminations</span></div>
          <div><b>${Math.round(result.damage)}</b><span>Damage</span></div>
          <div><b>${result.placement || '-'}</b><span>Placement</span></div>
          <div><b>+${result.xp}</b><span>XP</span></div>
          ${result.rankDelta ? `<div><b>${result.rankDelta > 0 ? '+' : ''}${result.rankDelta}</b><span>Rank Points</span></div>` : ''}
        </div>
        <div class="end-actions">
          <button class="btn primary" id="end-rematch">Play Again</button>
          <button class="btn ghost" id="end-lobby">Return to Lobby</button>
        </div>
      </div>`;
    this.modalLayer.classList.add('open');
    this.modalLayer.querySelector('#end-rematch').addEventListener('click', () => {
      this.modalLayer.classList.remove('open');
      this.modalLayer.innerHTML = '';
      this.onRematch?.();
    });
    this.modalLayer.querySelector('#end-lobby').addEventListener('click', () => {
      this.modalLayer.classList.remove('open');
      this.modalLayer.innerHTML = '';
      this.onExitMatch?.();
    });
  }

  hideModal() {
    this.modalLayer.classList.remove('open');
    this.modalLayer.innerHTML = '';
  }

  showPause() {
    this.modalLayer.innerHTML = `
      <div class="modal pause-modal">
        <div class="pause-kicker">MATCH PAUSED</div>
        <h2>Take a breath</h2>
        <div class="pause-actions">
          <button class="btn primary" id="resume">Resume</button>
          <button class="btn ghost" id="pause-settings">Settings</button>
          <button class="btn ghost" id="pause-info">Controls</button>
          <button class="btn danger" id="leave">Leave Match</button>
        </div>
      </div>`;
    this.modalLayer.classList.add('open');
    this.modalLayer.querySelector('#resume').addEventListener('click', () => this.onResume?.());
    this.modalLayer.querySelector('#leave').addEventListener('click', () => this.onExitMatch?.());
    this.modalLayer.querySelector('#pause-settings').addEventListener('click', () => {
      this.hideModal();
      this.renderSettings('controls');
    });
    this.modalLayer.querySelector('#pause-info').addEventListener('click', () => {
      this.hideModal();
      this.renderInfo();
    });
  }
}
