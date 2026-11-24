import { settings } from './settings.js';

// Unified input: keyboard + mouse, touch joystick/buttons, and gamepad.
export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.prevKeys = new Set();
    this.mouseButtons = new Set();
    this.prevMouseButtons = new Set();
    this.lookDX = 0;
    this.lookDY = 0;
    this.moveX = 0;
    this.moveY = 0;
    this.touchMove = { x: 0, y: 0 };
    this.gamepad = null;
    this.pointerLocked = false;
    this.enabled = false;
    this.onAction = null;
    this.onPauseRequest = null;
    this.touchButtons = new Map();
    this.lookTouchId = null;
    this.lastLook = { x: 0, y: 0 };
    this.joystick = { active: false, id: null, ox: 0, oy: 0, x: 0, y: 0 };
    this.usingTouch = ('ontouchstart' in window) && window.matchMedia('(pointer: coarse)').matches;

    this._bindKeyboard();
    this._bindMouse();
    this._bindTouch();
    this._bindGamepad();

    window.addEventListener('blur', () => {
      this.keys.clear();
      this.mouseButtons.clear();
      this.touchMove.x = this.touchMove.y = 0;
    });
  }

  setEnabled(v) {
    this.enabled = v;
    if (!v) {
      this.keys.clear();
      this.mouseButtons.clear();
      this.touchMove.x = this.touchMove.y = 0;
      this.lookDX = 0;
      this.lookDY = 0;
    }
  }

  _bindKeyboard() {
    window.addEventListener('keydown', (e) => {
      if (['Tab', 'Space', 'F1', 'F2', 'F3', 'F4'].includes(e.code)) e.preventDefault();
      if (!this.enabled) return;
      if (this.keys.has(e.code)) return;
      this.keys.add(e.code);
      if (this.onAction) this.onAction('key', e.code);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
  }

  _bindMouse() {
    this.canvas.addEventListener('mousedown', (e) => {
      if (!this.enabled) return;
      if (!this.pointerLocked && e.button === 0) {
        this.requestPointerLock();
        return;
      }
      this.mouseButtons.add(e.button);
    });
    window.addEventListener('mouseup', (e) => this.mouseButtons.delete(e.button));
    window.addEventListener('mousemove', (e) => {
      if (!this.enabled || !this.pointerLocked) return;
      this.lookDX += e.movementX || 0;
      this.lookDY += e.movementY || 0;
    });
    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('pointerlockchange', () => {
      this.pointerLocked = document.pointerLockElement === this.canvas;
      if (!this.pointerLocked && this.onPauseRequest) this.onPauseRequest();
    });
    window.addEventListener('wheel', (e) => {
      if (!this.enabled || !this.pointerLocked) return;
      if (this.onAction) this.onAction('wheel', e.deltaY > 0 ? 1 : -1);
    }, { passive: true });
  }

  requestPointerLock() {
    if (this.usingTouch) return;
    const p = this.canvas.requestPointerLock?.();
    if (p && typeof p.catch === 'function') p.catch(() => {});
  }

  exitPointerLock() {
    if (document.pointerLockElement) document.exitPointerLock();
  }

  // ---- touch ----
  _bindTouch() {
    const handled = (el) => el && el.dataset && el.dataset.action;
    this.canvas.addEventListener('touchstart', (e) => {
      if (!this.enabled) return;
      for (const t of e.changedTouches) {
        if (t.clientX < window.innerWidth * 0.42 && t.clientY > window.innerHeight * 0.45) {
          if (this.joystick.id === null) {
            this.joystick.id = t.identifier;
            this.joystick.active = true;
            this.joystick.ox = t.clientX;
            this.joystick.oy = t.clientY;
            this.joystick.x = 0;
            this.joystick.y = 0;
            this.joystick.baseX = this.joystick.ox;
            this.joystick.baseY = this.joystick.oy;
            if (this.onJoystick) this.onJoystick(true, t.clientX, t.clientY, 0, 0);
          }
        } else if (this.lookTouchId === null) {
          this.lookTouchId = t.identifier;
          this.lastLook.x = t.clientX;
          this.lastLook.y = t.clientY;
        }
      }
      e.preventDefault();
    }, { passive: false });

    this.canvas.addEventListener('touchmove', (e) => {
      if (!this.enabled) return;
      for (const t of e.changedTouches) {
        if (t.identifier === this.joystick.id) {
          const dx = t.clientX - this.joystick.ox;
          const dy = t.clientY - this.joystick.oy;
          const max = 62;
          const len = Math.hypot(dx, dy) || 1;
          const cl = Math.min(1, len / max);
          this.joystick.x = (dx / len) * cl;
          this.joystick.y = (dy / len) * cl;
          if (this.onJoystick) this.onJoystick(true, this.joystick.ox, this.joystick.oy, this.joystick.x, this.joystick.y);
        } else if (t.identifier === this.lookTouchId) {
          this.lookDX += (t.clientX - this.lastLook.x) * 1.6;
          this.lookDY += (t.clientY - this.lastLook.y) * 1.6;
          this.lastLook.x = t.clientX;
          this.lastLook.y = t.clientY;
        }
      }
      e.preventDefault();
    }, { passive: false });

    const endTouch = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === this.joystick.id) {
          this.joystick.id = null;
          this.joystick.active = false;
          this.joystick.x = 0;
          this.joystick.y = 0;
          if (this.onJoystick) this.onJoystick(false, 0, 0, 0, 0);
        }
        if (t.identifier === this.lookTouchId) this.lookTouchId = null;
      }
    };
    this.canvas.addEventListener('touchend', endTouch);
    this.canvas.addEventListener('touchcancel', endTouch);
  }

  bindTouchButton(el, action) {
    const set = (on) => {
      el.classList.toggle('pressed', on);
      if (action === 'fire' || action === 'aim') {
        const key = action === 'fire' ? 'Mouse0' : 'Mouse2';
        if (on) this.mouseButtons.add(action === 'fire' ? 0 : 2);
        else this.mouseButtons.delete(action === 'fire' ? 0 : 2);
        if (on && this.onAction) this.onAction('touch', action);
        return;
      }
      if (on) {
        this.keys.add('Touch:' + action);
        if (this.onAction) this.onAction('touch', action);
      } else {
        this.keys.delete('Touch:' + action);
      }
    };
    el.addEventListener('touchstart', (e) => { e.preventDefault(); e.stopPropagation(); set(true); }, { passive: false });
    el.addEventListener('touchend', (e) => { e.preventDefault(); e.stopPropagation(); set(false); }, { passive: false });
    el.addEventListener('touchcancel', () => set(false));
    if (!this.usingTouch) {
      el.addEventListener('mousedown', (e) => { e.stopPropagation(); set(true); });
      el.addEventListener('mouseup', () => set(false));
      el.addEventListener('mouseleave', () => set(false));
    }
    this.touchButtons.set(action, el);
  }

  _bindGamepad() {
    window.addEventListener('gamepadconnected', (e) => { this.gamepad = e.gamepad; });
    window.addEventListener('gamepaddisconnected', () => { this.gamepad = null; });
  }

  pollGamepad() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    let pad = null;
    for (const p of pads) if (p && p.connected) { pad = p; break; }
    if (!pad) return null;
    this.gamepad = pad;
    const dz = settings.deadzone;
    let ax = pad.axes[0] || 0, ay = pad.axes[1] || 0;
    const mag = Math.hypot(ax, ay);
    if (mag < dz) { ax = 0; ay = 0; } else {
      const scaled = (mag - dz) / (1 - dz);
      ax = (ax / mag) * scaled;
      ay = (ay / mag) * scaled;
    }
    let rx = pad.axes[2] || 0, ry = pad.axes[3] || 0;
    if (Math.abs(rx) < dz) rx = 0;
    if (Math.abs(ry) < dz) ry = 0;
    return { pad, ax, ay, rx, ry, buttons: pad.buttons.map((b) => b.pressed || b.value > 0.4) };
  }

  update() {
    this.prevKeys = new Set(this.keys);
    this.prevMouseButtons = new Set(this.mouseButtons);

    const pad = this.pollGamepad();
    if (pad && this.enabled) {
      this.moveX = pad.ax;
      this.moveY = -pad.ay;
      const sens = settings.sensitivity.gamepad * 0.012;
      this.lookDX += pad.rx * sens * 60;
      this.lookDY += pad.ry * sens * 60;
      if (pad.buttons[0] && !this._padPrev?.[0]) this.keys.add('Pad:jump');
      if (!pad.buttons[0]) this.keys.delete('Pad:jump');
      if (pad.buttons[10] && !this._padPrev?.[10]) this.keys.add('Pad:sprint');
      if (!pad.buttons[10]) this.keys.delete('Pad:sprint');
      if (pad.buttons[11]) this.mouseButtons.add(2); else this.mouseButtons.delete(2);
      if (pad.buttons[7]) this.mouseButtons.add(0); else this.mouseButtons.delete(0);
      if (pad.buttons[2] && !this._padPrev?.[2]) { this.keys.add('Pad:reload'); setTimeout(() => this.keys.delete('Pad:reload'), 60); }
      if (pad.buttons[1] && !this._padPrev?.[1]) { this.keys.add('Pad:crouch'); setTimeout(() => this.keys.delete('Pad:crouch'), 60); }
      if (pad.buttons[3] && !this._padPrev?.[3]) { this.keys.add('Pad:build'); setTimeout(() => this.keys.delete('Pad:build'), 60); }
      if (pad.buttons[9] && !this._padPrev?.[9]) { this.keys.add('Pad:inventory'); setTimeout(() => this.keys.delete('Pad:inventory'), 60); }
      if (pad.buttons[5] && !this._padPrev?.[5]) { this.keys.add('Pad:edit'); setTimeout(() => this.keys.delete('Pad:edit'), 60); }
      if (pad.buttons[4] && !this._padPrev?.[4]) { this.keys.add('Pad:pieceNext'); setTimeout(() => this.keys.delete('Pad:pieceNext'), 60); }
      this._padPrev = pad.buttons;
    } else {
      this.moveX = this.touchMove.x;
      this.moveY = this.touchMove.y;
    }
  }

  postUpdate() {
    this.lookDX = 0;
    this.lookDY = 0;
  }

  down(action) {
    const kb = settings.keybinds[action];
    if (kb && this.keys.has(kb)) return true;
    if (this.keys.has('Touch:' + action)) return true;
    if (this.keys.has('Pad:' + action)) return true;
    if (action === 'fire' && this.mouseButtons.has(0)) return true;
    if (action === 'aim' && this.mouseButtons.has(2)) return true;
    return false;
  }

  pressed(action) {
    const kb = settings.keybinds[action];
    if (kb && this.keys.has(kb) && !this.prevKeys.has(kb)) return true;
    if (this.keys.has('Touch:' + action) && !this.prevKeys.has('Touch:' + action)) return true;
    if (this.keys.has('Pad:' + action) && !this.prevKeys.has('Pad:' + action)) return true;
    if (action === 'fire' && this.mouseButtons.has(0) && !this.prevMouseButtons.has(0)) return true;
    if (action === 'aim' && this.mouseButtons.has(2) && !this.prevMouseButtons.has(2)) return true;
    return false;
  }

  // Movement vector in local space (-1..1), already normalised.
  movement() {
    let x = (this.down('right') ? 1 : 0) - (this.down('left') ? 1 : 0);
    let y = (this.down('forward') ? 1 : 0) - (this.down('back') ? 1 : 0);
    if (Math.hypot(this.moveX, this.moveY) > 0.08) { x = this.moveX; y = this.moveY; }
    const m = Math.hypot(x, y);
    if (m > 1) { x /= m; y /= m; }
    return { x, y };
  }

  vibrate(ms) {
    if (settings.vibration && navigator.vibrate) navigator.vibrate(ms);
  }
}
