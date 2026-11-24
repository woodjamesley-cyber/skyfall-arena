import * as THREE from 'three';
import { WEAPONS, rarityById } from './data.js';

const UP = new THREE.Vector3(0, 1, 0);
const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3();

// Server-style combat resolver for the local match: hitscan, projectiles, splash.
export class CombatSystem {
  constructor({ world, scene, audio, ui, building }) {
    this.world = world;
    this.scene = scene;
    this.audio = audio;
    this.ui = ui;
    this.building = building;
    this.participants = [];
    this.projectiles = [];
    this.effects = [];
    this.states = new WeakMap();
    this.onKill = null;
    this.onDamage = null;
    this.player = null;
    this.tempVec = new THREE.Vector3();
    this.initPools();
  }

  setParticipants(list) {
    this.participants = list;
  }

  state(shooter) {
    let s = this.states.get(shooter);
    if (!s) {
      s = { nextShot: 0, reloadEnd: 0, reloading: false, burstLeft: 0, burstNext: 0, lastShot: -99, swing: 0, triggerPrev: false };
      this.states.set(shooter, s);
    }
    return s;
  }

  initPools() {
    this.tracerMat = new THREE.LineBasicMaterial({ color: '#ffe9a8', transparent: true, opacity: 0.85 });
    this.flashGeo = new THREE.SphereGeometry(0.12, 6, 5);
    this.flashMat = new THREE.MeshBasicMaterial({ color: '#ffdf8a' });
  }

  // ---------- helpers ----------
  spreadDir(dir, spread, rand = Math.random) {
    const d = dir.clone();
    const a = rand() * Math.PI * 2;
    const r = Math.sqrt(rand()) * spread;
    const right = new THREE.Vector3().crossVectors(d, UP).normalize();
    const up = new THREE.Vector3().crossVectors(right, d).normalize();
    return d.addScaledVector(right, Math.cos(a) * r).addScaledVector(up, Math.sin(a) * r).normalize();
  }

  segmentHit(origin, dir, maxDist, target) {
    // capsule-ish test: body cylinder + head sphere
    if (!target.alive) return null;
    const feet = target.pos;
    const headY = feet.y + (target.height || 1.8) - 0.25;
    const bodyTop = feet.y + 1.5;
    const radius = (target.radius || 0.42) + 0.12;
    const ox = origin.x, oy = origin.y, oz = origin.z;
    const dx = dir.x, dy = dir.y, dz = dir.z;
    const sx = feet.x, sy = feet.y + 0.55, sz = feet.z;
    const seg = _v1.set(0, bodyTop - sy, 0);
    const segLenSq = seg.lengthSq();
    const wx = ox - sx, wy = oy - sy, wz = oz - sz;
    const b = wx * dx + wy * dy + wz * dz;
    const c = wx * wx + wy * wy + wz * wz - radius * radius;
    const a = 1;
    let bodyT = -1;
    if (c <= 0) bodyT = 0;
    else {
      const disc = b * b - a * c;
      if (disc >= 0) {
        const t = (-b - Math.sqrt(disc)) / a;
        if (t >= 0) {
          const py = oy + dy * t;
          if (py >= sy - 0.1 && py <= sy + seg.y + 0.1) bodyT = t;
        }
      }
    }
    // head sphere
    const hsx = feet.x, hsy = headY, hsz = feet.z;
    const hx = ox - hsx, hy = oy - hsy, hz = oz - hsz;
    const hb = hx * dx + hy * dy + hz * dz;
    const hc = hx * hx + hy * hy + hz * hz - 0.26 * 0.26;
    let headT = -1;
    const hdisc = hb * hb - hc;
    if (hdisc >= 0) {
      const t = -hb - Math.sqrt(hdisc);
      if (t >= 0) headT = t;
    }
    let t = -1, headshot = false;
    if (bodyT >= 0 && headT >= 0) { if (headT < bodyT) { t = headT; headshot = true; } else t = bodyT; }
    else if (headT >= 0) { t = headT; headshot = true; }
    else if (bodyT >= 0) t = bodyT;
    if (t < 0 || t > maxDist) return null;
    return { t, headshot, target };
  }

  hitscan(origin, dir, range, shooter, opts = {}) {
    let worldHit = this.world.raycast(origin, dir, range);
    let best = null;
    for (const p of this.participants) {
      if (p === shooter || !p.alive) continue;
      if (p.team === shooter.team && p.team !== null && !opts.friendlyFire) continue;
      const hit = this.segmentHit(origin, dir, range, p);
      if (!hit) continue;
      if (!best || hit.t < best.t) best = hit;
    }
    if (best && (!worldHit.point || best.t < worldHit.distance)) {
      return { type: 'player', t: best.t, target: best.target, headshot: best.headshot, point: origin.clone().addScaledVector(dir, best.t) };
    }
    return { ...worldHit, type: worldHit.type, t: worldHit.distance };
  }

  // ---------- firing ----------
  tryFire(shooter, origin, dir, opts = {}) {
    const item = shooter.activeItem;
    if (!item || item.kind !== 'weapon') return false;
    const weapon = WEAPONS[item.weaponId];
    if (!weapon) return false;
    const st = this.state(shooter);
    const now = performance.now() / 1000;
    if (now < st.nextShot || st.reloading) return false;
    if (item.weaponId === 'harvester') {
      this.melee(shooter, origin, dir, weapon);
      st.nextShot = now + 60 / weapon.rpm;
      return true;
    }
    const mag = item.mag ?? weapon.mag ?? 1;
    const power = weapon.charge ? THREE.MathUtils.clamp(opts.power ?? 1, 0.35, 1) : 1;
    if (mag <= 0) {
      if (!st.reloading) this.reload(shooter);
      return false;
    }
    const rarity = rarityById(item.rarity);
    const dmgMult = rarity.mult;
    const spread = (shooter.aiming ? weapon.adsSpread : weapon.spread) * (shooter.moving ? 1.6 : 1) * (opts.extraSpread || 1);
    const pellets = weapon.pellets || 1;
    item.mag -= 1;
    st.lastShot = now;
    st.nextShot = now + 60 / weapon.rpm;
    if (shooter.addRecoil) shooter.addRecoil(weapon.recoil * (shooter.aiming ? 0.65 : 1), (Math.random() - 0.5) * weapon.recoil * 0.4);
    if (this.audio) this.audio.shoot(weapon.id, origin);
    this.muzzleFlash(origin, dir);
    for (let i = 0; i < pellets; i++) {
      const d = pellets > 1 ? this.spreadDir(dir, spread) : this.spreadDir(dir, spread);
      if (weapon.projectileType === 'rocket') {
        this.spawnProjectile(shooter, origin, d, weapon, 'rocket', 46, weapon.damage * dmgMult, 0.02);
        continue;
      }
      if (weapon.projectileType === 'arrow') {
        this.spawnProjectile(shooter, origin, d, weapon, 'arrow', 68 * power, weapon.damage * dmgMult * power, 0.22);
        continue;
      }
      const hit = this.hitscan(origin, d, weapon.range, shooter);
      this.tracer(origin, hit.point || origin.clone().addScaledVector(d, weapon.range), weapon.id);
      if (hit.type === 'player') {
        let dmg = weapon.damage * dmgMult * power * (hit.headshot ? weapon.headshot : 1);
        if (weapon.falloff) dmg *= Math.max(0.35, 1 - (hit.t / weapon.range) * weapon.falloff);
        this.applyPlayerDamage(hit.target, dmg, shooter, { headshot: hit.headshot, weapon });
        this.impact(hit.point, '#ff6b6b', 6);
      } else if (hit.type === 'structure' || hit.type === 'terrain') {
        this.impact(hit.point, hit.type === 'terrain' ? '#d9cba6' : '#c8c2b6', 5, hit.normal);
        this.damageStructureAt(hit, weapon.damage * dmgMult * 2.4, shooter);
      }
    }
    if (item.mag <= 0 && shooter.autoReload !== false) this.reload(shooter);
    return true;
  }

  melee(shooter, origin, dir, weapon) {
    const st = this.state(shooter);
    const hit = this.hitscan(origin, dir, 3.4, shooter);
    if (this.audio) this.audio.swing();
    st.swing = 0.3;
    if (hit.type === 'player') {
      this.applyPlayerDamage(hit.target, weapon.damage, shooter, { headshot: false, weapon });
      this.impact(hit.point, '#ffd166', 5);
      return;
    }
    if (hit.type === 'structure') {
      this.damageStructureAt(hit, 55, shooter);
      this.impact(hit.point, '#e8d7a6', 4, hit.normal);
    }
    if (this.world.harvest) {
      const res = this.world.harvest(hit.point || origin, 34);
      if (res && res.mats && shooter.addMats) {
        for (const [k, v] of Object.entries(res.mats)) shooter.addMats(k, v);
        if (this.ui && shooter.isPlayer) this.ui.addMats(res.mats, res.pos);
      }
      if (this.audio && res) this.audio.chop(res.type);
    }
  }

  reload(shooter) {
    const item = shooter.activeItem;
    if (!item || item.kind !== 'weapon') return;
    const weapon = WEAPONS[item.weaponId];
    if (!weapon || weapon.slot === 'pickaxe') return;
    const st = this.state(shooter);
    if (st.reloading) return;
    const reserve = weapon.ammo ? (shooter.ammo?.[weapon.ammo] || 0) : 0;
    const magSize = weapon.mag || 1;
    if ((item.mag ?? 0) >= magSize || reserve <= 0) return;
    st.reloading = true;
    st.reloadEnd = performance.now() / 1000 + weapon.reload;
    st.reloadWeapon = weapon;
    if (this.audio) this.audio.reload();
  }

  updateShooterTimers(dt) {
    const now = performance.now() / 1000;
    for (const p of this.participants) {
      const st = this.states.get(p);
      if (!st) continue;
      if (st.reloading && now >= st.reloadEnd) {
        const item = p.activeItem;
        const weapon = st.reloadWeapon;
        if (item && weapon && item.weaponId === weapon.id) {
          const need = (weapon.mag || 1) - (item.mag || 0);
          const avail = Math.min(need, p.ammo?.[weapon.ammo] ?? need);
          item.mag = (item.mag || 0) + avail;
          if (p.ammo && weapon.ammo) p.ammo[weapon.ammo] = Math.max(0, (p.ammo[weapon.ammo] || 0) - avail);
        }
        st.reloading = false;
      }
    }
  }

  // ---------- damage ----------
  applyPlayerDamage(target, amount, shooter, opts = {}) {
    if (!target.alive) return;
    if (target.team !== null && target.team === shooter.team && target !== shooter) return;
    const rounded = Math.round(amount);
    const res = target.takeDamage(rounded, { headshot: opts.headshot });
    if (this.onDamage) this.onDamage(target, rounded, shooter, opts.headshot);
    if (this.ui) {
      if (target.isPlayer) this.ui.damageTaken(rounded, shooter, opts.headshot);
      else if (shooter.isPlayer) this.ui.hitmarker(opts.headshot, rounded);
    }
    if (this.audio) this.audio.hit(opts.headshot);
    if (res.died) {
      target.alive = false;
      target.character.group.visible = false;
      if (this.onKill) this.onKill(target, shooter, { headshot: opts.headshot, weapon: opts.weapon });
    }
  }

  explode(pos, radius, damage, owner, weaponName = 'Explosion') {
    if (this.audio) this.audio.explosion(pos);
    this.explosionEffect(pos, radius);
    for (const p of this.participants) {
      if (!p.alive || p === owner) continue;
      if (p.team !== null && p.team === owner.team) continue;
      const dx = p.pos.x - pos.x, dz = p.pos.z - pos.z, dy = p.pos.y + 0.9 - pos.y;
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (dist > radius) continue;
      const falloff = 1 - dist / radius;
      this.applyPlayerDamage(p, damage * (0.4 + falloff * 0.6), owner, { weapon: { name: weaponName }, headshot: false, explosive: true });
    }
    // structures
    const near = this.world.queryColliders(pos.x, pos.z, radius + 2);
    for (const c of near) {
      if (!c.piece) continue;
      const cx = (c.minX + c.maxX) / 2, cz = (c.minZ + c.maxZ) / 2, cy = (c.minY + c.maxY) / 2;
      const dist = Math.hypot(cx - pos.x, cy - pos.y, cz - pos.z);
      if (dist < radius + 2) this.damageStructureAt({ collider: c }, damage * 2.2, owner);
    }
  }

  damageStructureAt(hit, amount, shooter) {
    if (hit.type && hit.type !== 'structure') return;
    const c = hit.collider;
    if (!c || !c.piece) return;
    if (this.building) this.building.damagePiece(c.piece, amount, shooter);
  }

  spawnProjectile(shooter, origin, dir, weapon, kind, speed, damage, gravScale = 0.0) {
    const mesh = kind === 'rocket'
      ? new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 0.6, 8), new THREE.MeshBasicMaterial({ color: '#ffd166' }))
      : new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.7, 5), new THREE.MeshBasicMaterial({ color: '#e8f0f6' }));
    mesh.position.copy(origin);
    mesh.lookAt(origin.clone().add(dir));
    mesh.rotateX(Math.PI / 2);
    this.scene.add(mesh);
    this.projectiles.push({ mesh, dir: dir.clone(), speed, damage, owner: shooter, weapon, kind, life: 6, grav: gravScale, origin: origin.clone() });
  }

  // ---------- effects ----------
  tracer(from, to, weaponId) {
    const geo = new THREE.BufferGeometry().setFromPoints([from.clone(), to.clone()]);
    const mat = this.tracerMat.clone();
    mat.opacity = weaponId === 'sniper' ? 0.95 : 0.55;
    const line = new THREE.Line(geo, mat);
    this.scene.add(line);
    this.effects.push({ mesh: line, life: 0.09, max: 0.09, type: 'fade' });
  }

  muzzleFlash(pos, dir) {
    const m = new THREE.Mesh(this.flashGeo, this.flashMat);
    m.position.copy(pos).addScaledVector(dir, 0.3);
    m.scale.setScalar(1.4);
    this.scene.add(m);
    this.effects.push({ mesh: m, life: 0.05, max: 0.05, type: 'scale' });
  }

  impact(pos, color, count = 5, normal) {
    const geo = new THREE.BufferGeometry();
    const arr = new Float32Array(count * 3);
    const velocities = [];
    for (let i = 0; i < count; i++) {
      arr[i * 3] = pos.x; arr[i * 3 + 1] = pos.y; arr[i * 3 + 2] = pos.z;
      velocities.push(new THREE.Vector3((Math.random() - 0.5) * 3, Math.random() * 3, (Math.random() - 0.5) * 3).add(normal ? normal.clone().multiplyScalar(2) : new THREE.Vector3()));
    }
    geo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
    const pts = new THREE.Points(geo, new THREE.PointsMaterial({ color, size: 0.12, transparent: true, opacity: 1 }));
    this.scene.add(pts);
    this.effects.push({ mesh: pts, life: 0.35, max: 0.35, type: 'spark', velocities, positions: arr });
  }

  explosionEffect(pos, radius) {
    const ring = new THREE.Mesh(
      new THREE.SphereGeometry(1, 16, 12),
      new THREE.MeshBasicMaterial({ color: '#ff9a3c', transparent: true, opacity: 0.55 })
    );
    ring.position.copy(pos);
    this.scene.add(ring);
    this.effects.push({ mesh: ring, life: 0.45, max: 0.45, type: 'explode', radius });
    const light = new THREE.PointLight('#ff9a3c', 30, radius * 3);
    light.position.copy(pos);
    this.scene.add(light);
    this.effects.push({ mesh: light, life: 0.22, max: 0.22, type: 'light' });
    this.impact(pos, '#ffb347', 18);
  }

  update(dt) {
    this.updateShooterTimers(dt);
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.life -= dt;
      p.speed -= (p.kind === 'arrow' ? 7 : 0) * dt;
      p.dir.y -= p.grav * dt;
      const step = p.speed * dt;
      const next = p.mesh.position.clone().addScaledVector(p.dir, step);
      // collision along the step
      const sub = next.clone().sub(p.mesh.position);
      const len = sub.length();
      const dir = sub.normalize();
      const wh = this.world.raycast(p.mesh.position, dir, len);
      let hit = null;
      let bestT = wh.point ? wh.distance : len;
      for (const part of this.participants) {
        if (!part.alive || part === p.owner) continue;
        if (part.team !== null && part.team === p.owner.team) continue;
        const h = this.segmentHit(p.mesh.position, dir, bestT, part);
        if (h) { bestT = h.t; hit = { type: 'player', target: part, headshot: h.headshot, point: p.mesh.position.clone().addScaledVector(dir, h.t) }; }
      }
      if (hit) {
        if (p.kind === 'rocket') this.explode(hit.point, 5.5, p.damage, p.owner, 'Thumper');
        else this.applyPlayerDamage(hit.target, p.damage, p.owner, { headshot: hit.headshot, weapon: p.weapon });
        this.impact(hit.point, '#ffd166', 6);
        this.removeProjectile(i);
        continue;
      }
      if (wh.point && wh.distance <= len) {
        if (p.kind === 'rocket') this.explode(wh.point, 5.5, p.damage, p.owner, 'Thumper');
        else this.damageStructureAt(wh, p.damage, p.owner);
        this.impact(wh.point, '#d9cba6', 5, wh.normal);
        this.removeProjectile(i);
        continue;
      }
      p.mesh.position.copy(next);
      p.mesh.lookAt(next.clone().add(p.dir));
      p.mesh.rotateX(Math.PI / 2);
      if (p.life <= 0) this.removeProjectile(i);
    }
    for (let i = this.effects.length - 1; i >= 0; i--) {
      const e = this.effects[i];
      e.life -= dt;
      const t = Math.max(0, e.life / e.max);
      if (e.type === 'fade') e.mesh.material.opacity = t * 0.8;
      else if (e.type === 'scale') e.mesh.scale.setScalar(1.4 - t * 1.2);
      else if (e.type === 'explode') {
        const s = 1 + (1 - t) * e.radius;
        e.mesh.scale.setScalar(s);
        e.mesh.material.opacity = t * 0.5;
      } else if (e.type === 'spark') {
        const pos = e.positions;
        for (let k = 0; k < e.velocities.length; k++) {
          const v = e.velocities[k];
          pos[k * 3] += v.x * dt; pos[k * 3 + 1] += v.y * dt; pos[k * 3 + 2] += v.z * dt;
          v.y -= 9 * dt;
        }
        e.mesh.geometry.attributes.position.needsUpdate = true;
        e.mesh.material.opacity = t;
      } else if (e.type === 'light') e.mesh.intensity = 30 * t;
      if (e.life <= 0) {
        this.scene.remove(e.mesh);
        if (e.mesh.geometry) e.mesh.geometry.dispose();
        if (e.mesh.material) e.mesh.material.dispose();
        this.effects.splice(i, 1);
      }
    }
  }

  removeProjectile(i) {
    const p = this.projectiles[i];
    this.scene.remove(p.mesh);
    p.mesh.geometry.dispose();
    p.mesh.material.dispose();
    this.projectiles.splice(i, 1);
  }

  dispose() {
    for (let i = this.projectiles.length - 1; i >= 0; i--) this.removeProjectile(i);
    for (const e of this.effects) {
      this.scene.remove(e.mesh);
      if (e.mesh.geometry) e.mesh.geometry.dispose();
      if (e.mesh.material) e.mesh.material.dispose();
    }
    this.effects.length = 0;
  }
}

export function rollRarity(luck = 1) {
  const table = [
    ['common', 40], ['uncommon', 26], ['rare', 18], ['epic', 9], ['legendary', 5], ['mythic', 2 * luck]
  ];
  const total = table.reduce((a, b) => a + b[1], 0);
  let r = Math.random() * total;
  for (const [id, w] of table) { r -= w; if (r <= 0) return id; }
  return 'common';
}
