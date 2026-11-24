import * as THREE from 'three';

const mat = (color, opts = {}) => new THREE.MeshStandardMaterial({
  color, roughness: opts.rough ?? 0.72, metalness: opts.metal ?? 0.05,
  emissive: opts.emissive || '#000000', emissiveIntensity: opts.emissiveIntensity || 0,
  flatShading: true
});

function box(w, h, d, color, opts) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color, opts));
  m.castShadow = true;
  return m;
}

// Original, fully procedural humanoid. Pivot at the feet, faces +Z.
export class Character {
  constructor(palette, opts = {}) {
    this.palette = palette;
    this.isPlayer = !!opts.isPlayer;
    this.group = new THREE.Group();
    this.parts = {};
    this.time = Math.random() * 10;
    this.build();
    if (!this.isPlayer) this.buildHealthBar();
  }

  build() {
    const p = this.palette;
    const g = this.group;

    const hips = new THREE.Group();
    hips.position.y = 0.92;
    g.add(hips);
    this.parts.hips = hips;

    const torso = box(0.6, 0.66, 0.34, p.shirt);
    torso.position.y = 0.33;
    hips.add(torso);
    this.parts.torso = torso;

    const chestPlate = box(0.5, 0.3, 0.38, p.accent, { metal: 0.35, rough: 0.45 });
    chestPlate.position.set(0, 0.42, 0.01);
    hips.add(chestPlate);

    const backpack = box(0.42, 0.5, 0.22, p.pants, { rough: 0.85 });
    backpack.position.set(0, 0.36, -0.27);
    hips.add(backpack);

    const belt = box(0.64, 0.12, 0.38, p.pants);
    belt.position.y = 0.02;
    hips.add(belt);

    const headGroup = new THREE.Group();
    headGroup.position.y = 0.78;
    hips.add(headGroup);
    this.parts.headGroup = headGroup;
    const head = box(0.32, 0.34, 0.32, p.skin);
    head.position.y = 0.13;
    headGroup.add(head);
    const helmet = box(0.36, 0.18, 0.36, p.accent, { metal: 0.4, rough: 0.4 });
    helmet.position.y = 0.28;
    headGroup.add(helmet);
    const visor = box(0.3, 0.1, 0.04, '#1a2634', { emissive: '#2aa8d8', emissiveIntensity: 0.5 });
    visor.position.set(0, 0.15, 0.17);
    headGroup.add(visor);
    const hair = box(0.34, 0.1, 0.34, p.hair);
    hair.position.y = 0.32;
    headGroup.add(hair);

    for (const side of [-1, 1]) {
      const arm = new THREE.Group();
      arm.position.set(side * 0.4, 0.55, 0);
      hips.add(arm);
      const upper = box(0.17, 0.5, 0.19, p.shirt);
      upper.position.y = -0.25;
      arm.add(upper);
      const fore = new THREE.Group();
      fore.position.y = -0.5;
      arm.add(fore);
      const lower = box(0.15, 0.44, 0.17, p.skin);
      lower.position.y = -0.22;
      fore.add(lower);
      const glove = box(0.17, 0.14, 0.19, p.accent);
      glove.position.y = -0.44;
      fore.add(glove);
      this.parts[side === -1 ? 'armL' : 'armR'] = arm;
      this.parts[side === -1 ? 'foreL' : 'foreR'] = fore;

      const leg = new THREE.Group();
      leg.position.set(side * 0.17, 0, 0);
      hips.add(leg);
      const thigh = box(0.22, 0.48, 0.24, p.pants);
      thigh.position.y = -0.24;
      leg.add(thigh);
      const shin = new THREE.Group();
      shin.position.y = -0.48;
      leg.add(shin);
      const shinMesh = box(0.2, 0.4, 0.22, p.pants);
      shinMesh.position.y = -0.2;
      shin.add(shinMesh);
      const boot = box(0.23, 0.12, 0.32, '#262b32');
      boot.position.set(0, -0.42, 0.04);
      shin.add(boot);
      this.parts[side === -1 ? 'legL' : 'legR'] = leg;
      this.parts[side === -1 ? 'shinL' : 'shinR'] = shin;
    }

    // held weapon anchor
    const weaponMount = new THREE.Group();
    weaponMount.position.set(0.06, 0.1, 0.12);
    this.parts.foreR.add(weaponMount);
    this.parts.weaponMount = weaponMount;

    // glider
    const glider = new THREE.Group();
    glider.position.set(0, 1.55, 0.15);
    const wingL = box(1.5, 0.06, 0.85, p.accent, { metal: 0.3, rough: 0.5 });
    wingL.position.x = -0.8;
    const wingR = box(1.5, 0.06, 0.85, p.accent, { metal: 0.3, rough: 0.5 });
    wingR.position.x = 0.8;
    const frame = box(0.14, 0.14, 1.1, '#2c333d');
    frame.position.z = -0.3;
    glider.add(wingL, wingR, frame);
    glider.visible = false;
    g.add(glider);
    this.parts.glider = glider;

    this.weaponModel = null;
    this.weaponId = null;
    this.setWeapon('harvester', '#6fe3ff');
  }

  buildHealthBar() {
    const bar = new THREE.Group();
    const bg = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 0.13),
      new THREE.MeshBasicMaterial({ color: '#000000', transparent: true, opacity: 0.55, depthWrite: false })
    );
    const fill = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 0.1),
      new THREE.MeshBasicMaterial({ color: '#5ce1a0', depthWrite: false })
    );
    fill.position.z = 0.001;
    bar.add(bg, fill);
    bar.position.y = 2.08;
    bar.renderOrder = 5;
    this.group.add(bar);
    this.healthBar = { group: bar, fill };
    bar.visible = false;
  }

  setHealthRatio(r) {
    if (!this.healthBar) return;
    const clamped = Math.max(0, Math.min(1, r));
    this.healthBar.fill.scale.x = clamped;
    this.healthBar.fill.position.x = -(1 - clamped) * 0.5;
    this.healthBar.fill.material.color.set(clamped > 0.55 ? '#5ce1a0' : clamped > 0.25 ? '#ffd166' : '#ff5d5d');
    this.healthBar.group.visible = clamped > 0 && clamped < 1;
  }

  setWeapon(id, rarityColor = '#b8c0c9') {
    if (this.weaponId === id) return;
    if (this.weaponModel) {
      this.parts.weaponMount.remove(this.weaponModel);
      this.weaponModel.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
    }
    this.weaponId = id;
    const model = new THREE.Group();
    const gunMat = { rough: 0.4, metal: 0.55 };
    if (id === 'harvester') {
      const handle = box(0.06, 0.7, 0.06, '#8a5f3c');
      handle.position.y = -0.2;
      const headM = box(0.34, 0.12, 0.12, rarityColor, { metal: 0.8, rough: 0.2, emissive: rarityColor, emissiveIntensity: 0.4 });
      headM.position.set(0.12, 0.16, 0);
      model.add(handle, headM);
      model.rotation.z = 0.2;
    } else if (id === 'pistol') {
      const body = box(0.1, 0.16, 0.34, rarityColor, gunMat);
      const grip = box(0.09, 0.22, 0.12, '#2b3038');
      grip.position.set(0, -0.16, -0.05);
      model.add(body, grip);
    } else if (id === 'shotgun') {
      const body = box(0.11, 0.14, 0.78, rarityColor, gunMat);
      const barrel = box(0.07, 0.07, 0.5, '#2b3038', { metal: 0.8, rough: 0.3 });
      barrel.position.set(0, 0.04, 0.5);
      const grip = box(0.08, 0.2, 0.14, '#2b3038');
      grip.position.set(0, -0.15, -0.2);
      model.add(body, barrel, grip);
    } else if (id === 'sniper' || id === 'dmr') {
      const body = box(0.1, 0.13, 1.05, rarityColor, gunMat);
      const scope = box(0.12, 0.12, 0.3, '#20262e', { metal: 0.7 });
      scope.position.set(0, 0.14, 0.05);
      const stock = box(0.09, 0.2, 0.3, '#2b3038');
      stock.position.set(0, -0.08, -0.45);
      const barrel = box(0.05, 0.05, 0.45, '#20262e');
      barrel.position.set(0, 0.02, 0.7);
      model.add(body, scope, stock, barrel);
    } else if (id === 'rocket') {
      const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 1.15, 10), mat(rarityColor, gunMat));
      tube.rotation.x = Math.PI / 2;
      const grip = box(0.08, 0.22, 0.12, '#2b3038');
      grip.position.set(0, -0.17, -0.1);
      model.add(tube, grip);
    } else if (id === 'bow') {
      const arc = new THREE.Mesh(new THREE.TorusGeometry(0.35, 0.035, 6, 16, Math.PI), mat(rarityColor, gunMat));
      arc.rotation.z = -Math.PI / 2;
      arc.rotation.y = Math.PI / 2;
      const string = box(0.01, 0.7, 0.01, '#dfe8ef');
      model.add(arc, string);
    } else if (id === 'grenade') {
      const orb = new THREE.Mesh(new THREE.IcosahedronGeometry(0.14, 1), mat(rarityColor, { emissive: rarityColor, emissiveIntensity: 0.6 }));
      model.add(orb);
    } else {
      const body = box(0.1, 0.15, 0.72, rarityColor, gunMat);
      const mag = box(0.08, 0.22, 0.12, '#2b3038');
      mag.position.set(0, -0.16, 0.02);
      const stock = box(0.08, 0.16, 0.26, '#2b3038');
      stock.position.set(0, -0.02, -0.45);
      const barrel = box(0.05, 0.05, 0.3, '#20262e');
      barrel.position.set(0, 0.02, 0.48);
      model.add(body, mag, stock, barrel);
    }
    model.position.set(0.02, 0, 0.1);
    this.parts.weaponMount.add(model);
    this.weaponModel = model;
  }

  get position() { return this.group.position; }

  update(dt, state) {
    this.time += dt;
    const p = this.parts;
    const moving = state.speed > 0.7;
    const runCycle = this.time * (state.speed > 6 ? 11 : 7.5);
    const swing = moving ? Math.sin(runCycle) : 0;
    const swing2 = moving ? Math.cos(runCycle) : 0;

    if (state.gliding) {
      p.glider.visible = true;
      p.glider.rotation.z = Math.sin(this.time * 2) * 0.06;
      p.armL.rotation.x = -2.5;
      p.armR.rotation.x = -2.5;
      p.armL.rotation.z = 0.4;
      p.armR.rotation.z = -0.4;
      p.legL.rotation.x = 0.25;
      p.legR.rotation.x = -0.1;
      p.hips.position.y = 0.92;
      p.torso.rotation.x = 0.25;
    } else {
      p.glider.visible = false;
      let crouch = state.crouching ? -0.42 : 0;
      if (state.sliding) crouch = -0.6;
      p.hips.position.y = 0.92 + crouch + (moving && !state.sliding ? Math.abs(Math.sin(runCycle)) * 0.05 : 0);
      p.torso.rotation.x = state.sliding ? 0.5 : state.aiming ? 0.08 : moving ? 0.12 : 0;
      p.legL.rotation.x = swing * 0.9 + (crouch < 0 ? 0.8 : 0);
      p.legR.rotation.x = -swing * 0.9 + (crouch < 0 ? 0.8 : 0);
      p.shinL.rotation.x = -Math.max(0, -swing) * 0.9;
      p.shinR.rotation.x = -Math.max(0, swing) * 0.9;
      p.armL.rotation.x = -swing * 0.7;
      p.armR.rotation.x = swing * 0.7;
      p.armL.rotation.z = 0.06;
      p.armR.rotation.z = -0.06;
      p.foreL.rotation.x = 0;

      if (state.aiming || state.firing) {
        p.armR.rotation.x = -1.35;
        p.armR.rotation.z = -0.15;
        p.foreR.rotation.x = -0.3;
        p.armL.rotation.x = -1.2;
        p.armL.rotation.z = 0.3;
        p.foreL.rotation.x = -0.35;
        p.headGroup.rotation.x = -0.06;
      } else if (state.pickaxeSwing) {
        p.armR.rotation.x = -2.2 + Math.sin(this.time * 14) * 0.8;
        p.foreR.rotation.x = -0.2;
      } else {
        p.foreR.rotation.x = -0.2;
        p.headGroup.rotation.x = 0;
      }
      if (state.emoting) {
        const t = this.time * 3.2;
        p.armL.rotation.z = 0.5 + Math.sin(t) * 0.7;
        p.armR.rotation.z = -0.5 - Math.sin(t + 1) * 0.7;
        p.hips.rotation.z = Math.sin(t * 0.8) * 0.16;
        p.hips.position.y = 0.92 + Math.abs(Math.sin(t)) * 0.08;
      } else {
        p.hips.rotation.z = 0;
      }
    }
    p.headGroup.rotation.y = THREE.MathUtils.clamp(state.lookYaw || 0, -0.9, 0.9) * 0.5;
  }

  dispose() {
    this.group.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose());
    });
  }
}

export function createCharacter(palette, opts) {
  return new Character(palette, opts);
}
