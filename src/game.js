import * as THREE from 'three';
import { World } from './world.js';
import { Player } from './player.js';
import { BuildSystem } from './building.js';
import { CombatSystem } from './weapons.js';
import { BotsSystem, Bot } from './bots.js';
import { Storm } from './storm.js';
import { LootSystem } from './loot.js';
import { OUTLETS, WEAPONS, PLAYER_CAPS, modeById } from './data.js';
import { settings, profile, saveProfile, addXP } from './settings.js';

const ARENA = { x: 760, z: 760, y: 86 };

export class Match {
  constructor({ engine, audio, ui, hud, input, modeId, teamSize }) {
    this.engine = engine;
    this.audio = audio;
    this.ui = ui;
    this.hud = hud;
    this.input = input;
    this.modeId = modeId;
    this.baseMode = modeById(modeId);
    const cap = PLAYER_CAPS[modeId] || 2;
    let ts = this.baseMode.lockedTeamSize ? this.baseMode.teamSize : teamSize;
    if (this.baseMode.id === 'zonewars') ts = 4;
    if (this.baseMode.id === 'rumble') ts = 20;
    if (this.baseMode.teamSize && this.baseMode.id === 'rumble') ts = 20;
    const teams = this.baseMode.id === 'practice' || this.baseMode.id === 'creative' ? 1 : this.baseMode.id === 'rounds' ? 2 : Math.max(1, Math.floor(cap / ts));
    this.mode = { ...this.baseMode, teamSize: ts, teams };
    this.mode.cap = cap;
    this.totalPlayers = Math.min(cap, teams * ts);
    if (this.mode.id === 'practice' || this.mode.id === 'creative') this.totalPlayers = 1;

    this.phase = this.mode.bus ? 'bus' : 'match';
    this.time = 0;
    this.matchTime = 0;
    this.paused = false;
    this.finished = false;
    this.buildMode = false;
    this.spectating = null;
    this.deathTimer = 0;
    this.finalPlacement = null;
    this.teamScores = { 0: 0, 1: 0 };
    this.roundWins = { 0: 0, 1: 0 };
    this.supplyTimer = 78;
    this.fpsSamples = [];
    this.fps = 60;
    this.killLog = [];

    this.world = new World(engine, 20260000 + Math.floor(Math.random() * 9999));
    this.world.timeOfDay = 0.12 + Math.random() * 0.2;
    const weather = settings.weather === 'auto' ? ['clear', 'clear', 'rain', 'fog'][Math.floor(Math.random() * 4)] : settings.weather;
    this.world.setWeather(weather);

    this.camera = new THREE.PerspectiveCamera(settings.fov, window.innerWidth / window.innerHeight, 0.1, 2600);
    this.engine.activeCamera = this.camera;
    this.engine.activeScene = this.world.scene;

    const outfit = OUTLETS.find((o) => o.id === settings.locker.outfit) || OUTLETS[0];
    this.player = new Player({
      world: this.world, name: settings.name, team: 0, isPlayer: true, palette: outfit.palette,
      unlimitedMats: !!(this.mode.unlimitedMats || this.mode.creative)
    });
    this.bowCharge = 0;
    this.input.onAction = (type, data) => {
      if (this.paused || this.finished) return;
      if (type === 'wheel') {
        if (this.buildMode) this.building.cycleMaterial(data > 0 ? -1 : 1);
        else this.cycleSlot(data > 0 ? 1 : -1);
      }
    };
    this.participants = [this.player];
    this.audio.setListener(this.player.pos);

    this.building = new BuildSystem({
      world: this.world, scene: this.world.scene, player: this.player, audio: this.audio, ui: this.hud
    });
    this.building.enabled = false;

    this.combat = new CombatSystem({
      world: this.world, scene: this.world.scene, audio: this.audio, ui: this.hud, building: this.building
    });
    this.combat.setParticipants(this.participants);
    this.combat.player = this.player;

    this.botsSystem = new BotsSystem({
      world: this.world, mode: this.mode, combat: this.combat, building: this.building,
      loot: null, ui: this.hud
    });
    this.hud.onDropSlot = (index) => {
      const item = this.player.slots[index];
      if (!item) return;
      this.loot.dropItem(item, this.player.pos);
      this.player.slots[index] = null;
      if (this.player.activeSlot === index) this.player.selectSlot(0);
      this.hud.lastInventorySig = '';
      this.hud.refreshInventory(this.player);
    };

    this.spawnPoints = this.world.spawnPoints(this.mode.arena ? 8 : 30);
    this.arenaSpawns = [];
    if (this.mode.arena) this.buildArena();

    this.playerSpawn = this.mode.arena ? this.arenaSpawns[0] : null;
    this.player.spawn(this.playerSpawn?.x ?? 0, this.playerSpawn?.z ?? 0, this.playerSpawn?.y);

    this.spawnBots();

    this.loot = new LootSystem({
      world: this.world, scene: this.world.scene, combat: this.combat, audio: this.audio, ui: this.hud, mode: this.mode
    });
    this.botsSystem.loot = this.loot;
    this.loot.spawnFromSpots(this.mode.arena ? this.arenaLootSpots : this.world.lootSpots);

    this.storm = null;
    this.setupStorm();
    this.setupInitialState();
    this.wireEvents();
    this.audio.setListener(this.player.pos);
    this.audio.playMusic();

    if (this.mode.bus) this.setupBus();
  }

  // ---------- setup ----------
  buildArena() {
    const size = this.mode.id === 'boxfights' ? 34 : this.mode.id === 'zonewars' ? 54 : 44;
    const y = ARENA.y;
    const geo = new THREE.BoxGeometry(size, 2, size);
    const deck = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: '#4a5563', roughness: 0.85, metalness: 0.25 }));
    deck.position.set(ARENA.x, y - 1, ARENA.z);
    deck.receiveShadow = true;
    deck.castShadow = true;
    this.world.scene.add(deck);
    this.world.addCollider(
      { x: ARENA.x - size / 2, y: y - 2, z: ARENA.z - size / 2 },
      { x: ARENA.x + size / 2, y, z: ARENA.z + size / 2 },
      'floor', { walkable: true, noBlock: true }
    );
    // railings
    const railMat = new THREE.MeshStandardMaterial({ color: '#7fe6ff', emissive: '#2aa8d8', emissiveIntensity: 0.6, roughness: 0.4 });
    const railGeo = new THREE.BoxGeometry(size, 0.5, 0.4);
    for (let i = 0; i < 4; i++) {
      const rail = new THREE.Mesh(railGeo, railMat);
      rail.position.set(ARENA.x + (i < 2 ? 0 : (i === 2 ? -size / 2 : size / 2)), y + 0.6, ARENA.z + (i < 2 ? (i === 0 ? -size / 2 : size / 2) : 0));
      rail.rotation.y = i < 2 ? 0 : Math.PI / 2;
      this.world.scene.add(rail);
      this.world.addCollider(
        { x: rail.position.x - (i < 2 ? size / 2 : 0.2), y: y + 0.3, z: rail.position.z - (i < 2 ? 0.2 : size / 2) },
        { x: rail.position.x + (i < 2 ? size / 2 : 0.2), y: y + 1.0, z: rail.position.z + (i < 2 ? 0.2 : size / 2) },
        'wall', { walkable: true }
      );
    }
    // cover
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      const cx = ARENA.x + Math.cos(a) * size * 0.28;
      const cz = ARENA.z + Math.sin(a) * size * 0.28;
      const box = new THREE.Mesh(new THREE.BoxGeometry(5, 2.4, 5), new THREE.MeshStandardMaterial({ color: '#6c7784', roughness: 0.8 }));
      box.position.set(cx, y + 1.2, cz);
      box.castShadow = true;
      box.receiveShadow = true;
      this.world.scene.add(box);
      this.world.addCollider({ x: cx - 2.5, y, z: cz - 2.5 }, { x: cx + 2.5, y: y + 2.4, z: cz + 2.5 }, 'wall', { walkable: true });
    }
    const half = size / 2 - 2.5;
    this.arenaSpawns = [
      { x: ARENA.x - half, z: ARENA.z - half, y: y + 0.4 },
      { x: ARENA.x + half, z: ARENA.z + half, y: y + 0.4 },
      { x: ARENA.x + half, z: ARENA.z - half, y: y + 0.4 },
      { x: ARENA.x - half, z: ARENA.z + half, y: y + 0.4 },
      { x: ARENA.x, z: ARENA.z - half, y: y + 0.4 },
      { x: ARENA.x, z: ARENA.z + half, y: y + 0.4 },
      { x: ARENA.x - half, z: ARENA.z, y: y + 0.4 },
      { x: ARENA.x + half, z: ARENA.z, y: y + 0.4 }
    ];
    this.arenaLootSpots = [];
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + 0.4;
      this.arenaLootSpots.push({ x: ARENA.x + Math.cos(a) * (size * 0.34), y: y + 0.2, z: ARENA.z + Math.sin(a) * (size * 0.34), tier: i < 2 ? 'chest' : 'floor' });
    }
  }

  setupStorm() {
    if (this.mode.storm) {
      const center = this.mode.arena ? { x: ARENA.x, z: ARENA.z } : { x: 0, z: 0 };
      this.storm = new Storm({ scene: this.world.scene, mode: this.mode, initialCenter: center });
      if (this.mode.arena) {
        this.storm.radius = this.mode.id === 'zonewars' ? 34 : 400;
        this.storm.phaseCount = 5;
      }
      this.storm.onPlayerDamage = (dmg) => { if (this.player.alive) this.player.takeDamage(dmg, { storm: true }); };
      this.storm.onEliminated = (p) => this.handleElimination(p, null, { storm: true });
      this.storm.phaseCount = this.mode.arena ? 5 : 9;
    }
  }

  setupInitialState() {
    this.player.health = 100;
    this.player.shield = 0;
    this.player.activeSlot = 0;
    if (this.mode.practice || this.mode.creative || this.mode.arena) {
      this.player.addItem({ kind: 'weapon', weaponId: 'ar', rarity: 'rare', mag: 30 });
      this.player.addAmmo('medium', 240);
      this.player.addAmmo('light', 180);
      this.player.addAmmo('heavy', 30);
      this.player.addAmmo('shells', 24);
      this.player.addItem({ kind: 'weapon', weaponId: 'shotgun', rarity: 'uncommon', mag: 5 });
      this.player.addItem({ kind: 'consumable', itemId: 'mini', count: 3 });
      this.player.selectSlot(1);
    }
    if (this.mode.practice) {
      this.player.shield = 100;
      const poi = this.world.pois.find((p) => p.id === 'brightbay') || this.world.pois[0];
      const x = poi.x + 18, z = poi.z + 18;
      this.player.spawn(x, z, this.world.groundHeight(x, z) + 0.4);
      this.spawnDummies(x, z);
    } else if (this.mode.arena) {
      this.player.spawn(this.arenaSpawns[0].x, this.arenaSpawns[0].z, this.arenaSpawns[0].y);
      this.player.yaw = Math.atan2(ARENA.x - this.player.pos.x, ARENA.z - this.player.pos.z);
      this.player.shield = 50;
    } else if (this.mode.creative) {
      const poi = this.world.pois[2];
      this.player.spawn(poi.x + 30, poi.z + 30, this.world.groundHeight(poi.x + 30, poi.z + 30) + 0.4);
    }
    this.player.syncWeaponModel();
    this.building.material = 'wood';
  }

  spawnDummies(x, z) {
    this.dummies = [];
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const dx = x + Math.cos(a) * (12 + i * 3);
      const dz = z + Math.sin(a) * (12 + i * 3);
      const bot = new Bot({
        name: `Target ${i + 1}`, team: 99, skill: 0, x: dx, z: dz,
        y: this.world.groundHeight(dx, dz) + 0.2,
        palette: { skin: '#d9b26f', shirt: '#d94a4a', pants: '#3a2222', accent: '#ffd166', hair: '#22242a' }
      });
      bot.health = 150;
      bot.maxHealth = 150;
      bot.dummy = true;
      bot.ensureCharacter(this.world);
      bot.character.setWeapon('ar', '#ff6b6b');
      this.participants.push(bot);
      this.combat.participants = this.participants;
      this.dummies.push(bot);
    }
  }

  spawnBots() {
    if (this.mode.practice || this.mode.creative) {
      this.botsSystem.spawnBots(0, 0, this.spawnPoints);
      return;
    }
    const count = Math.max(0, this.totalPlayers - 1);
    const points = this.mode.arena ? this.arenaSpawns.slice(1) : this.spawnPoints;
    this.botsSystem.spawnBots(count, 0, points);
    this.combat.setParticipants(this.participants);
    // ensure teammate/team mates are spread around their spawn
    for (const bot of this.botsSystem.bots) {
      if (this.mode.arena) {
        const sp = points[Math.floor(Math.random() * points.length)];
        bot.pos.set(sp.x + (Math.random() - 0.5) * 6, sp.y, sp.z + (Math.random() - 0.5) * 6);
      }
    }
  }

  setupBus() {
    const angle = Math.random() * Math.PI * 2;
    const dir = new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle));
    const mid = new THREE.Vector3(0, 0, 0);
    this.bus = {
      start: mid.clone().addScaledVector(dir, -900).setY(255),
      end: mid.clone().addScaledVector(dir, 900).setY(255),
      dir, t: 0, duration: 27, deployed: false
    };
    this.player.pos.copy(this.bus.start);
    this.player.character.group.visible = false;
    this.busObj = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(6, 3.4, 12), new THREE.MeshStandardMaterial({ color: '#2aa8d8', roughness: 0.5, metalness: 0.4, emissive: '#10506e', emissiveIntensity: 0.4 }));
    const wingL = new THREE.Mesh(new THREE.BoxGeometry(3, 0.3, 4), new THREE.MeshStandardMaterial({ color: '#9fe6ff' }));
    wingL.position.set(-4, 0.4, 0);
    const wingR = wingL.clone();
    wingR.position.x = 4;
    const flame = new THREE.Mesh(new THREE.ConeGeometry(1.2, 3, 8), new THREE.MeshBasicMaterial({ color: '#7fe6ff' }));
    flame.rotation.x = Math.PI / 2;
    flame.position.set(0, 0, -7.5);
    this.busObj.add(body, wingL, wingR, flame);
    this.busObj.scale.setScalar(1.5);
    this.world.scene.add(this.busObj);
    this.busFlame = flame;
    this.busTimer = this.bus.duration;
    for (const bot of this.botsSystem.bots) {
      bot.deployAt = 1.5 + Math.random() * (this.bus.duration - 4);
      bot.character && (bot.character.group.visible = false);
      bot.onBus = true;
    }
    this.hud.setBus(true, { altitude: 255, timeLeft: this.bus.duration });
  }

  wireEvents() {
    this.combat.onKill = (victim, killer, info) => this.handleElimination(victim, killer, info);
    this.combat.onDamage = (target, amount, shooter, headshot) => {
      if (shooter === this.player) this.player.damageDealt += amount;
    };
    this.botsSystem.onEliminated = (victim, killer, info) => this.handleElimination(victim, killer, info);
  }

  // ---------- lifecycle ----------
  setPaused(paused) {
    this.paused = paused;
    this.input.setEnabled(!paused && !this.finished);
    this.hud.setPaused(paused);
    if (paused) {
      this.audio.stopMusic();
      this.input.exitPointerLock();
    } else {
      this.audio.playMusic();
      if (!this.input.usingTouch) this.input.requestPointerLock();
    }
  }

  deployFromBus() {
    if (!this.bus || this.bus.deployed) return;
    this.bus.deployed = true;
    this.phase = 'falling';
    this.player.pos.copy(this.busObj.position);
    this.player.pos.y -= 4;
    this.player.vel.set(this.bus.dir.x * 9, -2, this.bus.dir.z * 9);
    this.player.autoGlide = true;
    this.player.alive = true;
    this.player.character.group.visible = true;
    this.player.character.group.position.copy(this.player.pos);
    this.player.onGround = false;
    this.player.gliding = true;
    this.hud.setBus(false);
    this.hud.toast('Hold jump to glide • land and loot fast', 3200);
    this.audio.ui();
    if (this.world.scene.getObjectById(this.busObj.id)) this.world.scene.remove(this.busObj);
    this.input.requestPointerLock();
  }

  finishMatch(victory, opts = {}) {
    if (this.finished) return;
    this.finished = true;
    this.phase = 'end';
    this.input.setEnabled(false);
    this.input.exitPointerLock();
    this.ui.root.classList.remove('hidden');
    this.ui.root.classList.add('ending');
    this.hud.setBus(false);
    this.audio.stopMusic();
    this.building.removePreview();
    const placement = opts.placement ?? (victory ? 1 : (this.finalPlacement || Object.keys(this.teamScores).length || 2));
    const xp = Math.round(55 + this.player.kills * 24 + Math.max(0, 100 - placement * 2.2) * 1.3 + (victory ? 140 : 0));
    profile.matches += 1;
    profile.kills += this.player.kills;
    profile.damage += this.player.damageDealt;
    if (victory) {
      profile.wins += 1;
      profile.modeWins[this.mode.id] = (profile.modeWins[this.mode.id] || 0) + 1;
    }
    if (!profile.bestPlacement || placement < profile.bestPlacement) profile.bestPlacement = placement;
    let rankDelta = 0;
    if (this.mode.ranked) {
      rankDelta = Math.max(2, 28 - placement * 2) + this.player.kills * 12;
      if (victory) rankDelta += 45;
      profile.rankPoints += rankDelta;
    }
    addXP(xp);
    saveProfile();
    if (victory) this.audio.victory(); else this.audio.defeat();
    this.ui.showEnd({
      victory, placement, kills: this.player.kills, damage: this.player.damageDealt, xp, rankDelta,
      title: victory ? 'VICTORY ROYALE' : 'ELIMINATED',
      subtitle: victory ? 'Last one standing.' : opts.subtitle || 'The island won this one.'
    });
    this.engine.activeCamera = this.camera;
  }

  // ---------- elimination ----------
  handleElimination(victim, killer, info = {}) {
    if (victim._elimHandled) return;
    victim._elimHandled = true;
    const weaponName = info?.storm ? 'Storm' : info?.weapon?.name || 'Eliminated';
    const killerName = killer ? killer.name : 'Storm';
    if (killer && killer !== victim) killer.kills = (killer.kills || 0) + 1;
    if (killer && killer.team !== undefined && killer.team !== 99) this.addTeamScore(killer.team);
    this.killLog.push({ killer: killerName, victim: victim.name, weapon: weaponName });
    this.hud.addKillFeed(killerName, victim.name, weaponName, { headshot: info?.headshot, abstract: victim.distanceToPlayer > 200 });
    this.audio.hit(!!info?.headshot);

    if (victim === this.player) {
      this.onPlayerDeath(killer);
    } else {
      // drop loot
      if (!victim.dummy) {
        const pos = victim.pos.clone();
        this.loot.spawnMats(pos.x + 1, pos.y, pos.z, 25, 'wood');
        this.loot.spawnAmmo(pos.x - 1, pos.y, pos.z, 'light');
        if (victim.slots?.[0]) this.loot.spawn({ ...victim.slots[0] }, pos.clone().add(new THREE.Vector3(0, 0, 1)));
      } else {
        this.scheduleDummyRespawn(victim);
      }
      if (this.mode.respawn && !victim.dummy && victim.team !== 99) this.scheduleRespawn(victim);
    }
    this.checkMatchEnd();
  }

  addTeamScore(team) {
    if (this.mode.winCondition !== 'score' && this.mode.id !== 'rumble') return;
    if (team !== 0 && team !== 1) return;
    this.teamScores[team] = (this.teamScores[team] || 0) + 1;
    this.hud.toast(`Team ${team === 0 ? 'Alpha' : 'Bravo'} scored (${this.teamScores[team]}/${this.mode.scoreTarget || 25})`, 1400);
    this.checkMatchEnd();
  }

  onPlayerDeath(killer) {
    this.spectating = this.participants.find((p) => p.alive && p !== this.player && !p.dummy) || null;
    this.finalPlacement = Math.max(1, this.aliveTeams());
    this.deathTimer = 0;
    if (this.mode.respawn) {
      this.schedulePlayerRespawn();
      return;
    }
    this.hud.spectate(this.spectating ? this.spectating.name : null);
    this.hud.toast(killer ? `Eliminated by ${killer.name}` : 'Eliminated by the storm', 3200);
    this.input.exitPointerLock();
    this.checkMatchEnd();
  }

  schedulePlayerRespawn() {
    setTimeout(() => {
      if (this.finished) return;
      const sp = this.mode.arena ? this.arenaSpawns[0] : this.spawnPoints[Math.floor(Math.random() * this.spawnPoints.length)];
      this.player.spawn(sp.x + (Math.random() - 0.5) * 4, sp.z + (Math.random() - 0.5) * 4, sp.y ?? undefined);
      this.player.health = 100;
      this.player.shield = 50;
      this.player._elimHandled = false;
      this.player.character.group.visible = true;
      this.spectating = null;
      this.hud.spectate(null);
      this.hud.toast('Respawning');
      this.player.syncWeaponModel();
    }, 2600);
  }

  scheduleRespawn(bot) {
    setTimeout(() => {
      if (this.finished) return;
      const sp = this.mode.arena ? this.arenaSpawns[Math.floor(Math.random() * this.arenaSpawns.length)] : this.spawnPoints[Math.floor(Math.random() * this.spawnPoints.length)];
      bot.pos.set(sp.x + (Math.random() - 0.5) * 5, sp.y ?? this.world.groundHeight(sp.x, sp.z) + 0.3, sp.z + (Math.random() - 0.5) * 5);
      bot.health = 100;
      bot.shield = 25;
      bot.alive = true;
      bot._elimHandled = false;
      if (bot.character) {
        bot.character.group.visible = true;
        bot.character.setHealthRatio(1);
      }
      this.checkMatchEnd();
    }, 2800);
  }

  scheduleDummyRespawn(dummy) {
    setTimeout(() => {
      if (this.finished || !dummy) return;
      dummy.health = 150;
      dummy.alive = true;
      dummy._elimHandled = false;
      dummy.pos.copy(dummy.homePos || dummy.pos);
      if (dummy.character) {
        dummy.character.group.visible = true;
        dummy.character.setHealthRatio(1);
      }
    }, 2400);
  }

  aliveTeams() {
    const teams = new Set();
    for (const p of this.participants) {
      if (p.alive && !p.dummy && p.team !== 99) teams.add(p.team);
    }
    return teams.size;
  }

  aliveCount() {
    return this.participants.filter((p) => p.alive && !p.dummy).length;
  }

  aliveTeamCount(team) {
    return this.participants.filter((p) => p.alive && !p.dummy && p.team === team).length;
  }

  checkMatchEnd() {
    if (this.finished || this.phase === 'end') return;
    if (this.mode.winCondition === 'sandbox') return;
    if (this.mode.winCondition === 'score') {
      const target = this.mode.scoreTarget || (this.mode.id === 'rumble' ? 25 : 5);
      if ((this.teamScores[0] || 0) >= target) this.finishMatch(true);
      else if ((this.teamScores[1] || 0) >= target) this.finishMatch(false);
      return;
    }
    if (this.mode.winCondition === 'rounds') {
      const teams = this.aliveTeams();
      if (teams <= 1 && this.phase === 'match') {
        const aliveTeamIds = [...new Set(this.participants.filter((p) => p.alive && !p.dummy && p.team !== 99).map((p) => p.team))];
        const winner = aliveTeamIds.length ? aliveTeamIds[0] : 0;
        this.roundWins[winner] = (this.roundWins[winner] || 0) + 1;
        this.hud.toast(`Round ${this.roundWins[winner]} won by ${winner === 0 ? 'Alpha' : 'Bravo'}`, 1800);
        if (this.roundWins[winner] >= 2) {
          this.finishMatch(winner === 0);
        } else {
          this.phase = 'roundEnd';
          setTimeout(() => this.startRound(), 3000);
        }
      }
      return;
    }
    // last team standing
    const teams = this.aliveTeams();
    if (!this.player.alive && this.spectating && !this.spectating.alive) {
      this.spectating = this.participants.find((p) => p.alive && !p.dummy && p !== this.player) || null;
      this.hud.spectate(this.spectating?.name || null);
    }
    if (teams <= 1) {
      const win = this.player.alive || this.aliveTeamCount(0) > 0;
      this.finishMatch(win, { placement: win ? 1 : this.finalPlacement });
      return;
    }
    if (this.player.team === 0 && !this.player.alive && this.aliveTeamCount(0) === 0) {
      // player's team wiped - placement already recorded
      this.finalPlacement = Math.max(1, teams + 1);
    }
  }

  startRound() {
    if (this.finished) return;
    this.phase = 'match';
    if (this.storm) { this.storm.dispose(); this.storm = null; }
    this.setupStorm();
    const all = [this.player, ...this.botsSystem.bots];
    all.forEach((p, i) => {
      const sp = this.arenaSpawns[i % this.arenaSpawns.length];
      p.pos.set(sp.x, sp.y, sp.z);
      p.vel?.set(0, 0, 0);
      p.health = 100;
      p.shield = 50;
      p.alive = true;
      p._elimHandled = false;
      if (p.character) {
        p.character.group.visible = true;
        p.character.group.position.copy(p.pos);
        p.character.setHealthRatio(1);
      }
      if (p === this.player) {
        p.activeSlot = Math.min(p.slots.length - 1, 1);
      }
    });
    this.hud.toast('New round', 1500);
  }

  // ---------- update ----------
  update(dt) {
    this.time += dt;
    this.fpsSamples.push(dt);
    if (this.fpsSamples.length > 30) this.fpsSamples.shift();
    const avg = this.fpsSamples.reduce((a, b) => a + b, 0) / this.fpsSamples.length;
    this.fps = Math.round(1 / Math.max(0.0001, avg));

    if (!this.paused && !this.finished) {
      this.input.update();
      this.updateMatch(dt);
      this.input.postUpdate();
    } else {
      this.input.update();
      this.input.postUpdate();
    }
    this.audio.setListener(this.player.alive ? this.player.pos : (this.spectating?.pos || this.player.pos));
    this.updateCamera(dt);
    this.updateHud(dt);
  }

  updateMatch(dt) {
    this.matchTime += dt;
    this.combat.update(dt);
    this.loot.update(dt);
    this.building.update(dt, this.input, {
      fireHeld: this.buildMode && this.input.down('fire') && !this.hud.inventory.classList.contains('open'),
      firePressed: this.input.pressed('fire'),
      editPressed: this.buildMode && this.input.pressed('edit'),
      resetPressed: this.buildMode && this.input.pressed('resetEdit'),
      camera: this.camera,
      cycleMaterial: 0
    });

    if (this.phase === 'bus') {
      this.updateBus(dt);
      this.botsSystem.bots.forEach((b) => { if (b.character) b.character.group.visible = false; });
      if (this.storm) this.storm.update(dt, []);
      return;
    }

    if (this.phase === 'falling') {
      this.player.update(dt, this.input, { audio: this.audio, firing: false });
      if (this.player.onGround || this.player.swimming || this.player.pos.y <= this.world.waterLevel + 1.4) {
        this.phase = 'match';
        this.player.autoGlide = false;
        this.hud.setBus(false);
        this.hud.toast('Landed • find loot and stay in the zone', 2600);
        if (!this.input.usingTouch) this.input.requestPointerLock();
      }
    } else if (this.phase === 'match' || this.phase === 'roundEnd') {
      if (this.player.alive && !this.player.vehicle) {
        this.player.update(dt, this.input, { audio: this.audio, firing: false });
        this.handlePlayerActions(dt);
        this.updateConsumable(dt);
      } else if (this.player.vehicle) {
        this.updateVehicle(dt);
      }
      if (!this.player.alive) this.updateSpectating(dt);
    }

    if (this.phase !== 'bus') {
      this.botsSystem.update(dt, {
        world: this.world, combat: this.combat, storm: this.storm, building: this.building,
        mode: this.mode, player: this.player, participants: this.participants
      });
    }

    // dummies stay put
    if (this.dummies) {
      for (const d of this.dummies) {
        if (!d.alive) continue;
        if (d.character) {
          d.character.group.position.copy(d.pos);
          d.character.update(dt, { speed: 0, crouching: false, sliding: false, gliding: false, aiming: false, firing: false });
        }
      }
    }

    if (this.storm) {
      if (!this.storm.active && this.phase === 'match' && this.matchTime > (this.mode.arena ? 1.5 : 42)) this.storm.begin();
      this.storm.update(dt, this.participants);
    }

    // supply drops
    if (this.mode.storm && !this.mode.arena && this.matchTime > 60) {
      this.supplyTimer -= dt;
      if (this.supplyTimer <= 0) {
        this.supplyTimer = 80;
        const c = this.storm ? this.storm.center : { x: 0, y: 0 };
        const r = this.storm ? this.storm.radius * 0.7 : 500;
        const a = Math.random() * Math.PI * 2;
        this.loot.spawnSupplyDrop(c.x + Math.cos(a) * r * Math.random(), c.y + Math.sin(a) * r * Math.random());
      }
    }

    // auto pickup ammo/mats
    if (this.player.alive) this.loot.autoPickup(this.player);

    // death / spectator timer
    if (!this.player.alive && !this.mode.respawn) {
      this.deathTimer += dt;
      if (this.deathTimer > 26 && !this.finished) {
        this.finishMatch(false, { placement: this.finalPlacement || Math.max(2, this.aliveTeams() + 1) });
      }
    }

    // match time limit safety
    if (this.matchTime > 600 && !this.finished) {
      this.finishMatch(this.player.alive, { placement: this.aliveTeams() });
    }

    this.checkMatchEnd();
  }

  updateBus(dt) {
    this.bus.t += dt;
    const t = Math.min(1, this.bus.t / this.bus.duration);
    this.busObj.position.lerpVectors(this.bus.start, this.bus.end, t);
    this.busObj.lookAt(this.bus.end);
    this.player.pos.copy(this.busObj.position);
    this.busFlame.scale.y = 1 + Math.sin(this.time * 20) * 0.2;
    this.hud.setBus(true, { altitude: this.busObj.position.y, timeLeft: Math.max(0, this.bus.duration - this.bus.t) });
    for (const bot of this.botsSystem.bots) {
      if (bot.onBus && this.bus.t >= (bot.deployAt || 5)) {
        bot.onBus = false;
        bot.landing = true;
        if (bot.character && this.player.alive) bot.character.group.visible = false;
      }
    }
    if (this.input.pressed('jump') && this.bus.t > 1.4) this.deployFromBus();
    if (this.bus.t >= this.bus.duration) this.deployFromBus();
  }

  updateConsumable(dt) {
    if (!this.player.usingConsumable) return;
    if (this.player.moving && Math.hypot(this.player.vel.x, this.player.vel.z) > 2.4) {
      this.player.usingConsumable = null;
      this.hud.toast('Use cancelled');
      return;
    }
    const res = this.player.updateConsumable(dt);
    if (res === 'consumed') this.hud.toast('Used item');
  }

  handlePlayerActions(dt) {
    const input = this.input;
    const player = this.player;
    const inventoryOpen = this.hud.inventory.classList.contains('open');

    if (input.pressed('inventory')) {
      this.hud.toggleInventory();
      return;
    }
    if (inventoryOpen) return;

    if (input.pressed('emote')) {
      player.emoting = !player.emoting;
      player.emoteTime = 3;
    }

    // build toggle
    if (this.mode.building && input.pressed('build')) {
      this.buildMode = !this.buildMode;
      this.building.enabled = this.buildMode;
      this.hud.setBuildMode(this.buildMode, this.building);
      if (this.buildMode) {
        player.emoting = false;
        this.hud.toast('Build mode • 1-4 piece • 5-7 material', 1800);
      } else {
        this.building.removePreview();
      }
    }
    if (this.buildMode) {
      if (input.pressed('slot1')) this.building.setPieceType('wall');
      if (input.pressed('slot2')) this.building.setPieceType('floor');
      if (input.pressed('slot3')) this.building.setPieceType('ramp');
      if (input.pressed('slot4')) this.building.setPieceType('roof');
      if (input.keys.has('Digit5')) this.building.setMaterial('wood');
      if (input.keys.has('Digit6')) this.building.setMaterial('brick');
      if (input.keys.has('Digit7')) this.building.setMaterial('metal');
      return;
    }

    // vehicle exit / entry
    if (input.pressed('interact')) {
      if (player.vehicle) {
        this.exitVehicle();
        return;
      }
      const v = this.world.nearestVehicle(player.pos, 5);
      if (v) { this.enterVehicle(v); return; }
      if (this.loot.interact(player)) return;
    }

    // hotbar 1-5
    for (let i = 0; i < 5; i++) {
      if (input.pressed(`slot${i + 1}`)) player.selectSlot(i);
    }

    if (input.pressed('reload')) this.combat.reload(player);

    const item = player.activeItem;
    if (!item) return;

    if (item.kind === 'consumable') {
      if (input.pressed('fire') && !player.usingConsumable) {
        const cap = item.itemId === 'mini' ? 50 : 100;
        const canUse = item.itemId === 'bandage' ? player.health < 75 : true;
        if (canUse) player.useConsumable(item);
      }
      return;
    }

    if (!item.weaponId) return;
    const def = WEAPONS[item.weaponId];
    const origin = player.muzzlePosition(new THREE.Vector3());
    const dir = player.lookDirection ? player.lookDirection.clone() : new THREE.Vector3(Math.sin(player.yaw), 0, Math.cos(player.yaw));
    if (def.charge) {
      if (input.down('fire')) {
        this.bowCharge = Math.min(1, this.bowCharge + dt / (def.chargeMax || 1.1));
      } else if (this.bowCharge > 0.05) {
        this.combat.tryFire(player, origin, dir, { power: 0.35 + this.bowCharge * 0.65 });
        this.bowCharge = 0;
      }
      return;
    }
    const wantsFire = def.auto || def.slot === 'pickaxe' ? input.down('fire') : input.pressed('fire');
    if (wantsFire) {
      const fired = this.combat.tryFire(player, origin, dir, {});
      if (fired) this.input.vibrate(12);
    }
  }

  cycleSlot(dir) {
    for (let i = 1; i <= 5; i++) {
      const idx = (this.player.activeSlot + i * dir + 6) % 6;
      if (this.player.slots[idx]) { this.player.selectSlot(idx); break; }
    }
  }

  pause() {
    if (this.paused || this.finished || !this.player.alive) return;
    this.setPaused(true);
    this.ui.showPause();
  }

  resume() {
    if (!this.paused) return;
    this.ui.hideModal();
    this.setPaused(false);
  }

  enterVehicle(v) {
    this.player.vehicle = v;
    v.occupant = this.player;
    this.player.character.group.visible = false;
    this.hud.toast('Driving • E to exit');
    this.audio.ui();
  }

  exitVehicle() {
    const v = this.player.vehicle;
    if (!v) return;
    this.player.vehicle = null;
    v.occupant = null;
    this.player.pos.set(v.x + 2, v.y + 1, v.z);
    this.player.alive = true;
    this.player.character.group.visible = true;
    this.player.vel.set(0, 0, 0);
  }

  updateVehicle(dt) {
    const v = this.player.vehicle;
    const move = this.input.movement();
    this.world.updateVehicle(v, move.y, move.x, this.input.down('crouch'), dt);
    this.player.pos.set(v.x, v.y + 0.4, v.z);
    this.player.yaw = v.yaw - Math.PI;
    this.player.character.group.visible = false;
    if (this.input.pressed('interact')) this.exitVehicle();
  }

  updateSpectating(dt) {
    if (!this.spectating || !this.spectating.alive) {
      const next = this.participants.find((p) => p.alive && p !== this.player && !p.dummy);
      if (next) {
        this.spectating = next;
        this.hud.spectate(next.name);
      }
    }
  }

  updateCamera(dt) {
    if (this.paused) return;
    if (this.phase === 'bus' && this.busObj) {
      const busPos = this.busObj.position;
      const dir = this.bus.dir;
      const side = new THREE.Vector3(-dir.z, 0, dir.x);
      const camPos = busPos.clone().addScaledVector(dir, -42).addScaledVector(side, 7).add(new THREE.Vector3(0, 14, 0));
      this.camera.position.lerp(camPos, Math.min(1, dt * 3));
      const look = busPos.clone().addScaledVector(dir, 90).add(new THREE.Vector3(0, -120, 0));
      this.camera.lookAt(look);
      this.camera.fov += (70 - this.camera.fov) * Math.min(1, dt * 4);
      this.camera.updateProjectionMatrix();
      return;
    }
    if (this.player.alive) {
      this.player.updateCamera(this.camera, dt, this.world, { buildMode: this.buildMode });
    } else {
      const t = this.spectating;
      if (t) {
        const target = new THREE.Vector3(t.pos.x, t.pos.y + 2.4, t.pos.z);
        const orbit = this.time * 0.4;
        const camPos = target.clone().add(new THREE.Vector3(Math.sin(orbit) * 7, 3.4, Math.cos(orbit) * 7));
        this.camera.position.lerp(camPos, Math.min(1, dt * 4));
        this.camera.lookAt(target);
        this.camera.fov += (75 - this.camera.fov) * Math.min(1, dt * 4);
        this.camera.updateProjectionMatrix();
      } else {
        this.camera.position.y += 8 * dt;
      }
    }
  }

  updateHud(dt) {
    const nearLoot = this.player.alive && !this.buildMode ? this.loot.nearest(this.player) : null;
    let interactText = null;
    if (this.player.vehicle) interactText = 'Exit vehicle';
    else if (nearLoot) interactText = nearLoot.type === 'chest' ? 'Open container' : `Pick up ${this.loot.labelFor(nearLoot.target)}`;
    else {
      const v = this.world.nearestVehicle(this.player.pos, 5);
      if (v) interactText = 'Drive Rift Kart';
    }
    this.hud.setInteract(interactText);

    const stormInfo = this.storm ? this.storm.info() : null;
    let aliveLabel = 'Alive';
    if (this.mode.id === 'rumble') aliveLabel = 'Alive';
    this.hud.update(dt, {
      player: this.player,
      world: this.world,
      camera: this.camera,
      storm: stormInfo,
      participants: this.participants,
      mode: this.mode,
      aliveCount: this.aliveCount(),
      aliveLabel,
      teamScores: this.mode.winCondition === 'score' ? [this.teamScores[0] || 0, this.teamScores[1] || 0] : null,
      scoreTarget: this.mode.scoreTarget,
      build: this.building,
      fps: this.fps,
      spectating: this.player.alive ? null : this.spectating?.name
    });
    if (this.buildMode) this.hud.setBuildMode(true, this.building);
  }

  dispose() {
    this.audio.stopMusic();
    this.audio.setListener({ x: 0, y: 0, z: 0 });
    this.combat.dispose();
    this.building.dispose();
    this.botsSystem.dispose();
    this.loot.dispose();
    if (this.storm) this.storm.dispose();
    this.player.dispose();
    this.world.dispose();
    if (this.busObj) this.world.scene.remove(this.busObj);
    this.engine.activeScene = null;
    this.engine.activeCamera = null;
  }
}
