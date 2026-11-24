import * as THREE from 'three';
import { Character } from './character.js';
import { OUTLETS, WEAPONS, LOOT_WEAPONS } from './data.js';
import { rollRarity } from './weapons.js';

const NAMES = [
  'NovaStrike', 'PixelFox', 'IronVale', 'EchoRift', 'SableFang', 'DriftKing', 'NeonWolf', 'CobaltJay',
  'QuartzOwl', 'VantaLynx', 'RookBlade', 'SkyMoth', 'GlitchHawk', 'EmberRook', 'TundraVex', 'ZephyrOne',
  'RiftWalker', 'BlueMantis', 'StormCrow', 'HexMarrow', 'FrostByte', 'LumenAxe', 'GrimPetal', 'OrbitDash',
  'SlateWing', 'PyroFinch', 'MonoGhost', 'AzureDrift', 'CinderFox', 'VoidKite', 'MossRanger', 'SolarHusk',
  'NightCap', 'RapidArc', 'DuneRook', 'PulseWave', 'ThornVale', 'OnyxHare', 'CoralBlade', 'StaticOwl',
  'AmberLynx', 'CopperMoth', 'SilverFang', 'TurboSlate', 'WispRunner', 'RuneBadger', 'NeonKoi', 'GlassComet'
];

const BOT_AMMO = { light: 300, medium: 300, heavy: 90, shells: 60, rockets: 12, arrows: 60 };
const AMMO_OF = { ar: 'medium', burst: 'medium', smg: 'light', shotgun: 'shells', sniper: 'heavy', dmr: 'heavy', lmg: 'medium', pistol: 'light', rocket: 'rockets', bow: 'arrows' };

export class Bot {
  constructor(opts) {
    this.name = opts.name;
    this.team = opts.team;
    this.skill = opts.skill ?? 0.6;
    this.isPlayer = false;
    this.height = 1.8;
    this.radius = 0.42;
    this.alive = true;
    this.health = 100;
    this.shield = opts.shield ?? 0;
    this.maxHealth = 100;
    this.maxShield = 100;
    this.pos = new THREE.Vector3(opts.x, opts.y, opts.z);
    this.yaw = Math.random() * Math.PI * 2;
    this.aiming = true;
    this.moving = false;
    this.character = null;
    this.palette = opts.palette;
    this.kills = 0;
    this.slot = 0;
    this.mats = { wood: 200, brick: 0, metal: 0 };
    this.ammo = { ...BOT_AMMO };
    this.activeSlot = 0;
    this.state = 'roam';
    this.target = null;
    this.wander = { x: opts.x, z: opts.z };
    this.nextThink = 0;
    this.buildCooldown = 0;
    this.burstTimer = 0;
    this.shotsLeft = 0;
    this.landing = opts.landing || false;
    this.unlimitedMats = false;
    const id = LOOT_WEAPONS[Math.floor(Math.random() * LOOT_WEAPONS.length)];
    this.slots = [{ kind: 'weapon', weaponId: id, rarity: rollRarity(), mag: WEAPONS[id].mag || 1 }];
    this._charPending = false;
    this.zoneTarget = new THREE.Vector2(opts.x, opts.z);
  }

  get activeItem() { return this.slots[0]; }
  get weaponDef() { return WEAPONS[this.activeItem?.weaponId] || null; }
  get eye() { return new THREE.Vector3(this.pos.x, this.pos.y + 1.55, this.pos.z); }

  ensureCharacter(world) {
    if (this.character) return;
    this.character = new Character(this.palette);
    this.character.group.position.copy(this.pos);
    this.character.setHealthRatio(this.health / 100);
    world.scene.add(this.character.group);
    this.character.setWeapon(this.activeItem.weaponId, { common: '#b8c0c9', uncommon: '#5ad15a', rare: '#4aa8ff', epic: '#b96bff', legendary: '#ffa63d', mythic: '#ffd84d' }[this.activeItem.rarity]);
    this.character.update(0.016, { speed: 0, crouching: false, sliding: false, gliding: false, aiming: true, firing: false });
  }

  takeDamage(amount, opts = {}) {
    if (!this.alive) return { died: false };
    let dmg = amount;
    if (this.shield > 0) {
      const abs = Math.min(this.shield, dmg);
      this.shield -= abs;
      dmg -= abs;
    }
    this.health -= dmg;
    const now = performance.now() / 1000;
    if (this.onDamaged) this.onDamaged(this, opts.source);
    this.lastHit = now;
    this.wantBuild = true;
    if (this.health <= 0) {
      this.health = 0;
      this.alive = false;
      if (this.character) {
        this.character.group.visible = false;
        this.character.setHealthRatio(0);
      }
      return { died: true };
    }
    if (this.character) this.character.setHealthRatio(this.health / 100);
    return { died: false };
  }

  heal(n) { this.health = Math.min(100, this.health + n); }

  addMats(kind, amount) { this.mats[kind] = (this.mats[kind] || 0) + amount; }
  addAmmo() { /* bots carry plenty */ }
  addRecoil() { /* bots have no recoil */ }

  moveToward(tx, tz, speed, dt, world) {
    const dx = tx - this.pos.x, dz = tz - this.pos.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.6) return;
    const nx = dx / dist, nz = dz / dist;
    this.pos.x += nx * speed * dt;
    this.pos.z += nz * speed * dt;
    this.yaw = Math.atan2(nx, nz);
    world.collide(this.pos, this.radius, this.pos.y + 0.1, this.height - 0.2);
    const support = world.supportHeight(this.pos.x, this.pos.z, this.pos.y + 1.4);
    if (support.height > this.pos.y + 0.05 && support.height < this.pos.y + 1.6) {
      this.pos.y = support.height;
    } else {
      this.pos.y += (support.height - this.pos.y) * Math.min(1, dt * 8);
    }
    this.moving = true;
  }

  hasLineOfSight(target, world) {
    const from = this.eye;
    const to = new THREE.Vector3(target.pos.x, target.pos.y + 1.1, target.pos.z);
    const dir = to.clone().sub(from);
    const dist = dir.length();
    dir.normalize();
    const hit = world.raycast(from, dir, dist - 0.4);
    return !hit.point || hit.distance >= dist - 0.6;
  }

  update(dt, ctx) {
    if (!this.alive) return;
    const { world, combat, storm, building, mode, player, participants } = ctx;
    const now = performance.now() / 1000;
    this.buildCooldown = Math.max(0, this.buildCooldown - dt);
    const toPlayer = Math.hypot(player.pos.x - this.pos.x, player.pos.z - this.pos.z);
    const renderDist = 190;
    if (toPlayer < renderDist) this.ensureCharacter(world);
    if (this.character) {
      const visible = toPlayer < (mode.arena ? 400 : renderDist);
      this.character.group.visible = visible;
      this.character.group.position.copy(this.pos);
      this.character.group.rotation.y = this.yaw;
    }
    if (mode.arena) this.zoneTarget.set(0, 0);

    // choose a target: player or a nearby enemy
    if (now > this.nextThink) {
      this.nextThink = now + 0.6 + Math.random() * 0.5;
      this.target = null;
      let best = 1e9;
      if (player.alive && player.team !== this.team) {
        const d = toPlayer;
        if (d < (mode.arena ? 220 : 95) && d < best) {
          // notice the player more readily when close and in front
          if (d < 45 || Math.random() < 0.75) { this.target = player; best = d; }
        }
      }
      for (const p of participants) {
        if (!p.alive || p === this || p.team === this.team || p.isPlayer) continue;
        const d = Math.hypot(p.pos.x - this.pos.x, p.pos.z - this.pos.z);
        if (d < best && d < 70) { best = d; this.target = p; }
      }
      // storm priority
      let target = null;
      if (storm?.active && Math.hypot(this.pos.x - storm.center.x, this.pos.z - storm.center.y) > storm.radius * 0.85) {
        target = { x: storm.center.x, z: storm.center.y };
      } else if (this.target) {
        target = { x: this.target.pos.x, z: this.target.pos.z };
      } else {
        // wander / drift toward zone
        if (!this.wander || Math.hypot(this.wander.x - this.pos.x, this.wander.z - this.pos.z) < 4) {
          const a = Math.random() * Math.PI * 2;
          const r = 20 + Math.random() * 60;
          this.wander = { x: this.pos.x + Math.cos(a) * r, z: this.pos.z + Math.sin(a) * r };
          if (storm?.active) this.wander = { x: storm.center.x + (Math.random() - 0.5) * storm.radius, z: storm.center.y + (Math.random() - 0.5) * storm.radius };
        }
        target = this.wander;
      }
      this.moveTarget = target;
    }

    const target = this.target;
    const engaged = target && target.alive;
    let speed = engaged ? 3.2 : 5.0;
    if (toPlayer > 140 && !mode.arena) speed = 4.2;

    if (engaged) {
      const d = Math.hypot(target.pos.x - this.pos.x, target.pos.z - this.pos.z);
      const los = this.hasLineOfSight(target, world);
      this.aiming = true;
      const desiredYaw = Math.atan2(target.pos.x - this.pos.x, target.pos.z - this.pos.z);
      let diff = desiredYaw - this.yaw;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      this.yaw += THREE.MathUtils.clamp(diff, -dt * 5.5, dt * 5.5);
      if (los && d < (mode.arena ? 200 : 85)) {
        if (d > 12) this.moveToward(target.pos.x, target.pos.z, speed, dt, world);
        else {
          // strafe around the target
          const side = Math.sin(now * 1.7 + this.skill * 10) > 0 ? 1 : -1;
          const sx = Math.cos(this.yaw) * side, sz = -Math.sin(this.yaw) * side;
          this.pos.x += sx * 2.4 * dt;
          this.pos.z += sz * 2.4 * dt;
          world.collide(this.pos, this.radius, this.pos.y + 0.1, this.height - 0.2);
          const support = world.supportHeight(this.pos.x, this.pos.z, this.pos.y + 1.4);
          this.pos.y += (support.height - this.pos.y) * Math.min(1, dt * 8);
          this.moving = true;
        }
        this.shoot(dt, ctx, d, los);
      } else if (!los) {
        if (this.moveTarget) this.moveToward(this.moveTarget.x, this.moveTarget.z, speed, dt, world);
        else this.moving = false;
      }
    } else {
      const t = this.moveTarget || this.wander;
      if (t) this.moveToward(t.x, t.z, speed, dt, world);
      this.moving = false;
    }

    // cover building when damaged
    if (this.wantBuild && mode.building && building && this.buildCooldown <= 0 && this.health < 92) {
      this.wantBuild = false;
      this.buildCooldown = 3.5;
      if (Math.random() < 0.55) {
        const cx = Math.floor(this.pos.x / 4), cz = Math.floor(this.pos.z / 4);
        const dirZ = Math.cos(this.yaw) > 0 ? 1 : -1;
        const pl = { type: 'wall', x: (cx + 0.5) * 4, z: dirZ > 0 ? (cz + 1) * 4 : cz * 4, y: Math.round(this.pos.y * 10) / 10, rot: dirZ > 0 ? 0 : Math.PI, material: 'wood', variant: 'full' };
        building.place(pl, this);
      }
    }
    if (this.character) {
      this.character.group.position.copy(this.pos);
      this.character.group.rotation.y = this.yaw;
      this.character.update(dt, {
        speed: this.moving ? 5 : 0,
        crouching: false, sliding: false, gliding: this.landing,
        aiming: this.aiming, firing: this.burstTimer > 0, pickaxeSwing: false, emoting: false
      });
      if (toPlayer < 60) this.character.setHealthRatio((this.health + this.shield) / 200);
      else if (this.character.healthBar) this.character.healthBar.group.visible = false;
    }
    this.landing = false;
  }

  shoot(dt, ctx, dist, los) {
    const { combat } = ctx;
    const weapon = this.weaponDef;
    if (!weapon) return;
    const now = performance.now() / 1000;
    if (this.burstTimer > 0) {
      this.burstTimer -= dt;
      return;
    }
    const rateChance = weapon.auto ? 0.75 : 0.4;
    if (Math.random() > rateChance) return;
    const from = this.eye;
    const aim = new THREE.Vector3(
      ctx.player.pos.x + (Math.random() - 0.5) * 0.5,
      ctx.player.pos.y + 1.1 + (Math.random() - 0.5) * 0.4,
      ctx.player.pos.z + (Math.random() - 0.5) * 0.5
    );
    if (this.target !== ctx.player) aim.set(this.target.pos.x, this.target.pos.y + 1.1, this.target.pos.z);
    const dir = aim.sub(from).normalize();
    const distanceFactor = 1 + dist / 18;
    const accuracy = 0.6 + this.skill * 0.8;
    const extraSpread = Math.max(0.25, distanceFactor * (1.45 - this.skill) * 0.9);
    const fired = combat.tryFire(this, from, dir, { extraSpread });
    if (fired) {
      this.burstTimer = (weapon.auto ? 0.28 : 0.5) + Math.random() * 0.35 / Math.max(0.3, accuracy);
    }
  }
}

export class BotsSystem {
  constructor({ world, mode, combat, building, loot, ui }) {
    this.world = world;
    this.mode = mode;
    this.combat = combat;
    this.building = building;
    this.loot = loot;
    this.ui = ui;
    this.bots = [];
    this.onEliminated = null;
    this.abstractTimer = 0;
    this.difficulty = mode.difficulty ?? 1;
  }

  spawnBots(count, playerTeam, spawnPoints) {
    const teams = this.mode.teams;
    const teamSize = this.mode.teamSize;
    const names = [...NAMES].sort(() => Math.random() - 0.5);
    for (let i = 0; i < count; i++) {
      const sp = spawnPoints[i % spawnPoints.length];
      const jitterX = (Math.random() - 0.5) * 26;
      const jitterZ = (Math.random() - 0.5) * 26;
      const x = sp.x + jitterX, z = sp.z + jitterZ;
      // team assignment: fill teams except the player's
      let team;
      if (this.mode.winCondition === 'sandbox') team = 0;
      else {
        // the player fills one slot on team 0; teammates then fill the rest of team 0
        const teammatesNeeded = teamSize - 1;
        if (i < teammatesNeeded) team = playerTeam;
        else team = 1 + ((i - teammatesNeeded) % Math.max(1, teams - 1));
      }
      const palette = { ...OUTLETS[Math.floor(Math.random() * OUTLETS.length)].palette };
      palette.shirt = palette.shirt;
      const skill = Math.min(1.6, (0.35 + Math.random() * 0.7) * this.difficulty);
      const bot = new Bot({
        name: names[i % names.length] + (i > names.length ? `_${i}` : ''),
        team, skill, x, z, y: this.world.groundHeight(x, z) + 0.2, palette,
        landing: !!this.mode.bus, shield: Math.random() < 0.3 ? 25 : 0
      });
      bot.zoneTarget.set(x, z);
      this.bots.push(bot);
      this.combat.participants.push(bot);
    }
    return this.bots;
  }

  get alive() { return this.bots.filter((b) => b.alive); }

  update(dt, ctx) {
    const player = ctx.player;
    ctx.participants = this.combat.participants;
    for (const bot of this.bots) {
      if (!bot.alive) continue;
      const toPlayer = Math.hypot(bot.pos.x - player.pos.x, bot.pos.z - player.pos.z);
      if (toPlayer < 320 || this.mode.arena) {
        bot.update(dt, ctx);
      } else {
        // far-away bots: cheap zone rotation, no render cost
        if (bot.character) bot.character.group.visible = false;
        this.updateFarBot(bot, dt, ctx);
      }
    }
    this.abstractTimer -= dt;
    if (this.abstractTimer <= 0) {
      this.abstractTimer = 1.4;
      this.simulateAbstractCombat(player);
    }
  }

  updateFarBot(bot, dt, ctx) {
    const storm = ctx.storm;
    let tx = bot.wander?.x ?? bot.pos.x, tz = bot.wander?.z ?? bot.pos.z;
    if (storm?.active) {
      const d = Math.hypot(bot.pos.x - storm.center.x, bot.pos.z - storm.center.y);
      if (d > storm.radius * 0.6) {
        tx = storm.center.x + (Math.random() - 0.5) * storm.radius * 0.5;
        tz = storm.center.y + (Math.random() - 0.5) * storm.radius * 0.5;
        bot.wander = { x: tx, z: tz };
      }
    }
    const dx = tx - bot.pos.x, dz = tz - bot.pos.z;
    const d = Math.hypot(dx, dz);
    if (d > 1) {
      const speed = this.mode.arena ? 3 : 2.6;
      bot.pos.x += (dx / d) * speed * dt;
      bot.pos.z += (dz / d) * speed * dt;
      bot.yaw = Math.atan2(dx, dz);
    }
    bot.pos.y = this.world.groundHeight(bot.pos.x, bot.pos.z) + 0.1;
    if (storm?.active) {
      const outside = Math.hypot(bot.pos.x - storm.center.x, bot.pos.z - storm.center.y) > storm.radius;
      if (outside) {
        bot.health -= storm.damage * dt * 0.55;
        if (bot.health <= 0) {
          bot.health = 0;
          bot.alive = false;
          if (this.onEliminated) this.onEliminated(bot, null, { storm: true });
        }
      }
    }
  }

  simulateAbstractCombat(player) {
    const candidates = this.bots.filter((b) => b.alive && Math.hypot(b.pos.x - player.pos.x, b.pos.z - player.pos.z) > 200);
    if (candidates.length < 2) return;
    let fights = 0;
    for (let i = 0; i < candidates.length && fights < 3; i++) {
      const a = candidates[(Math.random() * candidates.length) | 0];
      const b = candidates[(Math.random() * candidates.length) | 0];
      if (!a || !b || a === b || a.team === b.team) continue;
      if (Math.hypot(a.pos.x - b.pos.x, a.pos.z - b.pos.z) > 90) continue;
      fights++;
      const aWins = Math.random() < 0.5 + (a.skill - b.skill) * 0.25;
      const loser = aWins ? b : a;
      const winner = aWins ? a : b;
      const dmg = 35 + Math.random() * 70;
      const res = loser.takeDamage(dmg);
      if (res.died) {
        winner.kills++;
        if (this.onEliminated) this.onEliminated(loser, winner, { abstract: true });
      } else if (this.loot) {
        // no-op: loot drops happen on elimination
      }
    }
  }

  dispose() {
    for (const b of this.bots) {
      if (b.character) {
        this.world.scene.remove(b.character.group);
        b.character.dispose();
      }
    }
    this.bots.length = 0;
  }
}
