import * as THREE from 'three';

export class InputManager {
  readonly keys = new Set<string>();
  readonly mouseDelta = new THREE.Vector2();
  yaw = 0;
  pitch = 0;
  locked = false;
  sensitivity=1;
  onFire = (_pressed: boolean) => {};
  onAds = (_pressed: boolean) => {};
  onSelectWeapon = (_index: number) => {};
  onReload = () => {};
  onJump = () => {};
  onUpgradeChoice = (_index:number) => {};
  onDebugToggle = () => {};
  onDebugPause = () => {};
  onDebugStep = () => {};
  onDebugFreeCamera = () => {};
  onDebugTeleport = () => {};
  onDebugForceState = () => {};
  onDebugSelectDrone = () => {};

  constructor(private canvas: HTMLCanvasElement) {
    document.addEventListener('pointerlockchange', () => { this.locked = document.pointerLockElement === this.canvas; if (!this.locked) this.reset(); });
    document.addEventListener('mousemove', event => {
      if (!this.locked) return;
      this.yaw -= event.movementX * 0.0018*this.sensitivity;
      this.pitch = THREE.MathUtils.clamp(this.pitch - event.movementY * 0.0018*this.sensitivity, -1.46, 1.46);
      this.mouseDelta.x += event.movementX;
      this.mouseDelta.y += event.movementY;
    });
    document.addEventListener('mousedown', event => { if (!this.locked) return; if (event.button === 0) this.onFire(true); if (event.button === 2) this.onAds(true); });
    document.addEventListener('mouseup', event => { if (event.button === 0) this.onFire(false); if (event.button === 2) this.onAds(false); });
    document.addEventListener('contextmenu', event => event.preventDefault());
    document.addEventListener('keydown', event => this.keyDown(event));
    document.addEventListener('keyup', event => this.keys.delete(event.code));
    addEventListener('blur', () => { if (document.pointerLockElement) document.exitPointerLock(); this.reset(); });
  }

  movement() {
    return new THREE.Vector3((this.keys.has('KeyD') ? 1 : 0) - (this.keys.has('KeyA') ? 1 : 0), 0, (this.keys.has('KeyW') ? 1 : 0) - (this.keys.has('KeyS') ? 1 : 0));
  }
  get sprinting() { return this.keys.has('ShiftLeft') || this.keys.has('ShiftRight'); }
  get crouching(){return this.keys.has('ControlLeft')||this.keys.has('KeyC');}
  get lean(){return(this.keys.has('KeyE')?1:0)-(this.keys.has('KeyQ')?1:0);}
  requestLock() { this.canvas.requestPointerLock(); }
  reset() { this.keys.clear(); this.onFire(false); this.onAds(false); }

  private keyDown(event: KeyboardEvent) {
    if (['F1','F2','F3','F4','F5','F6','F7','F8'].includes(event.code)) event.preventDefault();
    if (event.repeat && event.code !== 'KeyR') return;
    this.keys.add(event.code);
    if (event.code === 'Digit1') this.onSelectWeapon(0);
    if (event.code === 'Digit2') this.onSelectWeapon(1);
    if (event.code === 'Digit3') this.onSelectWeapon(2);
    if (event.code === 'Digit4') this.onSelectWeapon(3);
    if (event.code === 'Digit7') this.onUpgradeChoice(0);
    if (event.code === 'Digit8') this.onUpgradeChoice(1);
    if (event.code === 'Digit9') this.onUpgradeChoice(2);
    if (event.code === 'KeyR') this.onReload();
    if (event.code === 'Space') this.onJump();
    if (event.code === 'F1' || event.code === 'F3') this.onDebugToggle();
    if (event.code === 'F2') this.onDebugPause();
    if (event.code === 'F4') this.onDebugStep();
    if (event.code === 'F5') this.onDebugFreeCamera();
    if (event.code === 'F6') this.onDebugTeleport();
    if (event.code === 'F7') this.onDebugForceState();
    if (event.code === 'F8') this.onDebugSelectDrone();
  }
}
