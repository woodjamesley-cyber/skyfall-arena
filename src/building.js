import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { MATERIALS } from './data.js';

const CELL = 4;
const WALL_H = 3.6;
const THICK = 0.28;
const COST = 10;

export const PIECE_NAMES = { wall: 'Wall', floor: 'Floor', ramp: 'Ramp', roof: 'Roof' };
const EDIT_CYCLE = {
  wall: ['full', 'window', 'door', 'half', 'corner'],
  floor: ['full', 'half'],
  ramp: ['full', 'half'],
  roof: ['full', 'half']
};

export class BuildSystem {
  constructor({ world, scene, player, audio, ui }) {
    this.world = world;
    this.scene = scene;
    this.player = player;
    this.audio = audio;
    this.ui = ui;
    this.pieces = [];
    this.occupied = new Map();
    this.pieceType = 'wall';
    this.material = 'wood';
    this.preview = null;
    this.previewKey = '';
    this.placeCooldown = 0;
    this.lastPlace = 0;
    this.selected = null;
    this.enabled = true;
    this.ghostMat = new THREE.MeshBasicMaterial({ color: '#5ce1a0', transparent: true, opacity: 0.28, depthWrite: false });
    this.ghostMatBad = new THREE.MeshBasicMaterial({ color: '#ff5d5d', transparent: true, opacity: 0.25, depthWrite: false });
    this.mats = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.85, metalness: 0.05 });
    this.pieceMatCache = new Map();
  }

  setPieceType(type) {
    if (!PIECE_NAMES[type]) return;
    this.pieceType = type;
    this.refreshPreview();
  }

  setMaterial(mat) {
    if (!MATERIALS[mat]) return;
    this.material = mat;
    this.refreshPreview();
  }

  cycleMaterial(dir = 1) {
    const keys = Object.keys(MATERIALS);
    const i = keys.indexOf(this.material);
    this.material = keys[(i + dir + keys.length) % keys.length];
    this.ui?.toast(`Material: ${MATERIALS[this.material].name}`);
  }

  materialColorFor(piece) {
    const base = new THREE.Color(MATERIALS[piece.material].color);
    if (piece.variant === 'half') base.offsetHSL(0, 0, 0.02);
    return base;
  }

  pieceMaterial(piece) {
    const key = piece.material;
    if (!this.pieceMatCache.has(key)) {
      this.pieceMatCache.set(key, new THREE.MeshStandardMaterial({
        color: MATERIALS[key].color, roughness: 0.9, metalness: key === 'metal' ? 0.45 : 0.03,
        emissive: key === 'metal' ? '#1d2b38' : '#000000', emissiveIntensity: 0.25
      }));
    }
    return this.pieceMatCache.get(key);
  }

  // ---------- placement ----------
  getPlacement() {
    const p = this.player;
    const yaw = p.yaw;
    const cardinal = Math.round(yaw / (Math.PI / 2)) * (Math.PI / 2);
    const dir = new THREE.Vector3(Math.sin(cardinal), 0, Math.cos(cardinal));
    const cx = Math.floor(p.pos.x / CELL);
    const cz = Math.floor(p.pos.z / CELL);
    const baseY = Math.round(p.pos.y * 10) / 10;
    let x, z, rot;
    if (Math.abs(dir.x) > 0.5) {
      x = (dir.x > 0 ? cx + 1 : cx) * CELL;
      z = (cz + 0.5) * CELL;
      rot = dir.x > 0 ? Math.PI / 2 : -Math.PI / 2;
    } else {
      z = (dir.z > 0 ? cz + 1 : cz) * CELL;
      x = (cx + 0.5) * CELL;
      rot = dir.z > 0 ? 0 : Math.PI;
    }
    if (this.pieceType === 'floor') {
      x = (cx + 0.5) * CELL;
      z = (cz + 0.5) * CELL;
      rot = 0;
    } else if (this.pieceType === 'roof') {
      x = (cx + 0.5) * CELL;
      z = (cz + 0.5) * CELL;
      rot = 0;
    } else if (this.pieceType === 'ramp') {
      x = (cx + 0.5) * CELL + dir.x * (CELL / 2);
      z = (cz + 0.5) * CELL + dir.z * (CELL / 2);
      rot = cardinal;
    }
    const y = baseY + (this.pieceType === 'roof' ? WALL_H : 0);
    return { type: this.pieceType, x, z, y, rot, material: this.material, variant: 'full' };
  }

  pieceKey(pl) {
    return `${pl.type}:${pl.x.toFixed(2)}:${pl.y.toFixed(2)}:${pl.z.toFixed(2)}:${pl.rot.toFixed(2)}`;
  }

  canAfford() {
    if (this.player.unlimitedMats) return true;
    return (this.player.mats[this.material] || 0) >= COST;
  }

  refreshPreview() {
    if (!this.preview) return;
    this.previewKey = '';
  }

  updatePreview() {
    const pl = this.getPlacement();
    const key = this.pieceKey(pl) + this.pieceType + this.material;
    if (key === this.previewKey) {
      this.preview.position.set(pl.x, pl.y, pl.z);
      const ok = this.canAfford() && !this.occupied.has(this.pieceKey(pl));
      this.preview.traverse((o) => { if (o.isMesh) o.material = ok ? this.ghostMat : this.ghostMatBad; });
      return;
    }
    this.previewKey = key;
    if (this.preview) {
      this.scene.remove(this.preview);
      this.preview.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
    }
    const ghost = this.makePieceObject({ ...pl, id: 'ghost' });
    ghost.children.forEach((c) => { if (c.isMesh) c.material = this.ghostMat; });
    ghost.position.set(pl.x, pl.y, pl.z);
    ghost.rotation.y = pl.rot;
    this.scene.add(ghost);
    this.preview = ghost;
  }

  removePreview() {
    if (this.preview) {
      this.scene.remove(this.preview);
      this.preview.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
      this.preview = null;
      this.previewKey = '';
    }
  }

  // ---------- geometry ----------
  boxesFor(type, variant, matColor) {
    // local space: x right, z forward, y up from the base at 0
    const boxes = [];
    const add = (x, y, z, w, h, d, rotX = 0) => boxes.push({ x, y, z, w, h, d, rotX });
    if (type === 'wall') {
      if (variant === 'full') add(0, WALL_H / 2, 0, CELL, WALL_H, THICK);
      else if (variant === 'window') {
        add(0, 0.42, 0, CELL, 0.84, THICK);
        add(0, (2.2 + WALL_H) / 2, 0, CELL, WALL_H - 2.2, THICK);
        add(-1.7, 1.52, 0, 0.6, 1.36, THICK);
        add(1.7, 1.52, 0, 0.6, 1.36, THICK);
      } else if (variant === 'door') {
        add(-1.55, WALL_H / 2, 0, 0.9, WALL_H, THICK);
        add(1.55, WALL_H / 2, 0, 0.9, WALL_H, THICK);
        add(0, (2.4 + WALL_H) / 2, 0, 2.2, WALL_H - 2.4, THICK);
      } else if (variant === 'half') {
        add(0, 0.9, 0, CELL, 1.8, THICK);
      } else if (variant === 'corner') {
        add(-1, WALL_H / 2, 0, CELL / 2, WALL_H, THICK);
        add(1, 0.5, 0, CELL / 2, 1.0, THICK);
        add(1, 1.1, 0, CELL / 2, 0.9, THICK * 0.6);
      }
    } else if (type === 'floor' || type === 'roof') {
      if (variant === 'full') add(0, -THICK / 2, 0, CELL, THICK, CELL);
      else add(0, -THICK / 2, -CELL / 4, CELL, THICK, CELL / 2);
    } else if (type === 'ramp') {
      const len = CELL + 0.6;
      const angle = Math.atan2(WALL_H, len);
      if (variant === 'full') add(0, WALL_H / 2, 0, CELL, THICK, len, angle);
      else add(0, WALL_H / 2, 0, CELL / 2, THICK, len, angle);
    }
    return boxes;
  }

  makePieceObject(piece) {
    const group = new THREE.Group();
    const boxes = this.boxesFor(piece.type, piece.variant, piece.material);
    const geos = [];
    for (const b of boxes) {
      const g = new THREE.BoxGeometry(b.w, b.h, b.d);
      if (b.rotX) g.rotateX(b.rotX);
      g.translate(b.x, b.y, b.z);
      geos.push(g);
    }
    if (geos.length) {
      const merged = mergeGeometries(geos, false);
      geos.forEach((g) => g.dispose());
      const mesh = new THREE.Mesh(merged, piece.id === 'ghost' ? this.ghostMat : this.pieceMaterial(piece));
      mesh.castShadow = piece.id !== 'ghost';
      mesh.receiveShadow = true;
      mesh.userData.pieceId = piece.id;
      group.add(mesh);
    }
    return group;
  }

  addCollidersFor(piece, group) {
    const world = this.world;
    const cols = [];
    const cos = Math.cos(piece.rot), sin = Math.sin(piece.rot);
    const toWorld = (lx, lz) => ({ x: piece.x + lx * cos + lz * sin, z: piece.z - lx * sin + lz * cos });
    if (piece.type === 'ramp') {
      const across = Math.abs(Math.sin(piece.rot)) > 0.5;
      const width = piece.variant === 'half' ? CELL / 2 : CELL;
      const c = world.addCollider(
        { x: piece.x - (across ? CELL / 2 : width / 2), y: piece.y, z: piece.z - (across ? width / 2 : CELL / 2) },
        { x: piece.x + (across ? CELL / 2 : width / 2), y: piece.y + WALL_H, z: piece.z + (across ? width / 2 : CELL / 2) },
        'ramp',
        { walkable: true, noBlock: true, axis: across ? 'x' : 'z', flip: piece.rot > Math.PI * 0.75 || piece.rot < -Math.PI * 0.75 }
      );
      c.piece = piece;
      cols.push(c);
    } else if (piece.type === 'floor' || piece.type === 'roof') {
      const halfZ = piece.variant === 'full' ? CELL / 2 : CELL / 4;
      const zc = piece.variant === 'full' ? 0 : -CELL / 4;
      const p1 = toWorld(-CELL / 2, zc - halfZ);
      const p2 = toWorld(CELL / 2, zc + halfZ);
      const c = world.addCollider(
        { x: Math.min(p1.x, p2.x), y: piece.y - THICK, z: Math.min(p1.z, p2.z) },
        { x: Math.max(p1.x, p2.x), y: piece.y, z: Math.max(p1.z, p2.z) },
        piece.type, { walkable: true, noBlock: true }
      );
      c.piece = piece;
      cols.push(c);
    } else {
      const boxes = this.boxesFor(piece.type, piece.variant, piece.material);
      for (const b of boxes) {
        const halfX = b.w / 2, halfZ = b.d / 2;
        const p1 = toWorld(-halfX, -halfZ), p2 = toWorld(halfX, halfZ);
        const p3 = toWorld(-halfX, halfZ), p4 = toWorld(halfX, -halfZ);
        const minX = Math.min(p1.x, p2.x, p3.x, p4.x), maxX = Math.max(p1.x, p2.x, p3.x, p4.x);
        const minZ = Math.min(p1.z, p2.z, p3.z, p4.z), maxZ = Math.max(p1.z, p2.z, p3.z, p4.z);
        const y0 = piece.y + (b.y - b.h / 2);
        const y1 = piece.y + (b.y + b.h / 2);
        const c = world.addCollider({ x: minX, y: y0, z: minZ }, { x: maxX, y: y1, z: maxZ }, 'wall', { walkable: true });
        c.piece = piece;
        cols.push(c);
      }
    }
    piece.colliders = cols;
  }

  place(pl, builder = this.player) {
    const mat = pl.material || this.material;
    const affordable = builder.unlimitedMats || (builder.mats?.[mat] || 0) >= COST;
    if (!affordable) {
      if (this.ui && builder === this.player) this.ui.toast(`Not enough ${MATERIALS[mat].name}`);
      return false;
    }
    const key = this.pieceKey(pl);
    if (this.occupied.has(key)) return false;
    if (!builder.unlimitedMats) builder.mats[mat] -= COST;
    const piece = {
      id: `p${Date.now()}${Math.floor(Math.random() * 999)}`, ...pl, mat,
      hp: MATERIALS[pl.material].hp, maxHp: MATERIALS[pl.material].hp,
      buildProgress: 1
    };
    const group = this.makePieceObject(piece);
    group.position.set(piece.x, piece.y, piece.z);
    group.rotation.y = piece.rot;
    this.scene.add(group);
    piece.group = group;
    this.addCollidersFor(piece, group);
    this.pieces.push(piece);
    this.occupied.set(key, piece);
    piece.key = key;
    if (this.audio) this.audio.build(piece.material);
    if (this.ui) this.ui.buildPlaced(piece, COST, this.material);
    if (this.pieces.length > 420) {
      const old = this.pieces.shift();
      this.destroyPiece(old, true);
    }
    return true;
  }

  rebuild(piece) {
    const key = piece.key;
    this.world.removeCollider(piece.colliders?.[0]);
    for (const c of piece.colliders || []) this.world.removeCollider(c);
    this.scene.remove(piece.group);
    piece.group.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
    const group = this.makePieceObject(piece);
    group.position.set(piece.x, piece.y, piece.z);
    group.rotation.y = piece.rot;
    this.scene.add(group);
    piece.group = group;
    this.addCollidersFor(piece, group);
    this.occupied.set(key, piece);
  }

  cycleEdit(piece) {
    if (!piece) return false;
    const cycle = EDIT_CYCLE[piece.type] || ['full'];
    const i = cycle.indexOf(piece.variant);
    piece.variant = cycle[(i + 1) % cycle.length];
    this.rebuild(piece);
    if (this.audio) this.audio.edit();
    if (this.ui) this.ui.toast(`Edited ${piece.type}: ${piece.variant}`);
    return true;
  }

  resetEdit(piece) {
    if (!piece || piece.variant === 'full') return false;
    piece.variant = 'full';
    piece.hp = piece.maxHp;
    this.rebuild(piece);
    if (this.audio) this.audio.edit();
    return true;
  }

  findTarget(camera, maxDist = 8) {
    const origin = camera.position.clone();
    const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion).normalize();
    const hit = this.world.raycast(origin, dir, maxDist);
    if (hit.type === 'structure' && hit.collider?.piece) return hit.collider.piece;
    // fallback: nearest piece in front of the player
    let best = null, bd = 5.5;
    const fwd = new THREE.Vector3(Math.sin(this.player.yaw), 0, Math.cos(this.player.yaw));
    for (const p of this.pieces) {
      const dx = p.x - this.player.pos.x, dz = p.z - this.player.pos.z;
      const d = Math.hypot(dx, dz);
      if (d < bd && dx * fwd.x + dz * fwd.z > 0) { bd = d; best = p; }
    }
    return best;
  }

  damagePiece(piece, amount, attacker) {
    if (!piece) return;
    piece.hp -= amount;
    if (piece.hp <= 0) {
      if (this.ui) this.ui.pieceDestroyed(piece);
      if (this.audio) this.audio.pieceBreak(piece.material);
      this.destroyPiece(piece);
    } else if (this.ui && attacker?.isPlayer) {
      this.ui.structureDamage(piece);
    }
  }

  destroyPiece(piece, silent) {
    this.scene.remove(piece.group);
    piece.group.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
    for (const c of piece.colliders || []) this.world.removeCollider(c);
    const i = this.pieces.indexOf(piece);
    if (i >= 0) this.pieces.splice(i, 1);
    if (piece.key) this.occupied.delete(piece.key);
    if (this.selected === piece) this.selected = null;
  }

  update(dt, input, options = {}) {
    if (!this.enabled) { this.removePreview(); return; }
    this.updatePreview();
    this.placeCooldown = Math.max(0, this.placeCooldown - dt);
    if (options.fireHeld && this.placeCooldown <= 0) {
      const pl = this.getPlacement();
      if (this.place(pl)) this.placeCooldown = 0.12;
    }
    if (options.editPressed) {
      const piece = this.findTarget(options.camera);
      if (piece) { this.selected = piece; this.cycleEdit(piece); }
    }
    if (options.resetPressed) {
      const piece = this.findTarget(options.camera);
      if (piece) this.resetEdit(piece);
    }
    if (options.cycleMaterial) this.cycleMaterial(options.cycleMaterial);
  }

  dispose() {
    this.removePreview();
    for (const p of [...this.pieces]) this.destroyPiece(p, true);
    this.pieces.length = 0;
    this.occupied.clear();
  }
}
