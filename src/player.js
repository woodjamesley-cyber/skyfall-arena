import * as THREE from 'three';
import { Character } from './character.js';
import { WEAPONS, MATERIALS } from './data.js';
import { settings } from './settings.js';

const GRAVITY = 24;
const WALK = 5.7, SPRINT = 8.6, CROUCH_SPEED = 2.7, ADS_SPEED = 3.4, SWIM = 3.4;

export class Player {
  constructor(opts) {
    this.world = opts.world;
    this.name = opts.name || 'Player';
    this.team = opts.team ?? 0;
    this.isPlayer = opts.isPlayer !== false;
    this.palette = opts.palette;
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.yaw = 0;
    this.pitch = 0;
    this.onGround = false;
    this.crouching = false;
    this.sliding = false;
    this.slideTime = 0;
    this.sprinting = false;
    this.swimming = false;
    this.gliding = false;
    this.alive = true;
    this.health = 100;
    this.shield = 0;
    this.maxHealth = 100;
    this.maxShield = 100;
    this.radius = 0.42;
    this.height = 1.8;
    this.eyeHeight = 1.58;
    this.vehicle = null;
    this.emoting = false;
    this.emoteTime = 0;
    this.usingConsumable = null;
    this.useTimer = 0;
    this.aiming = false;
    this.recoilPitch = 0;
    this.recoilYaw = 0;
    this.autoGlide = false;
    this.moving = false;
    this.cameraShake = 0;
    this.lastDamageTime = -99;
    this.kills = 0;
    this.damageDealt = 0;
    this.mats = { wood: 0, brick: 0, metal: 0 };
    this.unlimitedMats = !!opts.unlimitedMats;
    this.ammo = { light: 0, medium: 0, heavy: 0, shells: 0, rockets: 0, arrows: 0 };
    this.slots = [{ kind: 'weapon', weaponId: 'harvester', rarity: 'uncommon', mag: 0 }, null, null, null, null, null];
    this.activeSlot = 0;
    this.character = new Character(this.palette, { isPlayer: this.isPlayer });
    this.world.scene.add(this.character.group);
    this.stepTimer = 0;
    this.landTimer = 0;
    this.glideAnim = 0;
    if (this.unlimitedMats) this.mats = { wood: Infinity, brick: Infinity, metal: Infinity };
  }

  get forward() {
    return new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
  }
  get right() {
    return new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
  }
  get eye() {
    return new THREE.Vector3(this.pos.x, this.pos.y + this.eyeHeight, this.pos.z);
  }
  get activeItem() { return this.slots[this.activeSlot]; }
  get weaponDef() {
    const item = this.activeItem;
    if (!item || item.kind !== 'weapon') return null;
    return WEAPONS[item.weaponId];
  }

  spawn(x, z, y) {
    this.pos.set(x, y ?? this.world.groundHeight(x, z) + 0.2, z);
    this.vel.set(0, 0, 0);
    this.alive = true;
    this.health = 100;
    this.shield = 0;
    this.onGround = false;
    this.character.group.position.copy(this.pos);
    this.character.group.visible = true;
  }

  addItem(item) {
    for (let i = 0; i < this.slots.length; i++) {
      const s = this.slots[i];
      if (s && s.kind === 'consumable' && item.kind === 'consumable' && s.itemId === item.itemId) {
        s.count += item.count;
        return { slot: i, merged: true };
      }
    }
    for (let i = 0; i < this.slots.length; i++) {
      if (!this.slots[i]) {
        this.slots[i] = item;
        if (i > 0) this.activeSlot = i;
        return { slot: i, merged: false };
      }
    }
    return null;
  }

  addAmmo(type, amount) {
    if (!type) return;
    this.ammo[type] = (this.ammo[type] || 0) + amount;
  }

  addMats(kind, amount) {
    if (this.unlimitedMats) return;
    this.mats[kind] = (this.mats[kind] || 0) + amount;
  }

  selectSlot(i) {
    if (i < 0 || i >= this.slots.length) return;
    if (i === this.activeSlot) return;
    this.activeSlot = i;
    this.usingConsumable = null;
    const item = this.slots[i];
    if (item && item.kind === 'weapon') this.character.setWeapon(item.weaponId, this.rarityColor(item));
  }

  rarityColor(item) {
    const colors = { common: '#b8c0c9', uncommon: '#5ad15a', rare: '#4aa8ff', epic: '#b96bff', legendary: '#ffa63d', mythic: '#ffd84d' };
    return colors[item?.rarity] || '#b8c0c9';
  }

  syncWeaponModel() {
    const item = this.activeItem;
    if (!item) return;
    if (item.kind === 'weapon') this.character.setWeapon(item.weaponId, this.rarityColor(item));
    else if (item.kind === 'consumable') this.character.setWeapon('grenade', '#7fe6ff');
  }

  takeDamage(amount, opts = {}) {
    if (!this.alive) return { died: false, absorbed: 0 };
    let dmg = amount;
    let absorbed = 0;
    if (this.shield > 0) {
      absorbed = Math.min(this.shield, dmg);
      this.shield -= absorbed;
      dmg -= absorbed;
    }
    this.health -= dmg;
    this.lastDamageTime = performance.now() / 1000;
    this.cameraShake = Math.min(0.5, this.cameraShake + amount * 0.006);
    if (this.health <= 0) {
      this.health = 0;
      this.alive = false;
      this.character.group.visible = false;
      return { died: true, absorbed, overkill: -this.health };
    }
    return { died: false, absorbed };
  }

  heal(amount, cap = 100) {
    const before = this.health;
    this.health = Math.min(cap, this.health + amount);
    return this.health - before;
  }

  addShield(amount, cap = 100) {
    const before = this.shield;
    this.shield = Math.min(cap, this.shield + amount);
    return this.shield - before;
  }

  useConsumable(item, complete) {
    const def = { bandage: { heal: 15, cap: 75, time: 3.2 }, medkit: { heal: 100, cap: 100, time: 7 }, mini: { shield: 25, cap: 50, time: 2 }, bigshield: { shield: 50, cap: 100, time: 4 }, fish: { heal: 30, shield: 30, cap: 100, time: 2.5 } }[item.itemId];
    if (!def) return;
    this.usingConsumable = { item, def, t: 0 };
  }

  updateConsumable(dt) {
    if (!this.usingConsumable) return null;
    const u = this.usingConsumable;
    u.t += dt;
    this.character.parts.armL.rotation.x = -1.1 + Math.sin(u.t * 4) * 0.05;
    if (u.t >= u.def.time) {
      if (u.def.heal) this.heal(u.def.heal, u.def.cap);
      if (u.def.shield) this.addShield(u.def.shield, u.def.cap);
      u.item.count--;
      if (u.item.count <= 0) this.slots[this.activeSlot] = null;
      this.usingConsumable = null;
      return 'consumed';
    }
    return 'using';
  }

  // ---------------- movement ----------------
  update(dt, input, ctx = {}) {
    if (!this.alive) {
      this.character.group.visible = false;
      return;
    }
    if (this.vehicle) {
      this.pos.set(this.vehicle.x, this.vehicle.y + 0.6, this.vehicle.z);
      this.yaw = this.vehicle.yaw + Math.PI;
      this.character.group.visible = false;
      return;
    }
    this.character.group.visible = true;

    // ---- look ----
    if (input) {
      const sens = settings.sensitivity;
      const scoped = this.aiming && (this.weaponDef?.scope || 0) > 1 ? sens.scoped : 1;
      const k = (input.usingTouch ? sens.touch : sens.mouse) * scoped;
      if (input.pointerLocked || input.usingTouch) {
        this.yaw -= input.lookDX * k;
        this.pitch -= input.lookDY * k * (settings.invertY ? -1 : 1);
      }
      this.pitch = THREE.MathUtils.clamp(this.pitch, -1.25, 1.2);
      this.yaw = ((this.yaw + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
    }

    // ---- recoil recovery ----
    this.recoilPitch *= Math.pow(0.02, dt);
    this.recoilYaw *= Math.pow(0.02, dt);

    const move = input ? input.movement() : { x: 0, y: 0 };
    this.aiming = !!(input && input.down('aim')) && !this.usingConsumable && !!this.weaponDef && this.weaponDef.id !== 'harvester' && this.weaponDef.id !== 'grenade';
    const wantedSprint = !!(input && input.down('sprint')) && move.y > 0.2 && !this.aiming && !this.crouching;
    const wantedCrouch = !!(input && input.down('crouch'));

    if (settings.toggleCrouch && input && input.pressed('crouch')) this.crouching = !this.crouching;
    else if (!settings.toggleCrouch) this.crouching = wantedCrouch && this.onGround && !this.sliding;

    this.sprinting = settings.toggleSprint ? (this.sprinting || wantedSprint) : wantedSprint;
    if (!wantedSprint && !settings.toggleSprint) this.sprinting = false;

    // sliding
    if (this.sprinting && input && input.pressed('crouch') && this.onGround && !this.sliding) {
      this.sliding = true;
      this.slideTime = 0.85;
      this.vel.x = this.forward.x * 11.5;
      this.vel.z = this.forward.z * 11.5;
      this.crouching = true;
    }
    if (this.sliding) {
      this.slideTime -= dt;
      if (this.slideTime <= 0 || !this.onGround) this.sliding = false;
    }

    const wasGround = this.onGround;
    const waterY = this.world.waterLevel;
    const groundBelow = this.world.heightAt(this.pos.x, this.pos.z);
    this.swimming = this.pos.y + 0.5 < waterY && groundBelow < waterY - 0.6;

    let speed = WALK;
    if (this.crouching) speed = CROUCH_SPEED;
    if (this.sprinting && !this.crouching) speed = SPRINT;
    if (this.aiming) speed = Math.min(speed, ADS_SPEED);
    if (this.swimming) speed = SWIM;
    if (this.usingConsumable) speed = Math.min(speed, 2.6);

    const dirX = Math.sin(this.yaw) * move.y + Math.cos(this.yaw) * move.x;
    const dirZ = Math.cos(this.yaw) * move.y - Math.sin(this.yaw) * move.x;
    let tvx = dirX * speed, tvz = dirZ * speed;
    if (this.sliding) {
      const f = Math.pow(0.35, dt);
      tvx = this.vel.x * f;
      tvz = this.vel.z * f;
    }
    const accel = this.onGround ? 14 : this.gliding ? 3.5 : 4.5;
    this.vel.x += (tvx - this.vel.x) * Math.min(1, accel * dt);
    this.vel.z += (tvz - this.vel.z) * Math.min(1, accel * dt);

    // vertical
    if (this.swimming) {
      this.vel.y += ((waterY - 0.6) - this.pos.y) * 8 * dt;
      this.vel.y *= 0.9;
      this.gliding = false;
    } else {
      const glideRequested = (input && (input.down('jump') || this.autoGlide)) && !this.onGround && this.vel.y < 0.5 && this.pos.y - groundBelow > 6;
      this.gliding = this.gliding ? (this.pos.y - groundBelow > 1.6 && !this.onGround && (input?.down('jump') || this.autoGlide)) : glideRequested;
      if (this.gliding) {
        this.vel.y += (-9 - this.vel.y) * Math.min(1, 6 * dt);
      } else {
        this.vel.y -= GRAVITY * dt;
      }
      this.vel.y = Math.max(this.vel.y, -55);
    }

    if (input && input.pressed('jump') && this.onGround && !this.swimming && !this.sliding) {
      this.vel.y = 7.6;
      this.onGround = false;
    }

    // integrate
    const prevY = this.pos.y;
    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;
    this.pos.y += this.vel.y * dt;

    const bound = 830;
    this.pos.x = THREE.MathUtils.clamp(this.pos.x, -bound, bound);
    this.pos.z = THREE.MathUtils.clamp(this.pos.z, -bound, bound);

    const support = this.world.supportHeight(this.pos.x, this.pos.z, this.pos.y + 0.9);
    const groundY = this.swimming ? -999 : support.height;
    if (this.pos.y <= groundY) {
      if (!wasGround && this.vel.y < -17) {
        const dmg = Math.min(90, Math.floor((-this.vel.y - 17) * 4.2));
        if (dmg > 0) this.takeDamage(dmg, { fall: true });
        this.landTimer = 0.22;
      }
      this.pos.y = groundY;
      this.vel.y = 0;
      this.onGround = true;
      this.gliding = false;
      this.autoGlide = false;
    } else {
      this.onGround = false;
    }

    // horizontal collision + mantle
    const before = this.pos.clone();
    this.world.collide(this.pos, this.radius, this.pos.y + 0.1, this.height - 0.2);
    if (before.distanceToSquared(this.pos) > 1e-6 && this.onGround) {
      // try a small step-up / mantle onto nearby ledges
      const ahead = new THREE.Vector3(this.pos.x + this.forward.x * 0.75, this.pos.y, this.pos.z + this.forward.z * 0.75);
      const aheadSupport = this.world.supportHeight(ahead.x, ahead.z, this.pos.y + 1.7);
      if (aheadSupport.height - this.pos.y > 0.35 && aheadSupport.height - this.pos.y < 1.7) {
        this.pos.copy(ahead);
        this.pos.y = aheadSupport.height + 0.02;
      }
    }

    // footsteps
    if (this.onGround && Math.hypot(this.vel.x, this.vel.z) > 2) {
      this.stepTimer -= dt;
      if (this.stepTimer <= 0) {
        this.stepTimer = this.sprinting ? 0.32 : 0.45;
        if (ctx.audio) ctx.audio.footstep(this.swimming);
      }
    }

    this.moving = Math.hypot(this.vel.x, this.vel.z) > 1.2;
    this.syncWeaponModel();
    this.character.group.position.copy(this.pos);
    this.character.group.rotation.y = this.yaw;
    this.character.setHealthRatio(0);
    this.character.update(dt, {
      speed: Math.hypot(this.vel.x, this.vel.z),
      crouching: this.crouching,
      sliding: this.sliding,
      gliding: this.gliding,
      aiming: this.aiming,
      firing: ctx.firing || false,
      pickaxeSwing: ctx.pickaxeSwing || false,
      emoting: this.emoting,
      lookYaw: 0
    });
    if (this.emoting) {
      this.emoteTime -= dt;
      if (this.emoteTime <= 0) this.emoting = false;
    }
    this.landTimer = Math.max(0, this.landTimer - dt);
  }

  cameraTarget(out = new THREE.Vector3()) {
    return out.set(this.pos.x, this.pos.y + this.eyeHeight + (this.sliding || this.crouching ? -0.5 : 0), this.pos.z);
  }

  updateCamera(camera, dt, world, opts = {}) {
    const target = this.cameraTarget(new THREE.Vector3());
    const dist = opts.buildMode ? 4.4 : this.aiming ? 1.35 : this.sliding ? 3.6 : 3.1;
    const shoulder = this.aiming ? 0.55 : 0.7;
    const viewYaw = this.yaw + this.recoilYaw;
    const pitch = THREE.MathUtils.clamp(this.pitch + this.recoilPitch, -1.4, 1.35);
    const dir = new THREE.Vector3(
      Math.sin(viewYaw) * Math.cos(pitch),
      Math.sin(pitch),
      Math.cos(viewYaw) * Math.cos(pitch)
    );
    const right = new THREE.Vector3(Math.cos(viewYaw), 0, -Math.sin(viewYaw));
    const desired = target.clone()
      .addScaledVector(dir, -dist)
      .addScaledVector(right, shoulder)
      .add(new THREE.Vector3(0, 0.35, 0));
    // camera collision
    const toCam = desired.clone().sub(target);
    const length = toCam.length();
    toCam.normalize();
    const hit = world.raycast(target, toCam, length);
    if (hit.point && hit.distance < length) desired.copy(target).addScaledVector(toCam, Math.max(0.35, hit.distance - 0.2));
    if (this.cameraShake > 0.001) {
      desired.x += (Math.random() - 0.5) * this.cameraShake;
      desired.y += (Math.random() - 0.5) * this.cameraShake;
      desired.z += (Math.random() - 0.5) * this.cameraShake;
      this.cameraShake *= Math.pow(0.02, dt);
    }
    camera.position.lerp(desired, Math.min(1, dt * 18));
    const lookAt = target.clone().addScaledVector(dir, 12);
    camera.lookAt(lookAt);
    const baseFov = settings.fov;
    const scopeZoom = this.aiming && (this.weaponDef?.scope || 0) > 1 ? this.weaponDef.scope : 1;
    const targetFov = baseFov / (this.aiming ? Math.min(1.35, scopeZoom * 0.55) : 1);
    camera.fov += (targetFov - camera.fov) * Math.min(1, dt * 10);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
    this.lookDirection = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion).normalize();
    return this.lookDirection;
  }

  addRecoil(pitchKick, yawKick) {
    this.recoilPitch = Math.min(0.32, this.recoilPitch + pitchKick * 0.0045);
    this.recoilYaw += yawKick * 0.004;
  }

  muzzlePosition(out = new THREE.Vector3()) {
    const dir = this.lookDirection || new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    return out.copy(this.pos)
      .add(new THREE.Vector3(0, this.eyeHeight - 0.1, 0))
      .addScaledVector(dir, 0.65)
      .addScaledVector(right, 0.28);
  }

  dispose() {
    this.world.scene.remove(this.character.group);
    this.character.dispose();
  }
}
