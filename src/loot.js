import * as THREE from 'three';
import { WEAPONS, LOOT_WEAPONS, CONSUMABLES, MATERIALS, AMMO, rarityById } from './data.js';
import { rollRarity } from './weapons.js';

const AMMO_FOR = { ar: 'medium', burst: 'medium', smg: 'light', shotgun: 'shells', sniper: 'heavy', dmr: 'heavy', lmg: 'medium', pistol: 'light', rocket: 'rockets', bow: 'arrows' };
const WEAPON_BY_AMMO = { light: ['smg', 'pistol'], medium: ['ar', 'burst', 'lmg'], heavy: ['sniper', 'dmr'], shells: ['shotgun'], rockets: ['rocket'], arrows: ['bow'] };

export class LootSystem {
  constructor({ world, scene, combat, audio, ui, mode }) {
    this.world = world;
    this.scene = scene;
    this.combat = combat;
    this.audio = audio;
    this.ui = ui;
    this.mode = mode;
    this.pickups = [];
    this.chests = [];
    this.drops = [];
    this.highlighted = null;
    this.maxLoot = 170;
    this.meshes = new Map();
    this.buildTemplates();
  }

  buildTemplates() {
    this.crateTex = null;
    this.beamGeo = new THREE.CylinderGeometry(0.22, 0.22, 6, 8, 1, true);
    this.baseGeo = new THREE.CylinderGeometry(0.55, 0.6, 0.08, 10);
  }

  rarityBeam(color) {
    const m = new THREE.Mesh(this.beamGeo, new THREE.MeshBasicMaterial({
      color, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending
    }));
    m.position.y = 3;
    return m;
  }

  makePickupMesh(item) {
    const group = new THREE.Group();
    const base = new THREE.Mesh(this.baseGeo, new THREE.MeshStandardMaterial({ color: '#2d3742', roughness: 0.8, metalness: 0.4 }));
    base.position.y = 0.04;
    group.add(base);
    if (item.kind === 'weapon') {
      const rar = rarityById(item.rarity);
      const def = WEAPONS[item.weaponId];
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.16, 0.85), new THREE.MeshStandardMaterial({ color: rar.color, emissive: rar.color, emissiveIntensity: 0.35, roughness: 0.4, metalness: 0.5 }));
      body.position.y = 0.55;
      group.add(body);
      if (def.id !== 'harvester') {
        const grip = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.24, 0.12), new THREE.MeshStandardMaterial({ color: '#20262e' }));
        grip.position.set(0, 0.42, -0.1);
        group.add(grip);
      }
      group.add(this.rarityBeam(rar.color));
    } else if (item.kind === 'ammo') {
      const col = AMMO[item.ammoType]?.color || '#ffd166';
      const box = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.26, 0.24), new THREE.MeshStandardMaterial({ color: '#3b4652', roughness: 0.6, metalness: 0.4 }));
      box.position.y = 0.3;
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.06, 0.26), new THREE.MeshBasicMaterial({ color: col }));
      stripe.position.y = 0.34;
      group.add(box, stripe);
    } else if (item.kind === 'consumable') {
      const color = item.itemId === 'medkit' ? '#ff6b6b' : item.itemId === 'bandage' ? '#f4f4f4' : item.itemId === 'fish' ? '#7fe6ff' : '#4aa8ff';
      const bottle = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.18, 0.42, 8), new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.3, roughness: 0.3 }));
      bottle.position.y = 0.36;
      group.add(bottle);
    } else if (item.kind === 'mats') {
      const color = MATERIALS[item.material].color;
      for (let i = 0; i < 3; i++) {
        const plank = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.08, 0.3), new THREE.MeshStandardMaterial({ color, roughness: 0.95 }));
        plank.position.set(0, 0.12 + i * 0.09, 0);
        plank.rotation.y = i * 0.3;
        group.add(plank);
      }
    }
    return group;
  }

  makeChest(kind = 'normal') {
    const group = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: kind === 'supply' ? '#4a6c9c' : '#6b4a2f', roughness: 0.7, metalness: 0.3 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.6, 0.7), mat);
    body.position.y = 0.3;
    body.castShadow = true;
    const lid = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.26, 0.76), new THREE.MeshStandardMaterial({ color: '#8a6238', roughness: 0.6, metalness: 0.35 }));
    lid.position.set(0, 0.7, -0.02);
    lid.geometry.translate(0, 0, 0.38);
    lid.position.z = -0.38;
    const glow = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.06, 0.8), new THREE.MeshBasicMaterial({ color: '#ffd166' }));
    glow.position.y = 0.62;
    const beam = this.rarityBeam(kind === 'supply' ? '#7fe6ff' : '#ffd166');
    beam.position.y = 3;
    group.add(body, lid, glow, beam);
    group.userData.lid = lid;
    return group;
  }

  spawnFromSpots(spots) {
    const floors = spots.filter((s) => s.tier === 'floor');
    const chestSpots = spots.filter((s) => s.tier === 'chest');
    const maxFloor = this.mode?.practice ? 60 : 110;
    const maxChest = this.mode?.practice ? 4 : 48;
    for (let i = 0; i < Math.min(maxFloor, floors.length); i++) {
      const s = floors[i];
      const r = Math.random();
      if (r < 0.44) this.spawnWeapon(s.x, s.y, s.z);
      else if (r < 0.62) this.spawnAmmo(s.x, s.y, s.z, s.y + 0.1);
      else if (r < 0.78) this.spawnConsumable(s.x, s.y, s.z);
      else this.spawnMats(s.x, s.y, s.z, 2);
    }
    for (let i = 0; i < Math.min(maxChest, chestSpots.length); i++) {
      const s = chestSpots[i];
      this.spawnChest(new THREE.Vector3(s.x, s.y, s.z));
    }
    // guarantee a starter weapon near the player's likely landing area is handled by game.
  }

  spawnWeapon(x, y, z, rarity, weaponId) {
    const id = weaponId || LOOT_WEAPONS[Math.floor(Math.random() * LOOT_WEAPONS.length)];
    const rar = rarity || rollRarity();
    const item = { kind: 'weapon', weaponId: id, rarity: rar, mag: WEAPONS[id].mag || 1 };
    return this.spawn(item, new THREE.Vector3(x, y, z));
  }

  spawnAmmo(x, y, z, forceType) {
    const type = forceType || Object.keys(AMMO)[Math.floor(Math.random() * 4)];
    const amount = type === 'shells' ? 12 : type === 'rockets' ? 2 : 30;
    return this.spawn({ kind: 'ammo', ammoType: type, amount }, new THREE.Vector3(x, y, z));
  }

  spawnConsumable(x, y, z, itemId) {
    const ids = ['bandage', 'mini', 'medkit', 'bigshield', 'fish'];
    const id = itemId || ids[Math.floor(Math.random() * ids.length)];
    return this.spawn({ kind: 'consumable', itemId: id, count: id === 'bandage' ? 5 : 1 }, new THREE.Vector3(x, y, z));
  }

  spawnMats(x, y, z, amount = 30, material) {
    const m = material || ['wood', 'brick', 'metal'][Math.floor(Math.random() * 3)];
    return this.spawn({ kind: 'mats', material: m, amount }, new THREE.Vector3(x, y, z));
  }

  spawn(item, pos, opts = {}) {
    if (this.pickups.length >= this.maxLoot) {
      const old = this.pickups.shift();
      this.removePickupMesh(old);
    }
    const group = this.makePickupMesh(item);
    const support = this.world.supportHeight(pos.x, pos.z, pos.y + 1);
    const y = opts.fixedY ?? support.height;
    group.position.set(pos.x, y, pos.z);
    this.scene.add(group);
    const pickup = { item, group, x: pos.x, y, z: pos.z, pos: new THREE.Vector3(pos.x, y, pos.z), createdAt: performance.now(), supply: !!opts.supply };
    this.pickups.push(pickup);
    return pickup;
  }

  spawnChest(pos) {
    if (this.chests.length > 60) return null;
    const group = this.makeChest();
    const support = this.world.supportHeight(pos.x, pos.z, pos.y + 2);
    group.position.set(pos.x, support.height, pos.z);
    this.scene.add(group);
    const chest = { group, pos: new THREE.Vector3(pos.x, support.height, pos.z), opened: false, kind: 'normal' };
    this.chests.push(chest);
    return chest;
  }

  openChest(chest) {
    if (chest.opened) return;
    chest.opened = true;
    const lid = chest.group.userData.lid;
    if (lid) lid.rotation.x = -1.15;
    if (this.audio) this.audio.chest();
    const p = chest.pos;
    const rar = rollRarity(1.4);
    this.spawnWeapon(p.x + 0.6, p.y, p.z, rar);
    const ammoType = this.mode?.arena ? 'medium' : 'light';
    this.spawnAmmo(p.x - 0.7, p.y, p.z, ammoType);
    if (Math.random() > 0.35) this.spawnConsumable(p.x, p.y, p.z + 0.7);
    this.spawnMats(p.x, p.y, p.z - 0.7, 30, 'wood');
    setTimeout(() => {
      if (chest.group.parent) this.scene.remove(chest.group);
      const i = this.chests.indexOf(chest);
      if (i >= 0) this.chests.splice(i, 1);
    }, 1200);
    if (this.ui) this.ui.toast('Chest opened');
  }

  // A supply drop that falls from the sky.
  spawnSupplyDrop(x, z) {
    const group = this.makeChest('supply');
    const ground = this.world.supportHeight(x, z, 200).height;
    group.position.set(x, 180, z);
    this.scene.add(group);
    const balloon = new THREE.Mesh(
      new THREE.SphereGeometry(1.6, 12, 8),
      new THREE.MeshStandardMaterial({ color: '#7fe6ff', emissive: '#2aa8d8', emissiveIntensity: 0.4, transparent: true, opacity: 0.85 })
    );
    balloon.position.y = 3;
    group.add(balloon);
    const drop = { group, x, z, y: 180, targetY: ground, opened: false, kind: 'supply' };
    this.drops.push(drop);
    if (this.ui) this.ui.toast('Supply drop inbound');
    return drop;
  }

  update(dt) {
    const t = performance.now() * 0.001;
    for (const p of this.pickups) {
      p.group.position.y = p.y + Math.sin(t * 2 + p.x) * 0.06 + 0.05;
      p.group.rotation.y += dt * 0.8;
    }
    for (const c of this.chests) {
      if (c.opened) continue;
      c.group.rotation.y = Math.sin(t * 0.8 + c.pos.x) * 0.06;
    }
    for (let i = this.drops.length - 1; i >= 0; i--) {
      const d = this.drops[i];
      if (d.y > d.targetY) {
        d.y = Math.max(d.targetY, d.y - dt * 6.5);
        d.group.position.y = d.y;
      }
      if (d.y <= d.targetY + 0.1 && !d.landed) {
        d.landed = true;
        d.group.children.forEach((c) => { if (c.geometry?.type === 'SphereGeometry') c.visible = false; });
      }
    }
  }

  nearest(player, maxDist = 3.4) {
    let best = null, bd = maxDist, bestType = null;
    const px = player.pos.x, pz = player.pos.z;
    for (const p of this.pickups) {
      const d = Math.hypot(p.x - px, p.z - pz);
      if (d < bd) { bd = d; best = p; bestType = 'pickup'; }
    }
    for (const c of this.chests) {
      if (c.opened) continue;
      const d = Math.hypot(c.pos.x - px, c.pos.z - pz);
      if (d < bd + 0.6) { bd = d; best = c; bestType = 'chest'; }
    }
    for (const d of this.drops) {
      if (d.opened) continue;
      const dd = Math.hypot(d.x - px, d.z - pz);
      if (dd < bd + 1) { bd = dd; best = d; bestType = 'chest'; }
    }
    return best ? { target: best, type: bestType, distance: bd } : null;
  }

  interact(player) {
    const near = this.nearest(player);
    if (!near) return false;
    if (near.type === 'chest') {
      if (near.target.opened) return false;
      if (near.target.kind === 'supply') {
        near.target.opened = true;
        if (this.audio) this.audio.chest();
        const p = near.target.group.position;
        this.spawnWeapon(p.x, p.y, p.z + 1, 'legendary');
        this.spawnWeapon(p.x + 1, p.y, p.z - 0.5, 'epic');
        this.spawnConsumable(p.x - 1, p.y, p.z, 'bigshield');
        this.spawnAmmo(p.x, p.y, p.z - 1, 'heavy');
        this.spawnMats(p.x, p.y, p.z + 1.6, 60, 'metal');
        this.scene.remove(near.target.group);
        const i = this.drops.indexOf(near.target);
        if (i >= 0) this.drops.splice(i, 1);
        if (this.ui) this.ui.toast('Supply drop looted');
        return true;
      }
      this.openChest(near.target);
      return true;
    }
    return this.pickupItem(player, near.target);
  }

  pickupItem(player, pickup) {
    const item = pickup.item;
    if (item.kind === 'weapon') {
      const res = player.addItem({ ...item });
      if (!res) {
        // swap active weapon
        const old = player.slots[player.activeSlot];
        if (old && old.weaponId === 'harvester') return false;
        player.slots[player.activeSlot] = { ...item };
        if (old) this.spawn(old, new THREE.Vector3(player.pos.x + 1, player.pos.y, player.pos.z), { fixedY: player.pos.y });
        this.removePickup(pickup);
        if (this.ui) this.ui.toast(`Equipped ${WEAPONS[item.weaponId].name}`);
        player.syncWeaponModel();
        return true;
      }
      const magSize = WEAPONS[item.weaponId].mag || 1;
      player.addAmmo(WEAPON_BY_AMMO[WEAPONS[item.weaponId].ammo]?.[0] ? WEAPONS[item.weaponId].ammo : undefined, Math.ceil(magSize * 1.5));
      if (this.ui) this.ui.toast(`Picked up ${rarityById(item.rarity).name} ${WEAPONS[item.weaponId].name}`);
      this.removePickup(pickup);
      player.syncWeaponModel();
      return true;
    }
    if (item.kind === 'ammo') {
      player.addAmmo(item.ammoType, item.amount);
      if (this.ui) this.ui.toast(`+${item.amount} ${AMMO[item.ammoType].name} ammo`);
      this.removePickup(pickup);
      return true;
    }
    if (item.kind === 'consumable') {
      const res = player.addItem({ ...item });
      if (!res) return false;
      if (this.ui) this.ui.toast(`Picked up ${CONSUMABLES[item.itemId].name}`);
      this.removePickup(pickup);
      return true;
    }
    if (item.kind === 'mats') {
      player.addMats(item.material, item.amount);
      if (this.ui) this.ui.addMats({ [item.material]: item.amount }, pickup.pos);
      this.removePickup(pickup);
      return true;
    }
    return false;
  }

  autoPickup(player) {
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const p = this.pickups[i];
      if (p.item.kind !== 'mats' && p.item.kind !== 'ammo') continue;
      const d = Math.hypot(p.x - player.pos.x, p.z - player.pos.z);
      if (d < 2.2) this.pickupItem(player, p);
    }
  }

  dropItem(item, pos) {
    this.spawn(item, pos.clone(), { fixedY: pos.y + 0.2 });
  }

  removePickup(pickup) {
    this.scene.remove(pickup.group);
    this.removePickupMesh(pickup);
    const i = this.pickups.indexOf(pickup);
    if (i >= 0) this.pickups.splice(i, 1);
  }

  removePickupMesh(pickup) {
    pickup.group.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose());
    });
  }

  labelFor(pickup) {
    const item = pickup.item;
    if (item.kind === 'weapon') return `${rarityById(item.rarity).name} ${WEAPONS[item.weaponId].name}`;
    if (item.kind === 'ammo') return `${AMMO[item.ammoType].name} Ammo (${item.amount})`;
    if (item.kind === 'consumable') return `${CONSUMABLES[item.itemId].name} x${item.count}`;
    if (item.kind === 'mats') return `${MATERIALS[item.material].name} x${item.amount}`;
    return 'Item';
  }

  dispose() {
    for (const p of this.pickups) this.removePickupMesh(p);
    for (const c of this.chests) if (c.group.parent) this.scene.remove(c.group);
    for (const d of this.drops) if (d.group.parent) this.scene.remove(d.group);
    this.pickups.length = 0;
    this.chests.length = 0;
    this.drops.length = 0;
  }
}
