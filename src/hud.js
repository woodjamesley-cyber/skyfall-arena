import { WEAPONS, MATERIALS, AMMO, CONSUMABLES, rarityById, RARITIES } from './data.js';
import { settings, saveSettings } from './settings.js';

const GLYPHS = {
  rifle: '▰', smg: '▱', shotgun: '≣', sniper: '⌖', pistol: '⌐', lmg: '▤', rocket: '◉', bow: '⊃', axe: '⛏', grenade: '●',
  bandage: '✚', medkit: '✚', shield: '⛨', fish: '≈'
};
const SLOT_KEYS = ['1', '2', '3', '4', '5', '6'];

export class HUD {
  constructor({ input, audio, onInventoryToggle }) {
    this.input = input;
    this.audio = audio;
    this.root = document.getElementById('hud');
    this.onInventoryToggle = onInventoryToggle;
    this.damageNumbers = [];
    this.buildMode = false;
    this.lastInventorySig = '';
    this.lastMinimap = 0;
    this.touchElements = [];
    this.editingLayout = false;
    this.build();
  }

  el(tag, cls, html) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html !== undefined) e.innerHTML = html;
    return e;
  }

  build() {
    const r = this.root;
    r.innerHTML = '';

    this.vignette = this.el('div', 'damage-vignette');
    this.stormVignette = this.el('div', 'storm-vignette');
    r.appendChild(this.vignette);
    r.appendChild(this.stormVignette);

    // top bar
    const top = this.el('div', 'hud-top');
    const storm = this.el('div', 'storm-panel');
    storm.innerHTML = `<span class="storm-icon">◒</span><span class="storm-time">--</span><span class="storm-label">Storm</span>`;
    this.stormTime = storm.querySelector('.storm-time');
    this.stormLabel = storm.querySelector('.storm-label');
    const alive = this.el('div', 'alive-panel');
    alive.innerHTML = `<span class="alive-num">100</span><span class="alive-icon">☗</span><span class="alive-label">Alive</span>`;
    this.aliveNum = alive.querySelector('.alive-num');
    this.aliveLabel = alive.querySelector('.alive-label');
    this.scorePanel = this.el('div', 'score-panel');
    this.scorePanel.style.display = 'none';
    const fps = this.el('div', 'fps-panel');
    this.fpsEl = fps;
    top.append(storm, alive, this.scorePanel, fps);
    r.appendChild(top);

    // compass
    this.compass = this.el('canvas', 'compass');
    this.compass.width = 520;
    this.compass.height = 34;
    r.appendChild(this.compass);

    // minimap
    const mapWrap = this.el('div', 'minimap-wrap');
    this.minimap = this.el('canvas', 'minimap');
    this.minimap.width = this.minimap.height = 320;
    this.mapCoords = this.el('div', 'map-coords');
    mapWrap.append(this.minimap, this.mapCoords);
    r.appendChild(mapWrap);

    // kill feed
    this.killfeed = this.el('div', 'killfeed');
    r.appendChild(this.killfeed);

    // crosshair
    this.crosshair = this.el('div', 'crosshair');
    this.crosshair.innerHTML = '<span class="ch-t"></span><span class="ch-b"></span><span class="ch-l"></span><span class="ch-r"></span><span class="ch-dot"></span>';
    r.appendChild(this.crosshair);
    this.hitmarkerEl = this.el('div', 'hitmarker');
    this.hitmarkerEl.innerHTML = '<span></span><span></span><span></span><span></span>';
    r.appendChild(this.hitmarkerEl);
    this.scope = this.el('div', 'scope-overlay');
    r.appendChild(this.scope);

    // interaction + toast
    this.interactEl = this.el('div', 'interact-prompt');
    r.appendChild(this.interactEl);
    this.toastWrap = this.el('div', 'toast-wrap');
    r.appendChild(this.toastWrap);
    this.dmgNumberWrap = this.el('div', 'dmg-numbers');
    r.appendChild(this.dmgNumberWrap);

    // build hud
    this.buildHud = this.el('div', 'build-hud');
    this.buildHud.innerHTML = `
      <div class="build-title">BUILD MODE <span class="build-key">Q</span></div>
      <div class="build-pieces"></div>
      <div class="build-materials"></div>
      <div class="build-hint">Fire to place • G edit • H reset • wheel material</div>`;
    this.buildPieceWrap = this.buildHud.querySelector('.build-pieces');
    this.buildMatWrap = this.buildHud.querySelector('.build-materials');
    r.appendChild(this.buildHud);

    // bottom left vitals
    const vitals = this.el('div', 'vitals');
    vitals.innerHTML = `
      <div class="vitals-name"></div>
      <div class="bar health"><div class="bar-fill"></div><span class="bar-text"></span></div>
      <div class="bar shield"><div class="bar-fill"></div><span class="bar-text"></span></div>`;
    this.vitalsName = vitals.querySelector('.vitals-name');
    this.healthFill = vitals.querySelector('.health .bar-fill');
    this.healthText = vitals.querySelector('.health .bar-text');
    this.shieldFill = vitals.querySelector('.shield .bar-fill');
    this.shieldText = vitals.querySelector('.shield .bar-text');
    r.appendChild(vitals);

    // materials
    const mats = this.el('div', 'mats-panel');
    mats.innerHTML = Object.values(MATERIALS).map((m) =>
      `<div class="mat" data-mat="${m.id}"><span class="mat-dot" style="background:${m.color}"></span><span class="mat-count">0</span></div>`
    ).join('');
    this.matCounts = {};
    mats.querySelectorAll('.mat').forEach((el) => { this.matCounts[el.dataset.mat] = el.querySelector('.mat-count'); });
    this.matsPanel = mats;
    r.appendChild(mats);

    // hotbar
    this.hotbar = this.el('div', 'hotbar');
    r.appendChild(this.hotbar);

    // ammo + weapon info
    this.ammoPanel = this.el('div', 'ammo-panel');
    this.ammoPanel.innerHTML = `<div class="weapon-name"></div><div class="ammo-count"><span class="mag">0</span><span class="reserve">/ 0</span></div><div class="reload-hint">RELOAD</div>`;
    this.weaponNameEl = this.ammoPanel.querySelector('.weapon-name');
    this.magEl = this.ammoPanel.querySelector('.mag');
    this.reserveEl = this.ammoPanel.querySelector('.reserve');
    this.reloadHint = this.ammoPanel.querySelector('.reload-hint');
    r.appendChild(this.ammoPanel);

    // spectate
    this.spectateEl = this.el('div', 'spectate-banner');
    r.appendChild(this.spectateEl);

    // bus overlay
    this.busEl = this.el('div', 'bus-overlay');
    this.busEl.innerHTML = `<div class="bus-title">BATTLE BUS</div><div class="bus-sub">Press <b>SPACE</b> / tap <b>JUMP</b> to deploy</div><div class="bus-alt"></div>`;
    this.busAlt = this.busEl.querySelector('.bus-alt');
    r.appendChild(this.busEl);

    // mobile controls
    this.touchRoot = this.el('div', 'touch-controls');
    this.joystickBase = this.el('div', 'joystick-base');
    this.joystickKnob = this.el('div', 'joystick-knob');
    this.joystickBase.appendChild(this.joystickKnob);
    this.touchRoot.appendChild(this.joystickBase);
    r.appendChild(this.touchRoot);

    // pause button
    this.pauseBtn = this.el('button', 'icon-btn pause-btn', '❚❚');
    r.appendChild(this.pauseBtn);

    this.buildTouchButtons();
    this.buildInventory();
    this.wireJoystick();
  }

  glyphFor(item) {
    if (!item) return '';
    if (item.kind === 'weapon') {
      const def = WEAPONS[item.weaponId];
      return GLYPHS[def?.icon] || '▰';
    }
    if (item.kind === 'consumable') return GLYPHS[CONSUMABLES[item.itemId]?.icon] || '✚';
    return '?';
  }

  buildTouchButtons() {
    const actions = {
      fire: 'FIRE', aim: 'AIM', jump: 'JUMP', crouch: 'CROUCH', sprint: 'RUN', reload: 'RLD',
      build: 'BUILD', edit: 'EDIT', interact: 'USE', inventory: 'BAG', emote: 'EMOTE'
    };
    for (const [action, label] of Object.entries(actions)) {
      const b = this.el('button', `touch-btn tb-${action}`, `<span>${label}</span>`);
      b.dataset.action = action;
      this.touchRoot.appendChild(b);
      this.touchElements.push(b);
      this.input.bindTouchButton(b, action);
    }
    this.applyTouchLayout();
  }

  applyTouchLayout() {
    const layout = settings.touch.layout;
    for (const b of this.touchElements) {
      const l = layout[b.dataset.action];
      if (!l) { b.style.display = 'none'; continue; }
      b.style.display = 'flex';
      b.style.left = l.x + '%';
      b.style.top = l.y + '%';
      b.style.width = `calc(var(--touch-size) * ${l.size * settings.touch.scale})`;
      b.style.height = `calc(var(--touch-size) * ${l.size * settings.touch.scale})`;
    }
    const js = this.joystickBase;
    js.style.width = `calc(var(--touch-size) * 1.9 * ${settings.touch.scale})`;
    js.style.height = `calc(var(--touch-size) * 1.9 * ${settings.touch.scale})`;
  }

  wireJoystick() {
    this.input.onJoystick = (active, x, y, dx, dy) => {
      requestAnimationFrame(() => {
        if (!this.joystickBase) return;
        if (!active) {
          this.joystickBase.classList.remove('active');
          this.joystickKnob.style.transform = 'translate(-50%, -50%)';
          this.joystickBase.style.left = '';
          this.joystickBase.style.top = '';
          return;
        }
        this.joystickBase.classList.add('active');
        this.joystickBase.style.left = x + 'px';
        this.joystickBase.style.top = y + 'px';
        const max = 42 * settings.touch.scale;
        this.joystickKnob.style.transform = `translate(calc(-50% + ${dx * max}px), calc(-50% + ${dy * max}px))`;
      });
    };
  }

  buildInventory() {
    this.inventory = this.el('div', 'inventory-panel');
    this.inventory.innerHTML = `
      <div class="inv-header">INVENTORY <button class="inv-close">✕</button></div>
      <div class="inv-grid"></div>
      <div class="inv-footer"><div class="inv-ammo"></div><div class="inv-mats"></div></div>`;
    this.invGrid = this.inventory.querySelector('.inv-grid');
    this.invAmmo = this.inventory.querySelector('.inv-ammo');
    this.invMats = this.inventory.querySelector('.inv-mats');
    this.inventory.querySelector('.inv-close').addEventListener('click', () => this.toggleInventory(false));
    this.root.appendChild(this.inventory);
  }

  toggleInventory(show) {
    const open = show ?? !this.inventory.classList.contains('open');
    this.inventory.classList.toggle('open', open);
    if (open && this.lastPlayer) this.refreshInventory(this.lastPlayer);
    this.onInventoryToggle?.(open);
  }

  refreshInventory(player) {
    if (!this.invGrid) return;
    const itemName = (item) => {
      if (!item) return 'Empty';
      if (item.kind === 'weapon') return WEAPONS[item.weaponId]?.name || 'Weapon';
      if (item.kind === 'consumable') return `${CONSUMABLES[item.itemId]?.name || 'Item'} x${item.count}`;
      return 'Item';
    };
    this.invGrid.innerHTML = player.slots.map((item, i) => {
      const sub = item?.kind === 'weapon' ? `${rarityById(item.rarity || 'common').name} • ${item.mag ?? 0} in mag` : '—';
      return `<div class="inv-item"><span class="inv-glyph">${this.glyphFor(item)}</span><b>${i + 1}. ${itemName(item)}</b><small>${sub}</small>${item ? `<button class="inv-drop" data-drop="${i}">DROP</button>` : ''}</div>`;
    }).join('');
    this.invGrid.querySelectorAll('[data-drop]').forEach((b) => {
      b.onclick = () => this.onDropSlot?.(Number(b.dataset.drop));
    });
    this.invAmmo.textContent = Object.entries(player.ammo).filter(([, v]) => v > 0).map(([k, v]) => `${AMMO[k].name} ${v}`).join(' · ');
    this.invMats.textContent = `Wood ${Math.floor(player.mats.wood)} · Brick ${Math.floor(player.mats.brick)} · Metal ${Math.floor(player.mats.metal)}`;
  }

  show(match) {
    this.root.classList.remove('hidden');
    this.root.classList.add('visible');
    this.match = match;
    this.busEl.classList.toggle('visible', !!match?.bus);
    this.scorePanel.style.display = match?.mode?.winCondition === 'score' || match?.mode?.id === 'rumble' ? 'flex' : 'none';
    this.setBuildMode(false);
    this.hotbar.innerHTML = '';
    this.lastInventorySig = '';
    this.updateTouchVisibility();
  }

  hide() {
    this.root.classList.add('hidden');
    this.root.classList.remove('visible');
    this.inventory.classList.remove('open');
    this.busEl.classList.remove('visible');
    this.spectateEl.classList.remove('visible');
    this.touchRoot.classList.remove('editing');
    this.editingLayout = false;
  }

  updateTouchVisibility() {
    const touch = this.input.usingTouch || settings.touchMode === 'on';
    this.touchRoot.classList.toggle('enabled', touch);
  }

  setBus(show, info) {
    this.busEl.classList.toggle('visible', show);
    if (show && info) this.busAlt.textContent = `ALTITUDE ${Math.round(info.altitude)}m • ${info.timeLeft.toFixed(0)}s`;
  }

  setPaused(paused) {
    this.root.classList.toggle('paused', paused);
  }

  toast(text, ms = 1900) {
    const t = this.el('div', 'toast', text);
    this.toastWrap.appendChild(t);
    setTimeout(() => t.classList.add('out'), ms);
    setTimeout(() => t.remove(), ms + 400);
    while (this.toastWrap.children.length > 4) this.toastWrap.firstChild.remove();
  }

  addKillFeed(killer, victim, weaponName, opts = {}) {
    const row = this.el('div', 'kf-row');
    if (opts.abstract) row.classList.add('dim');
    row.innerHTML = `<span class="kf-killer">${killer || 'Storm'}</span>
      <span class="kf-weapon">${opts.headshot ? '⌖' : '➶'} ${weaponName || ''}</span>
      <span class="kf-victim">${victim}</span>`;
    this.killfeed.prepend(row);
    while (this.killfeed.children.length > 5) this.killfeed.lastChild.remove();
    setTimeout(() => row.classList.add('out'), 7000);
    setTimeout(() => row.remove(), 7600);
  }

  hitmarker(headshot, damage) {
    const h = this.hitmarkerEl;
    h.classList.remove('show', 'headshot');
    void h.offsetWidth;
    h.classList.add('show');
    if (headshot) h.classList.add('headshot');
    if (damage) this.spawnDamageNumber(damage, null, headshot ? 'head' : 'normal');
  }

  spawnDamageNumber(text, worldPos, kind) {
    const el = this.el('div', `dmg-number ${kind}`, String(text));
    this.dmgNumberWrap.appendChild(el);
    const entry = { el, life: 0.85, world: worldPos ? worldPos.clone() : null };
    el.style.opacity = 1;
    if (!worldPos) {
      el.style.left = '50%';
      el.style.top = '38%';
      el.classList.add('center');
    }
    this.damageNumbers.push(entry);
    if (this.damageNumbers.length > 24) {
      const old = this.damageNumbers.shift();
      old.el.remove();
    }
  }

  damageTaken(amount, source, headshot) {
    this.vignette.classList.remove('flash');
    void this.vignette.offsetWidth;
    this.vignette.classList.add('flash');
    if (this.audio) this.audio.hurt();
  }

  addMats(mats, pos) {
    const text = Object.entries(mats).map(([k, v]) => `+${v} ${MATERIALS[k].name}`).join('  ');
    if (text) this.toast(text, 1200);
  }

  setInteract(text) {
    if (text) {
      this.interactEl.innerHTML = `<b>E</b> ${text}`;
      this.interactEl.classList.add('visible');
    } else this.interactEl.classList.remove('visible');
  }

  spectate(name) {
    this.spectateEl.classList.toggle('visible', !!name);
    if (name) this.spectateEl.innerHTML = `<span>SPECTATING</span> <b>${name}</b>`;
  }

  setBuildMode(on, build) {
    this.buildMode = on;
    this.root.classList.toggle('build-mode', on);
    if (on && build) this.updateBuildHud(build);
  }

  updateBuildHud(build) {
    const pieces = [
      { id: 'wall', label: 'WALL', key: '1' },
      { id: 'floor', label: 'FLOOR', key: '2' },
      { id: 'ramp', label: 'RAMP', key: '3' },
      { id: 'roof', label: 'ROOF', key: '4' }
    ];
    this.buildPieceWrap.innerHTML = pieces.map((p) =>
      `<button class="bp ${build.pieceType === p.id ? 'active' : ''}" data-piece="${p.id}"><span>${p.label}</span><em>${p.key}</em></button>`
    ).join('');
    this.buildPieceWrap.querySelectorAll('.bp').forEach((b) => {
      b.onclick = () => build.setPieceType(b.dataset.piece);
    });
    const mats = Object.values(MATERIALS).map((m) =>
      `<button class="bm ${build.material === m.id ? 'active' : ''}" data-mat="${m.id}" style="--mc:${m.color}">
        <span class="bm-swatch"></span><span class="bm-name">${m.name}</span><span class="bm-count">${build.player.unlimitedMats ? '∞' : Math.floor(build.player.mats[m.id] || 0)}</span>
      </button>`
    ).join('');
    this.buildMatWrap.innerHTML = mats;
    this.buildMatWrap.querySelectorAll('.bm').forEach((b) => {
      b.onclick = () => build.setMaterial(b.dataset.mat);
    });
  }

  structureDamage() { /* reserved for build HP UI */ }
  pieceDestroyed() { this.toast('Structure destroyed'); }

  buildPlaced(piece, cost, material) {
    const el = this.matCounts[material];
    if (el) el.classList.remove('spend');
  }

  updateCompass(player) {
    const ctx = this.compass.getContext('2d');
    const w = this.compass.width, h = this.compass.height;
    ctx.clearRect(0, 0, w, h);
    const yawDeg = ((-player.yaw * 180 / Math.PI) % 360 + 360) % 360;
    const dirs = [['N', 0], ['NE', 45], ['E', 90], ['SE', 135], ['S', 180], ['SW', 225], ['W', 270], ['NW', 315]];
    ctx.font = '600 13px Inter, system-ui, sans-serif';
    ctx.textAlign = 'center';
    for (const [name, deg] of dirs) {
      let diff = ((deg - yawDeg + 540) % 360) - 180;
      const x = w / 2 + diff * 3;
      if (x < 10 || x > w - 10) continue;
      const major = deg % 90 === 0;
      ctx.fillStyle = major ? 'rgba(255,255,255,0.92)' : 'rgba(255,255,255,0.5)';
      ctx.fillText(name, x, major ? 18 : 21);
      if (major) {
        ctx.fillStyle = 'rgba(255,255,255,0.55)';
        ctx.fillRect(x - 0.5, 24, 1, 5);
      }
    }
    ctx.fillStyle = '#5ce1ff';
    ctx.fillRect(w / 2 - 1, 0, 2, 6);
  }

  drawMinimap(world, state) {
    const ctx = this.minimap.getContext('2d');
    world.drawMinimap(ctx, this.minimap.width, this.minimap.height, state.player, state.storm, state.participants);
    this.mapCoords.textContent = `${Math.round(state.player.pos.x)}, ${Math.round(state.player.pos.z)}`;
  }

  update(dt, state) {
    const p = state.player;
    if (!p) return;
    this.lastPlayer = p;
    if (this.inventory.classList.contains('open')) this.refreshInventory(p);
    this.updateTouchVisibility();
    const hp = Math.max(0, p.health), sh = Math.max(0, p.shield);
    this.healthFill.style.width = `${hp}%`;
    this.healthText.textContent = Math.ceil(hp);
    this.shieldFill.style.width = `${sh}%`;
    this.shieldText.textContent = Math.ceil(sh);
    this.vitalsName.textContent = p.name;
    this.healthFill.classList.toggle('low', hp < 30);

    for (const [k, el] of Object.entries(this.matCounts)) {
      el.textContent = p.unlimitedMats ? '∞' : Math.floor(p.mats[k] || 0);
    }

    // hotbar
    const sig = p.slots.map((s) => s ? `${s.weaponId || s.itemId}${s.rarity || ''}` : '-').join('|') + p.activeSlot;
    if (sig !== this.lastInventorySig) {
      this.lastInventorySig = sig;
      this.hotbar.innerHTML = p.slots.map((item, i) => {
        if (!item) return `<div class="slot empty" data-slot="${i}"><span class="slot-key">${SLOT_KEYS[i]}</span></div>`;
        const rar = item.rarity ? rarityById(item.rarity).color : '#b8c0c9';
        const label = item.kind === 'weapon' ? WEAPONS[item.weaponId].name : CONSUMABLES[item.itemId]?.name || '';
        const count = item.kind === 'consumable' ? `<span class="slot-count">${item.count}</span>` : '';
        return `<div class="slot ${i === p.activeSlot ? 'active' : ''}" data-slot="${i}" style="--rar:${rar}">
          <span class="slot-key">${SLOT_KEYS[i]}</span>
          <span class="slot-glyph">${this.glyphFor(item)}</span>
          <span class="slot-label">${label}</span>${count}</div>`;
      }).join('');
      this.hotbar.querySelectorAll('.slot').forEach((el) => {
        el.onclick = () => p.selectSlot(Number(el.dataset.slot));
      });
    } else {
      this.hotbar.querySelectorAll('.slot').forEach((el, i) => el.classList.toggle('active', i === p.activeSlot));
    }

    const item = p.activeItem;
    if (item && item.kind === 'weapon') {
      const def = WEAPONS[item.weaponId];
      const rar = rarityById(item.rarity || 'common');
      this.weaponNameEl.textContent = def.name;
      this.weaponNameEl.style.color = rar.color;
      if (def.slot === 'pickaxe') {
        this.magEl.textContent = '∞';
        this.reserveEl.textContent = '';
      } else {
        this.magEl.textContent = item.mag ?? 0;
        const ammoType = def.ammo;
        this.reserveEl.textContent = ammoType ? `/ ${p.ammo[ammoType] || 0}` : '';
      }
      this.reloadHint.classList.toggle('show', (item.mag ?? 1) <= 0 && def.slot !== 'pickaxe');
    } else if (item && item.kind === 'consumable') {
      this.weaponNameEl.textContent = CONSUMABLES[item.itemId]?.name || 'Item';
      this.weaponNameEl.style.color = '#7fe6ff';
      this.magEl.textContent = item.count;
      this.reserveEl.textContent = '';
      this.reloadHint.classList.remove('show');
    } else {
      this.weaponNameEl.textContent = '';
      this.magEl.textContent = '';
      this.reserveEl.textContent = '';
      this.reloadHint.classList.remove('show');
    }

    // storm
    if (state.storm) {
      const s = state.storm;
      if (!s.active) {
        this.stormTime.textContent = 'IDLE';
        this.stormLabel.textContent = 'Storm forming';
      } else if (s.state === 'final') {
        this.stormTime.textContent = 'FINAL';
        this.stormLabel.textContent = 'Zone';
      } else {
        this.stormTime.textContent = `${Math.ceil(s.timer)}s`;
        this.stormLabel.textContent = s.state === 'closing' ? 'Closing' : 'Next zone';
      }
      this.stormVignette.classList.toggle('active', !!p.outsideStorm);
    } else if (state.mode?.storm === false) {
      this.stormTime.textContent = 'OFF';
      this.stormLabel.textContent = 'No storm';
      this.stormVignette.classList.remove('active');
    }

    if (!state.spectating) this.spectateEl.classList.remove('visible');
    this.aliveNum.textContent = state.aliveCount ?? '--';
    this.aliveLabel.textContent = state.aliveLabel || 'Alive';
    if (state.teamScores) {
      this.scorePanel.innerHTML = state.teamScores.map((s, i) =>
        `<span class="score-team ${i === 0 ? 't0' : 't1'}">${s}</span>`).join('<span class="score-sep">:</span>') +
        `<span class="score-target">/ ${state.scoreTarget || ''}</span>`;
    }

    if (state.fps !== undefined) {
      this.fpsEl.textContent = `${state.fps} FPS`;
      this.fpsEl.style.display = settings.showFps ? 'block' : 'none';
    }

    // crosshair spread + scope
    const spread = p.aiming ? 5 : p.sprinting ? 20 : 11;
    this.crosshair.style.setProperty('--spread', `${spread}px`);
    this.crosshair.classList.toggle('hidden', this.buildMode || p.usingConsumable || !!state.spectating);
    const scoped = p.aiming && (p.weaponDef?.scope || 0) > 1;
    this.scope.classList.toggle('visible', !!scoped);

    if (this.buildMode) {
      this.updateBuildHud(state.build);
      const anyMats = Object.entries(p.mats).map(([k, v]) => `${k}:${Math.floor(v)}`).join(' ');
      this.buildMatWrap.dataset.mats = anyMats;
    }

    // compass + map throttled
    this.updateCompass(p);
    const now = performance.now();
    if (now - this.lastMinimap > 120) {
      this.lastMinimap = now;
      try { this.drawMinimap(state.world, state); } catch { /* map not ready */ }
    }

    // damage numbers
    for (let i = this.damageNumbers.length - 1; i >= 0; i--) {
      const d = this.damageNumbers[i];
      d.life -= dt;
      if (d.world && state.camera) {
        const v = d.world.clone().project(state.camera);
        if (v.z > 1 || v.z < -1) { d.el.style.opacity = 0; }
        else {
          const x = (v.x * 0.5 + 0.5) * window.innerWidth;
          const y = (-v.y * 0.5 + 0.5) * window.innerHeight;
          d.el.style.left = `${x}px`;
          d.el.style.top = `${y - (0.85 - d.life) * 40}px`;
        }
      }
      d.el.style.opacity = Math.min(1, d.life * 2.4);
      if (d.life <= 0) { d.el.remove(); this.damageNumbers.splice(i, 1); }
    }
  }

  // ---------------- touch layout editor ----------------
  startLayoutEditor() {
    this.editingLayout = true;
    this.touchRoot.classList.add('editing');
    for (const b of this.touchElements) {
      if (!settings.touch.layout[b.dataset.action]) continue;
      b.onpointerdown = (e) => {
        e.preventDefault();
        const rect = this.root.getBoundingClientRect();
        const move = (ev) => {
          const x = ((ev.clientX - rect.left) / rect.width) * 100;
          const y = ((ev.clientY - rect.top) / rect.height) * 100;
          settings.touch.layout[b.dataset.action].x = Math.max(4, Math.min(96, x));
          settings.touch.layout[b.dataset.action].y = Math.max(6, Math.min(94, y));
          applyTouchLayout();
        };
        const up = () => {
          window.removeEventListener('pointermove', move);
          window.removeEventListener('pointerup', up);
          saveSettings();
        };
        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', up);
      };
    }
    const applyTouchLayout = () => this.applyTouchLayout();
    this.toast('Drag buttons to reposition. Size slider in Settings > Touch.', 4000);
  }

  stopLayoutEditor() {
    this.editingLayout = false;
    this.touchRoot.classList.remove('editing');
    for (const b of this.touchElements) b.onpointerdown = null;
    saveSettings();
  }

  toggleTouchControls(force) {
    const on = force ?? !this.touchRoot.classList.contains('enabled');
    this.touchRoot.classList.toggle('enabled', on);
  }
}
