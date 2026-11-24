import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { SkyDome } from './engine.js';
import { POIS } from './data.js';

export const WATER_LEVEL = 0;

// ---------- deterministic noise ----------
function hash2(x, z) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(z | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}
function smooth(t) { return t * t * (3 - 2 * t); }
function valueNoise(x, z) {
  const xi = Math.floor(x), zi = Math.floor(z);
  const xf = smooth(x - xi), zf = smooth(z - zi);
  const a = hash2(xi, zi), b = hash2(xi + 1, zi), c = hash2(xi, zi + 1), d = hash2(xi + 1, zi + 1);
  return (a * (1 - xf) + b * xf) * (1 - zf) + (c * (1 - xf) + d * xf) * zf;
}
function fbm(x, z, octaves = 4) {
  let sum = 0, amp = 0.5, freq = 1, norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += valueNoise(x * freq, z * freq) * amp;
    norm += amp;
    amp *= 0.5;
    freq *= 2.05;
  }
  return sum / norm;
}
function mulberry(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const COLOR = {
  asphalt: '#4a4f57', concrete: '#9a9d9c', concreteDark: '#6f7376', roofDark: '#353b44',
  roofRed: '#9c4a3f', wallCream: '#d9cbb0', wallBlue: '#7ba7c4', wallGreen: '#7f9c86',
  wallSand: '#cbab7a', wallRust: '#a4643c', metal: '#8f9aa6', wood: '#8a5f3c',
  glass: '#8fd8f0', neon: '#7ce4ff', brick: '#9c5b48', sand: '#e3cf9f', rock: '#7d7a72', snow: '#eef4f8'
};

export class World {
  constructor(engine, seed = 20261124) {
    this.engine = engine;
    this.seed = seed;
    this.rand = mulberry(seed);
    this.scene = new THREE.Scene();
    engine.activeScene = this.scene;
    this.scene.fog = new THREE.Fog('#bfd9e8', 260, 1250);
    this.colliders = [];
    this.grid = new Map();
    this.cell = 24;
    this.destructibles = [];
    this.lootSpots = [];
    this.vehicles = [];
    this.chests = [];
    this.extraMeshes = [];
    this.waterLevel = WATER_LEVEL;
    this.timeOfDay = 0.18;
    this.daySpeed = 1 / 900; // full cycle in 15 minutes
    this.weather = 'clear';

    this.pois = POIS.map((p, i) => {
      const angle = (i / POIS.length) * Math.PI * 2 + 0.35;
      const dist = p.kind === 'mountain' ? 400 : 300 + (i % 3) * 90;
      const x = Math.cos(angle) * dist;
      const z = Math.sin(angle) * dist;
      const base = Math.max(1.2, this.rawHeightAt(x, z));
      return { ...p, x, z, base };
    });

    this.buildLighting();
    this.buildSky();
    this.buildTerrain();
    this.buildWater();
    this.buildPOIs();
    this.buildVegetation();
    this.buildBounds();
    this.buildMinimapBase();
    this.setupWeather();
    this.scene.add(new THREE.AmbientLight('#93b7d6', 0.55));
  }

  // ---------- height ----------
  rawHeightAt(x, z) {
    const d = Math.sqrt(x * x + z * z);
    const islandR = 760;
    const falloff = 1 - smooth(Math.min(1, Math.max(0, (d - islandR * 0.52) / (islandR * 0.48))));
    const base = fbm(x * 0.0022 + 11, z * 0.0022 - 4, 4);
    const ridge = Math.pow(1 - Math.abs(fbm(x * 0.0045 - 7, z * 0.0045 + 3, 3) * 2 - 1), 2.2);
    let h = (base * 34 + ridge * 18) * falloff;
    h += (falloff - 0.6) * 8;
    // central lake
    const lake = Math.max(0, 1 - d / 120);
    h -= lake * 9;
    return h - 1.5;
  }

  heightAt(x, z) {
    let h = this.rawHeightAt(x, z);
    for (const p of this.pois) {
      const dx = x - p.x, dz = z - p.z;
      const d = Math.sqrt(dx * dx + dz * dz);
      if (d > p.radius * 1.5) continue;
      if (p.kind === 'mountain') {
        const peak = Math.max(0, 1 - d / (p.radius * 1.15));
        h += Math.pow(peak, 1.7) * 62;
      } else {
        const t = 1 - smooth(Math.min(1, d / (p.radius * 0.92)));
        h = h * (1 - t * 0.94) + p.base * t * 0.94;
      }
    }
    return h;
  }

  groundHeight(x, z) {
    return Math.max(this.heightAt(x, z), this.waterLevel);
  }

  isWater(x, z) { return this.heightAt(x, z) < this.waterLevel - 0.2; }

  groundType(x, z) {
    const h = this.heightAt(x, z);
    if (h < 0.6) return 'water';
    if (h < 2.2) return 'sand';
    if (h > 46) return 'snow';
    if (h > 30) return 'rock';
    return 'grass';
  }

  // ---------- lighting & sky ----------
  buildLighting() {
    this.sun = new THREE.DirectionalLight('#fff0cf', 2.4);
    this.sun.position.set(300, 480, 220);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const cam = this.sun.shadow.camera;
    cam.left = -220; cam.right = 220; cam.top = 220; cam.bottom = -220; cam.near = 1; cam.far = 900;
    this.sun.shadow.bias = -0.0004;
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);
    this.hemi = new THREE.HemisphereLight('#a8d8ff', '#4a5a3a', 0.85);
    this.scene.add(this.hemi);
    this.moon = new THREE.DirectionalLight('#8fb6ff', 0.25);
    this.moon.position.set(-200, 300, -180);
    this.scene.add(this.moon);
  }

  buildSky() {
    this.sky = new SkyDome(this.scene);
  }

  // ---------- terrain ----------
  buildTerrain() {
    const size = 1800, seg = 190;
    const geo = new THREE.PlaneGeometry(size, size, seg, seg);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    const cSand = new THREE.Color('#e8d7a6');
    const cGrass = new THREE.Color('#79a95a');
    const cGrass2 = new THREE.Color('#5d8f4b');
    const cRock = new THREE.Color('#8a877c');
    const cSnow = new THREE.Color('#f2f7fb');
    const cDirt = new THREE.Color('#a98d62');
    const tmp = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      const y = this.heightAt(x, z);
      pos.setY(i, y);
      let col;
      if (y < 0.8) col = cSand;
      else if (y < 2.4) col = cSand.clone().lerp(cDirt, (y - 0.8) / 1.6);
      else if (y < 26) col = cGrass.clone().lerp(cGrass2, Math.min(1, (y - 3) / 20) * 0.7);
      else if (y < 38) col = cRock.clone().lerp(cDirt, Math.max(0, 1 - (y - 26) / 6));
      else col = cRock.clone().lerp(cSnow, Math.min(1, (y - 38) / 12));
      const n = (valueNoise(x * 0.08, z * 0.08) - 0.5) * 0.09;
      tmp.copy(col).offsetHSL(n * 0.12, 0.02, n);
      colors[i * 3] = tmp.r; colors[i * 3 + 1] = tmp.g; colors[i * 3 + 2] = tmp.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.96, metalness: 0, flatShading: false });
    this.terrain = new THREE.Mesh(geo, mat);
    this.terrain.receiveShadow = true;
    this.terrain.name = 'terrain';
    this.scene.add(this.terrain);
  }

  buildWater() {
    const geo = new THREE.PlaneGeometry(3600, 3600, 8, 8);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshStandardMaterial({
      color: '#2b7fa8', transparent: true, opacity: 0.82, roughness: 0.18,
      metalness: 0.35, emissive: '#0b3a52', emissiveIntensity: 0.25
    });
    this.water = new THREE.Mesh(geo, mat);
    this.water.position.y = this.waterLevel;
    this.scene.add(this.water);

    this.waterWall = new THREE.Mesh(
      new THREE.CircleGeometry(1700, 48),
      new THREE.MeshBasicMaterial({ color: '#123a4d', transparent: true, opacity: 0.35, side: THREE.DoubleSide })
    );
    this.waterWall.rotation.x = -Math.PI / 2;
    this.waterWall.position.y = -8;
    this.scene.add(this.waterWall);
  }

  buildBounds() {
    this.scene.add(new THREE.AmbientLight('#2b3b52', 0.15));
  }

  // ---------- collider helpers ----------
  addCollider(min, max, kind, extra = {}) {
    const c = {
      minX: Math.min(min.x, max.x), maxX: Math.max(min.x, max.x),
      minY: Math.min(min.y, max.y), maxY: Math.max(min.y, max.y),
      minZ: Math.min(min.z, max.z), maxZ: Math.max(min.z, max.z),
      kind, ...extra
    };
    c.id = c.id || `c${this.colliders.length}`;
    this.colliders.push(c);
    const cx0 = Math.floor(c.minX / this.cell), cx1 = Math.floor(c.maxX / this.cell);
    const cz0 = Math.floor(c.minZ / this.cell), cz1 = Math.floor(c.maxZ / this.cell);
    for (let cx = cx0; cx <= cx1; cx++) {
      for (let cz = cz0; cz <= cz1; cz++) {
        const k = cx + ',' + cz;
        if (!this.grid.has(k)) this.grid.set(k, []);
        this.grid.get(k).push(c);
      }
    }
    return c;
  }

  removeCollider(c) {
    const idx = this.colliders.indexOf(c);
    if (idx >= 0) this.colliders.splice(idx, 1);
    for (const [, arr] of this.grid) {
      const i = arr.indexOf(c);
      if (i >= 0) arr.splice(i, 1);
    }
  }

  queryColliders(x, z, r = 26) {
    const out = [];
    const seen = new Set();
    const cx0 = Math.floor((x - r) / this.cell), cx1 = Math.floor((x + r) / this.cell);
    const cz0 = Math.floor((z - r) / this.cell), cz1 = Math.floor((z + r) / this.cell);
    for (let cx = cx0; cx <= cx1; cx++) {
      for (let cz = cz0; cz <= cz1; cz++) {
        const arr = this.grid.get(cx + ',' + cz);
        if (!arr) continue;
        for (const c of arr) {
          if (seen.has(c.id)) continue;
          seen.add(c.id);
          out.push(c);
        }
      }
    }
    return out;
  }

  // Highest walkable surface underneath a point (terrain, floors, ramps, roofs).
  supportHeight(x, z, fromY) {
    let h = this.heightAt(x, z);
    let kind = h < this.waterLevel ? 'water' : 'terrain';
    const near = this.queryColliders(x, z, 3);
    for (const c of near) {
      if (x < c.minX - 0.05 || x > c.maxX + 0.05 || z < c.minZ - 0.05 || z > c.maxZ + 0.05) continue;
      if (c.noSupport) continue;
      let top;
      if (c.kind === 'ramp') {
        const t = c.axis === 'x' ? (x - c.minX) / Math.max(0.001, c.maxX - c.minX) : (z - c.minZ) / Math.max(0.001, c.maxZ - c.minZ);
        const tt = c.flip ? 1 - t : t;
        top = c.minY + (c.maxY - c.minY) * tt;
      } else {
        if (!c.walkable) continue;
        top = c.maxY;
      }
      if (top > fromY + 0.55 || top < fromY - 2.4) continue;
      if (top > h) { h = top; kind = c.kind; }
    }
    return { height: h, kind };
  }

  // Resolve horizontal capsule collision against nearby walls.
  collide(pos, radius, feetY, height) {
    const near = this.queryColliders(pos.x, pos.z, 6);
    const headY = feetY + height;
    for (const c of near) {
      if (c.noBlock) continue;
      if (c.maxY <= feetY + 0.45 || c.minY >= headY) continue;
      if (c.kind === 'ramp') continue;
      const exMinX = c.minX - radius, exMaxX = c.maxX + radius;
      const exMinZ = c.minZ - radius, exMaxZ = c.maxZ + radius;
      if (pos.x <= exMinX || pos.x >= exMaxX || pos.z <= exMinZ || pos.z >= exMaxZ) continue;
      const dxL = pos.x - exMinX, dxR = exMaxX - pos.x;
      const dzL = pos.z - exMinZ, dzR = exMaxZ - pos.z;
      const m = Math.min(dxL, dxR, dzL, dzR);
      if (m === dxL) pos.x = exMinX;
      else if (m === dxR) pos.x = exMaxX;
      else if (m === dzL) pos.z = exMinZ;
      else pos.z = exMaxZ;
    }
  }

  raycast(origin, dir, maxDist = 300) {
    let best = { distance: maxDist, point: null, type: null, collider: null, normal: new THREE.Vector3(0, 1, 0) };
    const ox = origin.x, oy = origin.y, oz = origin.z;
    // --- AABB candidates along the ray via the spatial grid ---
    const seen = new Set();
    const stepCells = 6;
    for (let d = 0; d < maxDist; d += this.cell * stepCells) {
      const px = ox + dir.x * d, pz = oz + dir.z * d;
      const cx = Math.floor(px / this.cell), cz = Math.floor(pz / this.cell);
      for (let i = -1; i <= 1; i++) {
        for (let j = -1; j <= 1; j++) {
          const arr = this.grid.get((cx + i) + ',' + (cz + j));
          if (!arr) continue;
          for (const c of arr) {
            if (seen.has(c)) continue;
            seen.add(c);
            const tmin = this.rayBox(ox, oy, oz, dir, c);
            if (tmin >= 0 && tmin < best.distance) {
              best.distance = tmin;
              best.point = new THREE.Vector3(ox + dir.x * tmin, oy + dir.y * tmin, oz + dir.z * tmin);
              best.type = 'structure';
              best.collider = c;
              const ax = Math.abs(dir.x), ay = Math.abs(dir.y), az = Math.abs(dir.z);
              if (ax > ay && ax > az) best.normal.set(-Math.sign(dir.x), 0, 0);
              else if (az > ay) best.normal.set(0, 0, -Math.sign(dir.z));
              else best.normal.set(0, -Math.sign(dir.y), 0);
            }
          }
        }
      }
    }
    // --- terrain + water ---
    const maxT = Math.min(best.distance, maxDist);
    let prevD = 0.5;
    for (let d = 0.5; d <= maxT; d += 1.6) {
      const x = ox + dir.x * d, y = oy + dir.y * d, z = oz + dir.z * d;
      const h = this.heightAt(x, z);
      if (y <= h) {
        let lo = prevD, hi = d;
        for (let k = 0; k < 5; k++) {
          const mid = (lo + hi) / 2;
          if (oy + dir.y * mid <= this.heightAt(ox + dir.x * mid, oz + dir.z * mid)) hi = mid;
          else lo = mid;
        }
        if (hi < best.distance) {
          best.distance = hi;
          best.point = new THREE.Vector3(ox + dir.x * hi, oy + dir.y * hi, oz + dir.z * hi);
          best.type = 'terrain';
          best.collider = null;
          best.normal.set(0, 1, 0);
        }
        break;
      }
      if (y < this.waterLevel) {
        const t = (this.waterLevel - oy) / (dir.y || 1e-6);
        if (t > 0 && t < best.distance) {
          best.distance = t;
          best.point = new THREE.Vector3(ox + dir.x * t, this.waterLevel, oz + dir.z * t);
          best.type = 'water';
          best.normal.set(0, 1, 0);
        }
        break;
      }
      prevD = d;
    }
    if (!best.point) best.point = new THREE.Vector3(ox + dir.x * maxDist, oy + dir.y * maxDist, oz + dir.z * maxDist);
    return best;
  }

  rayBox(ox, oy, oz, dir, c) {
    let tmin = 0, tmax = 1e9;
    const lo = [c.minX, c.minY, c.minZ], hi = [c.maxX, c.maxY, c.maxZ];
    const o = [ox, oy, oz], d = [dir.x, dir.y, dir.z];
    for (let i = 0; i < 3; i++) {
      if (Math.abs(d[i]) < 1e-8) {
        if (o[i] < lo[i] || o[i] > hi[i]) return -1;
        continue;
      }
      let t1 = (lo[i] - o[i]) / d[i], t2 = (hi[i] - o[i]) / d[i];
      if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
      tmin = Math.max(tmin, t1);
      tmax = Math.min(tmax, t2);
      if (tmin > tmax) return -1;
    }
    return tmin;
  }

  // ---------- materials / geometry helpers ----------
  mat(color, opts = {}) {
    const key = color + JSON.stringify(opts);
    if (!this._mats) this._mats = new Map();
    if (!this._mats.has(key)) {
      this._mats.set(key, new THREE.MeshStandardMaterial({
        color, roughness: opts.rough ?? 0.82, metalness: opts.metal ?? 0.06,
        emissive: opts.emissive || '#000000', emissiveIntensity: opts.emissiveIntensity || 0,
        transparent: !!opts.transparent, opacity: opts.opacity ?? 1, side: opts.side || THREE.FrontSide,
        flatShading: opts.flat ?? false
      }));
    }
    return this._mats.get(key);
  }

  beginBatch() { this.buckets = new Map(); }

  addBoxGeo(x, y, z, w, h, d, color, opts = {}) {
    const g = new THREE.BoxGeometry(w, h, d);
    if (opts.rotY) g.rotateY(opts.rotY);
    if (opts.rotZ) g.rotateZ(opts.rotZ);
    if (opts.rotX) g.rotateX(opts.rotX);
    g.translate(x, y + h / 2, z);
    const key = color + '|' + (opts.glass ? 'g' : '') + (opts.emissive ? 'e' : '');
    if (!this.buckets.has(key)) this.buckets.set(key, { color, opts, geos: [] });
    this.buckets.get(key).geos.push(g);
    if (opts.collider !== false) {
      let hw = w / 2, hd = d / 2;
      if (opts.rotY && Math.abs(Math.sin(opts.rotY)) > 0.5) { hw = d / 2; hd = w / 2; }
      const c = this.addCollider(
        { x: x - hw, y, z: z - hd },
        { x: x + hw, y: y + h, z: z + hd },
        opts.kind || 'wall',
        { walkable: opts.walkable !== false, noBlock: opts.noBlock || false, hp: opts.hp, mat: opts.mat, destructible: !!opts.destructible, meshColor: color }
      );
      if (opts.colliderId) c.id = opts.colliderId;
      return c;
    }
    return null;
  }

  endBatch() {
    for (const [, bucket] of this.buckets) {
      if (!bucket.geos.length) continue;
      const merged = mergeGeometries(bucket.geos, false);
      if (!merged) continue;
      const isGlass = bucket.opts.glass;
      const material = isGlass
        ? new THREE.MeshStandardMaterial({
            color: bucket.color, transparent: true, opacity: 0.35, roughness: 0.08,
            metalness: 0.6, emissive: bucket.color, emissiveIntensity: 0.35
          })
        : this.mat(bucket.color, {
            rough: bucket.opts.rough, metal: bucket.opts.metal,
            emissive: bucket.opts.emissive, emissiveIntensity: bucket.opts.emissiveIntensity
          });
      const mesh = new THREE.Mesh(merged, material);
      mesh.castShadow = !isGlass;
      mesh.receiveShadow = true;
      this.scene.add(mesh);
      this.extraMeshes.push(mesh);
    }
    this.buckets = null;
  }

  // ---------- building generation ----------
  buildPOIs() {
    this.beginBatch();
    for (const poi of this.pois) {
      const r = mulberry(this.seed + poi.id.length * 977 + poi.x * 3);
      if (poi.kind === 'town') this.buildTown(poi, r, 13);
      else if (poi.kind === 'industrial') this.buildIndustrial(poi, r);
      else if (poi.kind === 'mountain') this.buildMountain(poi, r);
      else if (poi.kind === 'forest') this.buildCabins(poi, r, 4);
      else if (poi.kind === 'desert') this.buildDesert(poi, r, 7);
      else if (poi.kind === 'beach') this.buildMarina(poi, r);
      else if (poi.kind === 'underground') this.buildVault(poi, r);
      else this.buildTown(poi, r, 6);
      // plaza slab
      const plaza = new THREE.CylinderGeometry(poi.radius * 0.72, poi.radius * 0.72, 0.35, 28);
      plaza.translate(poi.x, poi.base + 0.1, poi.z);
      const key = COLOR.concrete + '|';
      if (!this.buckets.has(key)) this.buckets.set(key, { color: COLOR.concrete, opts: {}, geos: [] });
      this.buckets.get(key).geos.push(plaza);
      this.addCollider(
        { x: poi.x - poi.radius, y: poi.base - 2, z: poi.z - poi.radius },
        { x: poi.x + poi.radius, y: poi.base + 0.2, z: poi.z + poi.radius },
        'plaza', { walkable: true, noBlock: true, noSupport: false }
      );
      this.scatterLoot(poi, r);
    }
    this.endBatch();
    // road ribbons between POIs
    this.buildRoads();
  }

  makeBuilding(poi, x, z, w, d, floors, style, rand) {
    const base = this.heightAt(x, z);
    const wallH = 3.1;
    const h = wallH * floors;
    const t = 0.32;
    const wallColor = style.wall;
    const roofColor = style.roof;
    // floor slab + roof
    this.addBoxGeo(x, base - 0.2, z, w + 0.6, 0.4, d + 0.6, COLOR.concreteDark, { kind: 'floor', noBlock: true });
    this.addBoxGeo(x, base + h, z, w + 0.7, 0.35, d + 0.7, roofColor, { kind: 'roof', walkable: true });
    // parapet
    const ph = 0.7;
    this.addBoxGeo(x, base + h + 0.35, z - d / 2, w, ph, 0.25, roofColor);
    this.addBoxGeo(x, base + h + 0.35, z + d / 2, w, ph, 0.25, roofColor);
    this.addBoxGeo(x - w / 2, base + h + 0.35, z, 0.25, ph, d, roofColor);
    this.addBoxGeo(x + w / 2, base + h + 0.35, z, 0.25, ph, d, roofColor);
    // door on -z face
    const doorW = 1.6, doorH = 2.35;
    const sideW = (w - doorW) / 2;
    this.addBoxGeo(x - (doorW / 2 + sideW / 2), base, z - d / 2, sideW, h, t, wallColor);
    this.addBoxGeo(x + (doorW / 2 + sideW / 2), base, z - d / 2, sideW, h, t, wallColor);
    this.addBoxGeo(x, base + doorH, z - d / 2, doorW, h - doorH, t, wallColor);
    // back wall with windows
    this.addBoxGeo(x, base, z + d / 2, w, h, t, wallColor);
    // side walls
    this.addBoxGeo(x - w / 2, base, z, t, h, d, wallColor);
    this.addBoxGeo(x + w / 2, base, z, t, h, d, wallColor);
    // interior floor + staircase for upper floors
    for (let f = 1; f < floors; f++) {
      this.addBoxGeo(x, base + f * wallH - 0.18, z, w - 0.4, 0.3, d - 0.4, COLOR.concreteDark, { kind: 'floor', noBlock: true });
      const steps = Math.ceil(wallH / 0.35);
      for (let s = 0; s < steps; s++) {
        this.addBoxGeo(x - w / 2 + 1.9, base + (f - 1) * wallH + s * 0.35, z + 1.4 - s * 0.42, 2.1, 0.35, 0.46, COLOR.metal);
      }
    }
    // roof access stairs outside on +x
    for (let i = 0; i < Math.ceil(h / 0.36); i++) {
      const stepY = base + i * 0.36;
      this.addBoxGeo(x + w / 2 + 0.9, stepY, z - d / 2 + 1.2 + i * 0.34, 1.8, 0.36, 0.42, COLOR.metal, { kind: 'step' });
    }
    // windows (glass panels)
    for (let f = 0; f < floors; f++) {
      const wy = base + f * wallH + 1.35;
      for (let i = 0; i < 3; i++) {
        const off = (i - 1) * (w / 4);
        this.addBoxGeo(x + off, wy, z + d / 2 + 0.02, 1.3, 1.15, 0.08, COLOR.glass, { glass: true, collider: false });
        this.addBoxGeo(x - w / 2 - 0.02, wy, z + off * (d / w), 0.08, 1.15, 1.3, COLOR.glass, { glass: true, collider: false });
      }
    }
    // AC units / crates on roof
    this.addBoxGeo(x + w / 4, base + h + 0.35, z + d / 4, 1.2, 0.9, 1.2, COLOR.metal, { kind: 'prop', walkable: true });
    const crateMat = rand() > 0.5 ? COLOR.wood : COLOR.metal;
    this.addBoxGeo(x - w / 4, base + h + 0.35, z - d / 2 + 1.2, 1.1, 1.1, 1.1, crateMat, { kind: 'prop', walkable: true });
    // loot spots
    this.lootSpots.push({ x, y: base + 0.4, z, tier: 'chest' });
    this.lootSpots.push({ x: x + w / 2.8, y: base, z: z + d / 2.8, tier: 'floor' });
    if (floors > 1) this.lootSpots.push({ x, y: base + wallH + 0.2, z, tier: 'floor' });
    return { base, h };
  }

  buildTown(poi, rand, count) {
    const styles = [
      { wall: COLOR.wallCream, roof: COLOR.roofRed },
      { wall: COLOR.wallBlue, roof: COLOR.roofDark },
      { wall: COLOR.wallGreen, roof: COLOR.roofRed },
      { wall: COLOR.brick, roof: COLOR.roofDark }
    ];
    const placed = [];
    for (let i = 0; i < count * 2 && placed.length < count; i++) {
      const a = rand() * Math.PI * 2;
      const rr = Math.sqrt(rand()) * poi.radius * 0.72;
      const x = poi.x + Math.cos(a) * rr, z = poi.z + Math.sin(a) * rr;
      const w = 8 + Math.floor(rand() * 4) * 2.2, d = 7 + Math.floor(rand() * 4) * 2.2;
      if (placed.some((p) => Math.hypot(p.x - x, p.z - z) < (p.w + w) * 0.72)) continue;
      placed.push({ x, z, w });
      this.makeBuilding(poi, x, z, w, d, rand() > 0.62 ? 2 : 1, styles[Math.floor(rand() * styles.length)], rand);
    }
    // street lamps
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const x = poi.x + Math.cos(a) * poi.radius * 0.55, z = poi.z + Math.sin(a) * poi.radius * 0.55;
      const b = this.heightAt(x, z);
      this.addBoxGeo(x, b, z, 0.24, 5.4, 0.24, COLOR.metal);
      this.addBoxGeo(x, b + 5.4, z, 0.9, 0.3, 0.9, COLOR.neon, { emissive: COLOR.neon, emissiveIntensity: 0.9, collider: false });
    }
  }

  buildIndustrial(poi, rand) {
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + 0.4;
      const x = poi.x + Math.cos(a) * poi.radius * 0.48, z = poi.z + Math.sin(a) * poi.radius * 0.48;
      const w = 16 + rand() * 8, d = 13 + rand() * 6;
      this.makeWarehouse(x, z, w, d);
    }
    // containers
    for (let i = 0; i < 10; i++) {
      const x = poi.x + (rand() - 0.5) * poi.radius, z = poi.z + (rand() - 0.5) * poi.radius;
      const b = this.heightAt(x, z);
      const colors = ['#b5563f', '#3f7f9c', '#b08b3d', '#5a8f5a'];
      const col = colors[Math.floor(rand() * colors.length)];
      this.addBoxGeo(x, b, z, 3.2, 1.4, 6.5, col, { kind: 'prop', walkable: true });
      if (rand() > 0.5) this.addBoxGeo(x, b + 1.4, z, 3.2, 1.4, 6.5, col, { kind: 'prop', walkable: true });
      this.lootSpots.push({ x, y: b + 0.3, z, tier: rand() > 0.6 ? 'chest' : 'floor' });
    }
    // silos
    for (let i = 0; i < 3; i++) {
      const x = poi.x - poi.radius * 0.45 + i * 7, z = poi.z - poi.radius * 0.4;
      const b = this.heightAt(x, z);
      const silo = new THREE.CylinderGeometry(2.4, 2.6, 9, 12);
      silo.translate(x, b + 4.5, z);
      if (!this.buckets.has(COLOR.metal + '|')) this.buckets.set(COLOR.metal + '|', { color: COLOR.metal, opts: {}, geos: [] });
      this.buckets.get(COLOR.metal + '|').geos.push(silo);
      this.addCollider({ x: x - 2.5, y: b, z: z - 2.5 }, { x: x + 2.5, y: b + 9, z: z + 2.5 }, 'wall', { walkable: false });
    }
  }

  makeWarehouse(x, z, w, d) {
    const base = this.heightAt(x, z);
    const h = 7.5;
    this.addBoxGeo(x, base - 0.2, z, w + 0.5, 0.4, d + 0.5, COLOR.concrete, { kind: 'floor', noBlock: true });
    this.addBoxGeo(x, base + h, z, w + 0.6, 0.5, d + 0.6, COLOR.roofDark, { kind: 'roof', walkable: true });
    // front open
    this.addBoxGeo(x, base + h - 1.2, z - d / 2, w, 1.2, 0.35, COLOR.wallRust);
    this.addBoxGeo(x - w / 2, base, z - d / 2, 0.4, h, 0.4, COLOR.wallRust);
    this.addBoxGeo(x + w / 2, base, z - d / 2, 0.4, h, 0.4, COLOR.wallRust);
    this.addBoxGeo(x, base, z + d / 2, w, h, 0.4, COLOR.wallRust);
    this.addBoxGeo(x - w / 2, base, z, 0.4, h, d, COLOR.wallRust);
    this.addBoxGeo(x + w / 2, base, z, 0.4, h, d, COLOR.wallRust);
    // roof support beams
    for (let i = -1; i <= 1; i++) {
      this.addBoxGeo(x + i * (w / 3), base, z, 0.3, h, 0.3, COLOR.metal);
    }
    for (let i = 0; i < 4; i++) {
      this.addBoxGeo(x + (i - 1.5) * (w / 5), base, z - d / 4, 2.6, 1.1, 1.6, COLOR.wood, { kind: 'prop', walkable: true });
    }
    this.lootSpots.push({ x, y: base + 0.3, z, tier: 'chest' });
    this.lootSpots.push({ x: x + w / 4, y: base, z: z + d / 4, tier: 'floor' });
    this.lootSpots.push({ x, y: base + h + 0.6, z, tier: 'floor' });
  }

  buildMountain(poi, rand) {
    const base = this.heightAt(poi.x, poi.z);
    // observation station
    this.addBoxGeo(poi.x, base - 0.3, poi.z, 13, 0.5, 11, COLOR.concreteDark, { kind: 'floor', noBlock: true });
    this.addBoxGeo(poi.x, base + 4.2, poi.z, 13, 0.4, 11, COLOR.roofDark, { kind: 'roof', walkable: true });
    const cols = [[-6, -5], [6, -5], [-6, 5], [6, 5]];
    for (const [ox, oz] of cols) this.addBoxGeo(poi.x + ox, base, poi.z + oz, 0.6, 4.2, 0.6, COLOR.metal);
    this.addBoxGeo(poi.x, base, poi.z - 5.2, 13, 1.4, 0.35, COLOR.wallBlue);
    this.addBoxGeo(poi.x, base + 2.2, poi.z - 5.2, 13, 1.2, 0.35, COLOR.wallBlue);
    this.addBoxGeo(poi.x, base, poi.z + 5.2, 13, 4.2, 0.35, COLOR.wallBlue);
    this.addBoxGeo(poi.x - 6.2, base, poi.z, 0.35, 4.2, 11, COLOR.wallBlue);
    this.addBoxGeo(poi.x + 6.2, base, poi.z, 0.35, 4.2, 11, COLOR.wallBlue);
    // antenna
    this.addBoxGeo(poi.x + 4, base + 4.2, poi.z + 3.5, 0.2, 8, 0.2, COLOR.metal, { collider: false });
    this.addBoxGeo(poi.x + 4, base + 12, poi.z + 3.5, 1.6, 0.3, 0.3, COLOR.neon, { emissive: COLOR.neon, emissiveIntensity: 1, collider: false });
    this.lootSpots.push({ x: poi.x, y: base + 0.3, z: poi.z, tier: 'chest' });
    this.lootSpots.push({ x: poi.x + 3, y: base, z: poi.z, tier: 'floor' });
    // rocks and flag
    for (let i = 0; i < 6; i++) {
      const a = rand() * Math.PI * 2, rr = 25 + rand() * 45;
      this.addRock(poi.x + Math.cos(a) * rr, poi.z + Math.sin(a) * rr, 2 + rand() * 3);
    }
  }

  buildCabins(poi, rand, count) {
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + rand();
      const x = poi.x + Math.cos(a) * poi.radius * 0.45, z = poi.z + Math.sin(a) * poi.radius * 0.45;
      this.makeBuilding(poi, x, z, 8, 7, 1, { wall: COLOR.wood, roof: COLOR.roofRed }, rand);
    }
    this.lootSpots.push({ x: poi.x, y: this.heightAt(poi.x, poi.z), z: poi.z, tier: 'chest' });
  }

  buildDesert(poi, rand, count) {
    for (let i = 0; i < count; i++) {
      const a = rand() * Math.PI * 2, rr = Math.sqrt(rand()) * poi.radius * 0.7;
      const x = poi.x + Math.cos(a) * rr, z = poi.z + Math.sin(a) * rr;
      const w = 9 + rand() * 5, d = 8 + rand() * 5;
      this.makeBuilding(poi, x, z, w, d, 1, { wall: COLOR.wallSand, roof: COLOR.roofDark }, rand);
    }
  }

  buildMarina(poi, rand) {
    const base = Math.max(2.2, this.heightAt(poi.x, poi.z));
    // docks stretching toward water
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + 0.7;
      const dx = Math.cos(a), dz = Math.sin(a);
      for (let s = 0; s < 10; s++) {
        const x = poi.x + dx * (18 + s * 4), z = poi.z + dz * (18 + s * 4);
        this.addBoxGeo(x, 0.7, z, 4.2, 0.3, 4.2, COLOR.wood, { kind: 'floor', noBlock: true });
      }
      for (let s = 0; s < 3; s++) {
        const x = poi.x + dx * (24 + s * 12), z = poi.z + dz * (24 + s * 12);
        this.addBoxGeo(x + dz * 1.8, 1, z - dx * 1.8, 0.3, 3, 0.3, COLOR.wood);
      }
    }
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + 0.4;
      const x = poi.x + Math.cos(a) * 26, z = poi.z + Math.sin(a) * 26;
      this.makeBuilding(poi, x, z, 8, 7, 1, { wall: COLOR.wallGreen, roof: COLOR.roofRed }, rand);
    }
    // boats
    for (let i = 0; i < 3; i++) {
      const x = poi.x + 26 + i * 9, z = poi.z + 14;
      this.addBoxGeo(x, 0.4, z, 2.4, 0.9, 5.6, '#e8eef2', { kind: 'prop', walkable: true });
      this.addBoxGeo(x, 1.3, z + 0.5, 1.5, 0.9, 1.6, COLOR.glass, { glass: true, collider: false });
    }
    // karts
    this.spawnVehicle(poi.x - 20, poi.z + 8);
    this.spawnVehicle(poi.x + 30, poi.z - 12);
  }

  buildVault(poi, rand) {
    const base = this.heightAt(poi.x, poi.z);
    // bunker ring
    const w = 26, d = 26;
    this.addBoxGeo(poi.x, base - 0.4, poi.z, w, 6, d, COLOR.concreteDark, { kind: 'wall', walkable: false, noBlock: true, collider: false });
    this.addBoxGeo(poi.x, base + 5.6, poi.z, w + 1, 0.5, d + 1, COLOR.metal, { kind: 'roof', walkable: true });
    for (let i = 0; i < 4; i++) {
      const ox = i % 2 === 0 ? -1 : 1, oz = i < 2 ? -1 : 1;
      this.addBoxGeo(poi.x + ox * (w / 2), base, poi.z + oz * (d / 2), 8, 5.6, 0.4, COLOR.metal);
    }
    // glowing rift core
    const core = new THREE.Mesh(
      new THREE.IcosahedronGeometry(2.4, 1),
      new THREE.MeshStandardMaterial({ color: '#8b6bff', emissive: '#6a3dff', emissiveIntensity: 1.6, roughness: 0.2 })
    );
    core.position.set(poi.x, base + 3.2, poi.z);
    this.scene.add(core);
    this.vaultCore = core;
    this.addBoxGeo(poi.x - 8, base, poi.z - 8, 3, 1.2, 3, COLOR.metal, { kind: 'prop', walkable: true });
    this.lootSpots.push({ x: poi.x, y: base + 0.3, z: poi.z, tier: 'chest' });
    this.lootSpots.push({ x: poi.x + 5, y: base, z: poi.z - 5, tier: 'chest' });
    this.lootSpots.push({ x: poi.x - 5, y: base, z: poi.z + 5, tier: 'floor' });
  }

  buildRoads() {
    const geos = [];
    for (let i = 0; i < this.pois.length; i++) {
      const a = this.pois[i], b = this.pois[(i + 1) % this.pois.length];
      const dx = b.x - a.x, dz = b.z - a.z;
      const len = Math.hypot(dx, dz);
      const segs = Math.floor(len / 14);
      for (let s = 0; s < segs; s++) {
        const t = s / segs;
        const x = a.x + dx * t, z = a.z + dz * t;
        if (this.heightAt(x, z) < 1.4) continue;
        const g = new THREE.BoxGeometry(10, 0.12, 12);
        g.rotateY(-Math.atan2(dz, dx) + Math.PI / 2);
        g.translate(x, this.heightAt(x, z) + 0.05, z);
        geos.push(g);
      }
    }
    if (!geos.length) return;
    const merged = mergeGeometries(geos, false);
    const road = new THREE.Mesh(merged, new THREE.MeshStandardMaterial({ color: '#4d5560', roughness: 0.95 }));
    road.receiveShadow = true;
    this.scene.add(road);
    this.extraMeshes.push(road);
  }

  // ---------- vegetation & props ----------
  spawnTree(x, z, scale, rand) {
    const y = this.heightAt(x, z);
    const trunk = new THREE.Matrix4();
    const foliage = new THREE.Matrix4();
    const foliage2 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rand() * Math.PI * 2);
    trunk.compose(new THREE.Vector3(x, y + 2.2 * scale, z), q, new THREE.Vector3(scale, scale, scale));
    foliage.compose(new THREE.Vector3(x, y + 4.6 * scale, z), q, new THREE.Vector3(scale, scale, scale));
    foliage2.compose(new THREE.Vector3(x, y + 6.2 * scale, z), q, new THREE.Vector3(scale * 0.7, scale * 0.8, scale * 0.7));
    const ti = this.treeTrunk.count;
    this.treeTrunk.setMatrixAt(ti, trunk);
    this.treeFoliage.setMatrixAt(this.treeFoliageCount++, foliage);
    this.treeFoliage.setMatrixAt(this.treeFoliageCount++, foliage2);
    const d = { x, z, y, hp: 100, type: 'tree', trunkIndex: ti, foliageIndices: [this.treeFoliageCount - 2, this.treeFoliageCount - 1], scale, dead: false, respawn: 0 };
    this.destructibles.push(d);
    return d;
  }

  buildVegetation() {
    const rand = mulberry(this.seed + 999);
    this.beginBatch();
    const maxTrees = 900;
    this.treeTrunk = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(0.28, 0.42, 4.4, 6),
      new THREE.MeshStandardMaterial({ color: '#6b4a2f', roughness: 1 }), maxTrees
    );
    this.treeFoliage = new THREE.InstancedMesh(
      new THREE.ConeGeometry(2.5, 4.4, 7),
      new THREE.MeshStandardMaterial({ color: '#3f7d4a', roughness: 1, flatShading: true }), maxTrees * 2
    );
    this.treeFoliageCount = 0;
    this.treeTrunk.castShadow = true;
    this.treeFoliage.castShadow = true;
    let placed = 0;
    let guard = 0;
    while (placed < maxTrees && guard++ < 9000) {
      const x = (rand() - 0.5) * 1500, z = (rand() - 0.5) * 1500;
      const h = this.heightAt(x, z);
      if (h < 2.6 || h > 42) continue;
      if (this.pois.some((p) => Math.hypot(p.x - x, p.z - z) < p.radius * (p.kind === 'forest' ? 0.35 : 0.78))) {
        if (this.pois.every((p) => Math.hypot(p.x - x, p.z - z) > 12)) continue;
      }
      const s = 0.8 + rand() * 0.7;
      this.spawnTree(x, z, s, rand);
      placed++;
    }
    this.treeTrunk.count = placed;
    this.treeFoliage.count = this.treeFoliageCount;
    this.treeTrunk.instanceMatrix.needsUpdate = true;
    this.treeFoliage.instanceMatrix.needsUpdate = true;
    this.scene.add(this.treeTrunk, this.treeFoliage);

    // rocks
    const rockGeo = new THREE.DodecahedronGeometry(1.4, 0);
    this.rockMesh = new THREE.InstancedMesh(
      rockGeo, new THREE.MeshStandardMaterial({ color: '#7f7c72', roughness: 1, flatShading: true }), 160
    );
    this.rockMesh.castShadow = true;
    let rc = 0;
    while (rc < 150) {
      const x = (rand() - 0.5) * 1450, z = (rand() - 0.5) * 1450;
      const h = this.heightAt(x, z);
      if (h < 3 || h > 40) continue;
      const s = 0.7 + rand() * 2.1;
      const m = new THREE.Matrix4();
      m.compose(new THREE.Vector3(x, h + s * 0.4, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rand(), rand() * Math.PI, rand())), new THREE.Vector3(s, s * 0.8, s));
      this.rockMesh.setMatrixAt(rc, m);
      this.destructibles.push({ x, z, y: h, hp: 160, type: 'rock', rockIndex: rc, dead: false, respawn: 0, scale: s });
      rc++;
    }
    this.rockMesh.count = rc;
    this.rockMesh.instanceMatrix.needsUpdate = true;
    this.scene.add(this.rockMesh);

    // barrels & crates scattered
    for (let i = 0; i < 40; i++) {
      const x = (rand() - 0.5) * 1100, z = (rand() - 0.5) * 1100;
      const h = this.heightAt(x, z);
      if (h < 2.5) continue;
      if (rand() > 0.5) {
        this.addBoxGeo(x, h, z, 1.2, 1.2, 1.2, COLOR.wood, { kind: 'prop', walkable: true });
      } else {
        const bar = new THREE.CylinderGeometry(0.5, 0.5, 1.3, 10);
        bar.translate(x, h + 0.65, z);
        const key = COLOR.metal + '|';
        if (!this.buckets.has(key)) this.buckets.set(key, { color: COLOR.metal, opts: {}, geos: [] });
        this.buckets.get(key).geos.push(bar);
        this.addCollider({ x: x - 0.5, y: h, z: z - 0.5 }, { x: x + 0.5, y: h + 1.3, z: z + 0.5 }, 'prop', { walkable: false });
      }
    }
    this.endBatch();
  }

  addRock(x, z, s) {
    const h = this.heightAt(x, z);
    const mesh = new THREE.Mesh(
      new THREE.DodecahedronGeometry(s, 0),
      new THREE.MeshStandardMaterial({ color: '#7f7c72', roughness: 1, flatShading: true })
    );
    mesh.position.set(x, h + s * 0.4, z);
    mesh.castShadow = true;
    this.scene.add(mesh);
    this.addCollider({ x: x - s, y: h, z: z - s }, { x: x + s, y: h + s * 0.9, z: z + s }, 'prop', { walkable: true });
  }

  // ---------- loot & vehicles ----------
  scatterLoot(poi, rand) {
    for (let i = 0; i < 10; i++) {
      const a = rand() * Math.PI * 2, rr = Math.sqrt(rand()) * poi.radius * 0.95;
      const x = poi.x + Math.cos(a) * rr, z = poi.z + Math.sin(a) * rr;
      const s = this.supportHeight(x, z, this.heightAt(x, z) + 3);
      this.lootSpots.push({ x, y: s.height, z, tier: rand() > 0.78 ? 'chest' : 'floor' });
    }
  }

  spawnPoints(count = 40) {
    const rand = mulberry(this.seed + 31);
    const out = [];
    let guard = 0;
    while (out.length < count && guard++ < 4000) {
      const a = rand() * Math.PI * 2, r = Math.sqrt(rand()) * 640;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (this.heightAt(x, z) > 3) out.push({ x, z, y: this.heightAt(x, z) });
    }
    return out;
  }

  spawnVehicle(x, z) {
    const y = Math.max(this.heightAt(x, z), 1) + 1;
    const group = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(2.2, 0.8, 4),
      new THREE.MeshStandardMaterial({ color: '#e3c25a', roughness: 0.45, metalness: 0.5 })
    );
    body.position.y = 0.55;
    body.castShadow = true;
    group.add(body);
    const cabin = new THREE.Mesh(
      new THREE.BoxGeometry(1.7, 0.7, 1.7),
      new THREE.MeshStandardMaterial({ color: '#2a3340', roughness: 0.3, metalness: 0.4 })
    );
    cabin.position.set(0, 1.15, -0.2);
    group.add(cabin);
    const wheelGeo = new THREE.CylinderGeometry(0.45, 0.45, 0.35, 10);
    wheelGeo.rotateZ(Math.PI / 2);
    const wheelMat = new THREE.MeshStandardMaterial({ color: '#1a1d22', roughness: 0.9 });
    for (const [wx, wz] of [[-1.05, 1.3], [1.05, 1.3], [-1.05, -1.3], [1.05, -1.3]]) {
      const w = new THREE.Mesh(wheelGeo, wheelMat);
      w.position.set(wx, 0.45, wz);
      group.add(w);
    }
    group.position.set(x, y, z);
    this.scene.add(group);
    const v = { group, x, z, y, yaw: 0, speed: 0, occupant: null, radius: 1.6 };
    this.vehicles.push(v);
    return v;
  }

  updateVehicle(v, throttle, steer, brake, dt) {
    const accel = 11, maxSpeed = 17;
    if (throttle > 0.1) v.speed += accel * throttle * dt;
    else if (throttle < -0.1) v.speed += accel * throttle * 0.6 * dt;
    if (brake) v.speed *= Math.pow(0.06, dt);
    v.speed = THREE.MathUtils.clamp(v.speed, -6, maxSpeed);
    if (Math.abs(v.speed) > 0.3) v.yaw -= steer * dt * (1.4 + Math.abs(v.speed) * 0.05) * Math.sign(v.speed);
    const dx = Math.sin(v.yaw) * v.speed * dt, dz = Math.cos(v.yaw) * v.speed * dt;
    const nx = v.x + dx, nz = v.z + dz;
    if (!this.isWater(nx, nz)) { v.x = nx; v.z = nz; }
    const ground = this.supportHeight(v.x, v.z, v.y + 2).height;
    v.y += (ground + 0.1 - v.y) * Math.min(1, dt * 8);
    v.group.position.set(v.x, v.y, v.z);
    v.group.rotation.y = v.yaw;
    v.group.rotation.x = THREE.MathUtils.clamp(-v.speed * 0.012, -0.16, 0.16);
  }

  nearestVehicle(pos, maxDist = 4) {
    let best = null, bd = maxDist;
    for (const v of this.vehicles) {
      if (v.occupant) continue;
      const d = Math.hypot(v.x - pos.x, v.z - pos.z);
      if (d < bd) { bd = d; best = v; }
    }
    return best;
  }

  // ---------- destructibles ----------
  harvest(point, damage) {
    let best = null, bd = 4.2;
    for (const d of this.destructibles) {
      if (d.dead) continue;
      const dist = Math.hypot(d.x - point.x, d.z - point.z);
      if (dist < bd) { bd = dist; best = d; }
    }
    if (!best) return null;
    best.hp -= damage;
    if (best.hp <= 0) {
      best.dead = true;
      best.respawn = 45;
      if (best.type === 'tree') {
        const hidden = new THREE.Matrix4().makeScale(0, 0, 0);
        for (const fi of best.foliageIndices) this.treeFoliage.setMatrixAt(fi, hidden);
        this.treeTrunk.setMatrixAt(best.trunkIndex, hidden);
        this.treeTrunk.instanceMatrix.needsUpdate = true;
        this.treeFoliage.instanceMatrix.needsUpdate = true;
        return { type: 'tree', mats: { wood: 24 }, pos: new THREE.Vector3(best.x, best.y + 1.2, best.z) };
      }
      const hidden = new THREE.Matrix4().makeScale(0, 0, 0);
      this.rockMesh.setMatrixAt(best.rockIndex, hidden);
      this.rockMesh.instanceMatrix.needsUpdate = true;
      return { type: 'rock', mats: { brick: 20, metal: 4 }, pos: new THREE.Vector3(best.x, best.y + 1, best.z) };
    }
    return { type: best.type, mats: {}, pos: new THREE.Vector3(best.x, best.y + 1, best.z) };
  }

  // ---------- weather ----------
  setupWeather() {
    const geo = new THREE.BufferGeometry();
    const count = 2200;
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 160;
      pos[i * 3 + 1] = Math.random() * 70;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 160;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.rain = new THREE.Points(geo, new THREE.PointsMaterial({ color: '#9fd4ff', size: 0.35, transparent: true, opacity: 0.6 }));
    this.rain.visible = false;
    this.scene.add(this.rain);
    this.rainPositions = pos;
  }

  setWeather(kind) {
    this.weather = kind;
    this.rain.visible = kind === 'rain' || kind === 'snow';
    this.rain.material.size = kind === 'snow' ? 0.5 : 0.32;
    this.rain.material.color.set(kind === 'snow' ? '#eaf6ff' : '#9fd4ff');
    if (kind === 'rain') this.scene.fog.near = 160, this.scene.fog.far = 780;
    else if (kind === 'fog') this.scene.fog.near = 60, this.scene.fog.far = 420;
    else this.scene.fog.near = 260, this.scene.fog.far = 1250;
  }

  // ---------- per frame ----------
  update(dt, focus) {
    this.timeOfDay = (this.timeOfDay + dt * this.daySpeed) % 1;
    const ang = this.timeOfDay * Math.PI * 2;
    const sunY = Math.sin(ang), sunX = Math.cos(ang) * 0.7, sunZ = Math.cos(ang) * 0.45;
    const day = Math.max(0, sunY);
    const sunDir = new THREE.Vector3(sunX, Math.max(0.05, sunY), sunZ);
    this.sun.position.copy(focus).add(new THREE.Vector3(sunX, Math.max(0.08, sunY), sunZ).multiplyScalar(420));
    this.sun.target.position.copy(focus);
    this.sun.intensity = 0.25 + day * 2.3;
    const warm = new THREE.Color('#ffd7a3').lerp(new THREE.Color('#fff6e8'), day);
    this.sun.color.copy(warm);
    this.hemi.intensity = 0.2 + day * 0.75;
    this.moon.intensity = (1 - day) * 0.35;
    this.scene.fog.color.copy(new THREE.Color('#0c1424').lerp(new THREE.Color('#bfd9e8'), Math.min(1, day * 2.4)));
    if (this.sky) this.sky.setTime(this.timeOfDay, sunDir, warm);
    this.engine.renderer.setClearColor(this.scene.fog.color);

    if (this.water) {
      const t = performance.now() * 0.0005;
      this.water.material.opacity = 0.78 + Math.sin(t * 2) * 0.03;
    }
    if (this.vaultCore) {
      this.vaultCore.rotation.y += dt * 0.6;
      this.vaultCore.position.y += Math.sin(performance.now() * 0.002) * 0.002;
    }
    if (this.rain && this.rain.visible) {
      const pos = this.rainPositions;
      for (let i = 0; i < pos.length; i += 3) {
        pos[i + 1] -= dt * (this.weather === 'snow' ? 6 : 55);
        if (pos[i + 1] < -4) {
          pos[i + 1] = 60;
          pos[i] = (Math.random() - 0.5) * 160;
          pos[i + 2] = (Math.random() - 0.5) * 160;
        }
      }
      this.rain.geometry.attributes.position.needsUpdate = true;
      this.rain.position.set(focus.x, focus.y, focus.z);
    }
    for (const d of this.destructibles) {
      if (d.dead) {
        d.respawn -= dt;
        if (d.respawn <= 0) {
          const m = new THREE.Matrix4();
          m.compose(new THREE.Vector3(d.x, d.y + (d.type === 'tree' ? 2.2 * d.scale : d.scale * 0.4), d.z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.random() * 6), new THREE.Vector3(d.scale, d.scale, d.scale));
          if (d.type === 'tree') {
            this.treeTrunk.setMatrixAt(d.trunkIndex, m);
            this.treeTrunk.instanceMatrix.needsUpdate = true;
          } else {
            this.rockMesh.setMatrixAt(d.rockIndex, m);
            this.rockMesh.instanceMatrix.needsUpdate = true;
          }
          d.dead = false;
          d.hp = d.type === 'tree' ? 100 : 160;
        }
      }
    }
  }

  // ---------- minimap ----------
  buildMinimapBase() {
    const size = 512;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#16405a';
    ctx.fillRect(0, 0, size, size);
    const scale = size / 1800;
    const img = ctx.getImageData(0, 0, size, size);
    for (let py = 0; py < size; py++) {
      for (let px = 0; px < size; px++) {
        const x = (px / size - 0.5) * 1800;
        const z = (py / size - 0.5) * 1800;
        const h = this.heightAt(x, z);
        let r, g, b;
        if (h < 0) { r = 22; g = 62; b = 90; }
        else if (h < 2) { r = 214; g = 197; b = 150; }
        else if (h < 22) { r = 96; g = 138; b = 82; }
        else if (h < 38) { r = 118; g = 115; b = 104; }
        else { r = 226; g = 234; b = 240; }
        const i = (py * size + px) * 4;
        img.data[i] = r; img.data[i + 1] = g; img.data[i + 2] = b; img.data[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    this.minimapBase = canvas;
    this.minimapScale = scale;
  }

  drawMinimap(ctx, w, h, player, stormInfo, participants) {
    const span = 900;
    const scale = w / span;
    ctx.save();
    ctx.clearRect(0, 0, w, h);
    ctx.beginPath();
    ctx.arc(w / 2, h / 2, w / 2 - 2, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = '#16405a';
    ctx.fillRect(0, 0, w, h);
    const originX = w / 2 - (900 + player.pos.x) * scale;
    const originY = h / 2 - (900 + player.pos.z) * scale;
    ctx.drawImage(this.minimapBase, originX, originY, 1800 * scale, 1800 * scale);
    const toScreen = (x, z) => ({ x: w / 2 + (x - player.pos.x) * scale, y: h / 2 + (z - player.pos.z) * scale });
    // POI labels
    ctx.font = `600 ${Math.max(9, w * 0.032)}px Inter, system-ui, sans-serif`;
    ctx.textAlign = 'center';
    for (const p of this.pois) {
      const sp = toScreen(p.x, p.z);
      const px = sp.x, py = sp.y;
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.fillText(p.name, px, py);
    }
    // storm
    if (stormInfo) {
      const sc = toScreen(stormInfo.x, stormInfo.z);
      ctx.strokeStyle = '#8b6bff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(sc.x, sc.y, Math.max(1, stormInfo.radius * scale), 0, Math.PI * 2);
      ctx.stroke();
      if (stormInfo.next) {
        const nc = toScreen(stormInfo.next.x, stormInfo.next.z);
        ctx.strokeStyle = 'rgba(160,200,255,0.55)';
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.arc(nc.x, nc.y, Math.max(1, stormInfo.next.radius * scale), 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }
    // teammates
    if (participants) {
      for (const p of participants) {
        if (!p.alive || p.isPlayer) continue;
        const tp = toScreen(p.pos.x, p.pos.z);
        ctx.fillStyle = '#5ce1a0';
        ctx.beginPath();
        ctx.arc(tp.x, tp.y, 2.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    // player arrow (always centred)
    ctx.translate(w / 2, h / 2);
    ctx.rotate(-player.yaw);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(0, -6); ctx.lineTo(4, 5); ctx.lineTo(0, 2.5); ctx.lineTo(-4, 5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  dispose() {
    this.scene.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) {
        if (Array.isArray(o.material)) o.material.forEach((m) => m.dispose());
        else o.material.dispose();
      }
    });
    this.scene.clear();
  }
}
