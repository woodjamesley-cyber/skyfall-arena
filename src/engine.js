import * as THREE from 'three';

// Renderer, sky, lighting and the animated main-menu diorama.
export class Engine {
  constructor(canvas) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance',
      alpha: false
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.quality = 'high';
    this.maxPixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    this.renderer.setPixelRatio(this.maxPixelRatio);
    this.renderer.setSize(window.innerWidth, window.innerHeight, false);

    this.menuScene = new THREE.Scene();
    this.menuCamera = new THREE.PerspectiveCamera(42, window.innerWidth / window.innerHeight, 0.1, 100);
    this.menuCamera.position.set(0, 2.4, 6.4);
    this.menuCamera.lookAt(0, 1.1, 0);

    this.buildMenuScene();

    this._onResize = () => this.resize();
    window.addEventListener('resize', this._onResize);
    window.addEventListener('orientationchange', this._onResize);
  }

  buildMenuScene() {
    const scene = this.menuScene;
    scene.background = new THREE.Color('#0b1220');
    scene.fog = new THREE.Fog('#0b1220', 12, 32);

    const floor = new THREE.Mesh(
      new THREE.CylinderGeometry(3.1, 3.4, 0.35, 48, 1),
      new THREE.MeshStandardMaterial({ color: '#1b2942', roughness: 0.55, metalness: 0.35 })
    );
    floor.position.y = -0.18;
    floor.receiveShadow = true;
    scene.add(floor);

    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(2.55, 0.045, 8, 64),
      new THREE.MeshStandardMaterial({ color: '#5ce1ff', emissive: '#2aa8d8', emissiveIntensity: 1.4, roughness: 0.3 })
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.02;
    scene.add(ring);

    const glow = new THREE.Mesh(
      new THREE.CircleGeometry(2.4, 48),
      new THREE.MeshBasicMaterial({ color: '#12324a', transparent: true, opacity: 0.55 })
    );
    glow.rotation.x = -Math.PI / 2;
    glow.position.y = 0.01;
    scene.add(glow);

    const backdrop = new THREE.Mesh(
      new THREE.SphereGeometry(18, 32, 16),
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        uniforms: { top: { value: new THREE.Color('#12253f') }, bottom: { value: new THREE.Color('#070b12') } },
        vertexShader: 'varying vec3 vPos; void main(){ vPos = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
        fragmentShader:
          'uniform vec3 top; uniform vec3 bottom; varying vec3 vPos; void main(){ float h = clamp(vPos.y/18.0*0.5+0.5,0.0,1.0); gl_FragColor = vec4(mix(bottom,top,pow(h,0.8)),1.0); }'
      })
    );
    scene.add(backdrop);

    const key = new THREE.DirectionalLight('#bfe8ff', 2.6);
    key.position.set(4, 7, 5);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.left = -4;
    key.shadow.camera.right = 4;
    key.shadow.camera.top = 4;
    key.shadow.camera.bottom = -4;
    scene.add(key);

    const rim = new THREE.DirectionalLight('#ff9a5c', 1.8);
    rim.position.set(-5, 3, -4);
    scene.add(rim);

    scene.add(new THREE.HemisphereLight('#8fd6ff', '#141b28', 0.9));

    const backRing = new THREE.Mesh(
      new THREE.TorusGeometry(2.9, 0.02, 6, 64),
      new THREE.MeshBasicMaterial({ color: '#ff9a5c', transparent: true, opacity: 0.5 })
    );
    backRing.position.set(0, 2.1, -1.6);
    backRing.rotation.x = Math.PI / 2.4;
    scene.add(backRing);

    this.menuPivot = new THREE.Group();
    scene.add(this.menuPivot);
    this.menuOrbit = 0;
  }

  setMenuCharacter(group) {
    if (this.menuCharacter) this.menuPivot.remove(this.menuCharacter);
    this.menuCharacter = group;
    if (group) {
      group.position.set(0, 0, 0);
      group.rotation.y = 0;
      this.menuPivot.add(group);
    }
  }

  setQuality(level) {
    this.quality = level;
    const isLow = level === 'low';
    const isMedium = level === 'medium';
    this.maxPixelRatio = Math.min(window.devicePixelRatio || 1, isLow ? 1 : isMedium ? 1.5 : 2);
    this.renderer.setPixelRatio(this.maxPixelRatio);
    this.renderer.shadowMap.type = isLow ? THREE.BasicShadowMap : isMedium ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap;
    this.renderer.shadowMap.enabled = level !== 'low';
    this.resize();
    if (this.onQualityChange) this.onQualityChange(level);
  }

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.menuCamera.aspect = w / h;
    this.menuCamera.updateProjectionMatrix();
    if (this.activeCamera) {
      this.activeCamera.aspect = w / h;
      this.activeCamera.updateProjectionMatrix();
    }
  }

  render(menu, dt) {
    if (menu) {
      this.menuOrbit += dt * 0.28;
      this.menuPivot.rotation.y = this.menuOrbit;
      const wide = window.innerWidth > 900;
      this.menuCamera.position.x = Math.sin(this.menuOrbit * 0.35) * 0.4 + (wide ? 0.2 : 0);
      this.menuCamera.lookAt(wide ? -1.35 : -0.5, 1.08, 0);
      this.renderer.render(this.menuScene, this.menuCamera);
    } else if (this.activeScene && this.activeCamera) {
      this.renderer.render(this.activeScene, this.activeCamera);
    }
  }

  dispose() {
    window.removeEventListener('resize', this._onResize);
    window.removeEventListener('orientationchange', this._onResize);
    this.renderer.dispose();
  }
}

// A soft gradient sky dome plus a fog controller, used by the match scene.
export class SkyDome {
  constructor(scene) {
    const geo = new THREE.SphereGeometry(2600, 32, 20);
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        top: { value: new THREE.Color('#3f8fd8') },
        horizon: { value: new THREE.Color('#cfe7f5') },
        bottom: { value: new THREE.Color('#7fa6bd') },
        sunDir: { value: new THREE.Vector3(0.4, 0.7, 0.2) },
        sunColor: { value: new THREE.Color('#fff2c9') },
        sunStrength: { value: 1 }
      },
      vertexShader: `varying vec3 vWorld;
        void main(){ vWorld = (modelMatrix * vec4(position,1.0)).xyz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `uniform vec3 top; uniform vec3 horizon; uniform vec3 bottom; uniform vec3 sunDir; uniform vec3 sunColor; uniform float sunStrength;
        varying vec3 vWorld;
        void main(){
          vec3 n = normalize(vWorld);
          float h = clamp(n.y*0.5+0.5,0.0,1.0);
          vec3 col = mix(bottom, horizon, smoothstep(0.0,0.52,h));
          col = mix(col, top, smoothstep(0.5,1.0,h));
          float sd = max(dot(n, normalize(sunDir)), 0.0);
          col += sunColor * pow(sd, 180.0) * 2.4 * sunStrength;
          col += sunColor * pow(sd, 9.0) * 0.16 * sunStrength;
          gl_FragColor = vec4(col, 1.0);
        }`
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
    this.uniforms = mat.uniforms;
  }

  setTime(t, sunDir, lightColor) {
    // t: 0 = dawn, 0.25 = noon, 0.5 = dusk, 0.75 = night
    const dayFactor = Math.max(0, Math.sin(t * Math.PI * 2));
    const topDay = new THREE.Color('#2f7dd1');
    const topNight = new THREE.Color('#060b18');
    const horDay = new THREE.Color('#d6ecf8');
    const horNight = new THREE.Color('#182238');
    const top = topNight.clone().lerp(topDay, dayFactor);
    const horizon = horNight.clone().lerp(horDay, Math.pow(dayFactor, 0.6));
    const bottom = horizon.clone().multiplyScalar(0.8);
    this.uniforms.top.value.copy(top);
    this.uniforms.horizon.value.copy(horizon);
    this.uniforms.bottom.value.copy(bottom);
    this.uniforms.sunDir.value.copy(sunDir).normalize();
    this.uniforms.sunColor.value.copy(lightColor);
    this.uniforms.sunStrength.value = 0.25 + dayFactor * 0.75;
  }
}
