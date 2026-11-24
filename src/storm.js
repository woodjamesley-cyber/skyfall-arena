import * as THREE from 'three';

// Shrinking storm / zone for battle royale and zone wars.
export class Storm {
  constructor({ scene, mode, initialCenter = { x: 0, z: 0 } }) {
    this.scene = scene;
    this.mode = mode;
    this.center = new THREE.Vector2(initialCenter.x, initialCenter.z);
    this.startCenter = this.center.clone();
    this.targetCenter = this.center.clone();
    this.radius = mode.fastStorm ? 62 : 700;
    this.startRadius = this.radius;
    this.targetRadius = this.radius;
    this.phase = 0;
    this.state = 'waiting';
    this.timer = mode.fastStorm ? 9 : 45;
    this.phaseCount = mode.fastStorm ? 6 : 9;
    this.damage = mode.fastStorm ? 3 : 1;
    this.active = false;
    this.finished = false;
    this.mesh = this.buildMesh();
    this.scene.add(this.mesh);
    this.mesh.visible = false;
  }

  buildMesh() {
    const geo = new THREE.CylinderGeometry(1, 1, 260, 96, 1, true);
    const mat = new THREE.MeshBasicMaterial({
      color: '#8b6bff', transparent: true, opacity: 0.18, side: THREE.DoubleSide,
      depthWrite: false, blending: THREE.AdditiveBlending
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.y = 90;
    mesh.renderOrder = 3;
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(1, 0.012, 6, 96),
      new THREE.MeshBasicMaterial({ color: '#b49bff', transparent: true, opacity: 0.8, depthWrite: false })
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.1;
    mesh.add(ring);
    this.ring = ring;
    return mesh;
  }

  begin() {
    this.active = true;
    this.mesh.visible = true;
    this.planNext();
    this.state = 'waiting';
    this.timer = this.mode.fastStorm ? 8 : 42;
  }

  planNext() {
    if (this.phase >= this.phaseCount - 1) {
      this.targetRadius = this.mode.fastStorm ? 8 : 30;
      this.targetCenter.copy(this.center);
    } else {
      const shrink = this.mode.fastStorm ? 0.72 : 0.66;
      this.targetRadius = Math.max(this.mode.fastStorm ? 8 : 32, this.radius * shrink);
      const maxShift = Math.max(0, this.radius - this.targetRadius * 1.3);
      const a = Math.random() * Math.PI * 2;
      const d = Math.random() * maxShift;
      this.targetCenter.set(this.center.x + Math.cos(a) * d, this.center.y + Math.sin(a) * d);
    }
  }

  update(dt, participants) {
    if (!this.active) return;
    if (this.state === 'waiting') {
      this.timer -= dt;
      if (this.timer <= 0) {
        this.state = 'closing';
        this.startCenter.copy(this.center);
        this.startRadius = this.radius;
        this.timer = this.mode.fastStorm ? 9 : 28;
        if (this.onPhaseStart) this.onPhaseStart(this.phase);
      }
    } else if (this.state === 'closing') {
      this.timer -= dt;
      const t = 1 - Math.max(0, this.timer) / (this.mode.fastStorm ? 9 : 28);
      const smoothT = t * t * (3 - 2 * t);
      this.radius = this.startRadius + (this.targetRadius - this.startRadius) * smoothT;
      this.center.lerpVectors(this.startCenter, this.targetCenter, smoothT);
      if (this.timer <= 0) {
        this.radius = this.targetRadius;
        this.center.copy(this.targetCenter);
        this.phase++;
        this.damage = Math.min(12, (this.mode.fastStorm ? 3 : 1) + this.phase * (this.mode.fastStorm ? 2 : 1.2));
        if (this.phase >= this.phaseCount) {
          this.state = 'final';
          this.finished = true;
        } else {
          this.state = 'waiting';
          this.timer = this.mode.fastStorm ? 7 : 38;
          this.planNext();
        }
      }
    }
    // apply damage
    for (const p of participants) {
      if (!p.alive) continue;
      const d = Math.hypot(p.pos.x - this.center.x, p.pos.z - this.center.y);
      if (d > this.radius) {
        p.outsideStorm = true;
        p.stormTick = (p.stormTick || 0) + dt;
        if (p.stormTick >= 0.5) {
          p.stormTick = 0;
          p.takeDamage(this.damage / 2, { storm: true });
          if (p.isPlayer) p.cameraShake = Math.min(0.4, p.cameraShake + 0.05);
          if (!p.alive && this.onEliminated) this.onEliminated(p);
        }
      } else {
        p.outsideStorm = false;
      }
    }
    this.mesh.position.set(this.center.x, 85, this.center.y);
    this.mesh.scale.set(this.radius, 1, this.radius);
    this.ring.scale.set(this.radius, this.radius, 1);
    const pulse = 0.16 + Math.sin(performance.now() * 0.002) * 0.03;
    this.mesh.material.opacity = pulse;
  }

  info() {
    return {
      active: this.active,
      x: this.center.x, z: this.center.y, radius: this.radius,
      next: this.state === 'closing' || this.state === 'waiting' ? { x: this.targetCenter.x, z: this.targetCenter.y, radius: this.targetRadius } : null,
      state: this.state, timer: Math.max(0, this.timer), phase: this.phase, damage: this.damage
    };
  }

  dispose() {
    this.scene.remove(this.mesh);
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
  }
}
