import * as THREE from 'three';
import type { Collider } from './types';

const EPSILON = 0.0015;

export interface SweepHit {
  time: number;
  normal: THREE.Vector3;
}

/** Continuous 2D sweep against an expanded AABB. Exported for acceptance tests. */
export function sweepCircleAabb(
  start: THREE.Vector2,
  delta: THREE.Vector2,
  radius: number,
  box: THREE.Box3,
): SweepHit | null {
  const minX = box.min.x - radius;
  const maxX = box.max.x + radius;
  const minZ = box.min.z - radius;
  const maxZ = box.max.z + radius;
  let near = -Infinity;
  let far = Infinity;
  const normal = new THREE.Vector3();

  for (const axis of ['x', 'y'] as const) {
    const origin = axis === 'x' ? start.x : start.y;
    const movement = axis === 'x' ? delta.x : delta.y;
    const minimum = axis === 'x' ? minX : minZ;
    const maximum = axis === 'x' ? maxX : maxZ;
    if (Math.abs(movement) < 1e-9) {
      if (origin < minimum || origin > maximum) return null;
      continue;
    }
    let t1 = (minimum - origin) / movement;
    let t2 = (maximum - origin) / movement;
    let sign = -Math.sign(movement);
    if (t1 > t2) { [t1, t2] = [t2, t1]; sign *= -1; }
    if (t1 > near) {
      near = t1;
      normal.set(axis === 'x' ? sign : 0, 0, axis === 'y' ? sign : 0);
    }
    far = Math.min(far, t2);
    if (near > far) return null;
  }
  if (near < 0 || near > 1) return null;
  return { time: near, normal };
}

export function rampHeight(collider: Collider, x: number, z: number): number | null {
  if (!collider.ramp || x < collider.box.min.x || x > collider.box.max.x || z < collider.box.min.z || z > collider.box.max.z) return null;
  const { axis, direction, minHeight, maxHeight } = collider.ramp;
  const min = axis === 'x' ? collider.box.min.x : collider.box.min.z;
  const max = axis === 'x' ? collider.box.max.x : collider.box.max.z;
  const value = axis === 'x' ? x : z;
  let t = THREE.MathUtils.clamp((value - min) / Math.max(0.001, max - min), 0, 1);
  if (direction < 0) t = 1 - t;
  return THREE.MathUtils.lerp(minHeight, maxHeight, t);
}

export class PlayerController {
  position = new THREE.Vector3(0, 0, 34);
  velocity = new THREE.Vector3();
  radius = 0.48;
  height = 1.78;
  eyeHeight = 1.62;
  grounded = true;
  onRamp = false;
  crouched = false;
  sliding = false;
  onLadder = false;
  onFallDamage = (_amount:number) => {};
  contactNormals: THREE.Vector3[] = [];
  physicsSubsteps = 0;
  private stepHeight = 0.3;
  private slideTimer=0;
  private lastYaw=0;
  private lastColliders:Collider[]=[];

  update(dt: number, input: THREE.Vector3, yaw: number, sprint: boolean, colliders: Collider[], crouch=false) {
    this.lastYaw=yaw;this.lastColliders=colliders;
    const wasGrounded=this.grounded,impactSpeed=Math.max(0,-this.velocity.y);
    this.crouched=crouch;
    if(crouch&&sprint&&this.grounded&&!this.sliding&&Math.hypot(this.velocity.x,this.velocity.z)>4){this.sliding=true;this.slideTimer=.72;}
    if(this.sliding){this.slideTimer-=dt;if(this.slideTimer<=0||!crouch)this.sliding=false;}
    this.height=THREE.MathUtils.damp(this.height,crouch?.98:1.78,18,dt);this.eyeHeight=THREE.MathUtils.damp(this.eyeHeight,crouch?.84:1.62,18,dt);
    const forward = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
    const right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
    const desired = forward.multiplyScalar(input.z).add(right.multiplyScalar(input.x));
    if (desired.lengthSq() > 1) desired.normalize();
    desired.multiplyScalar(this.sliding?9.2:crouch?3.25:sprint ? 8.2 : 5.4);
    const acceleration = this.grounded ? 18 : 6;
    this.velocity.x = THREE.MathUtils.damp(this.velocity.x, desired.x, acceleration, dt);
    this.velocity.z = THREE.MathUtils.damp(this.velocity.z, desired.z, acceleration, dt);
    const ladder=colliders.find(collider=>collider.kind==='ladder'&&circleOverlaps(this.position.x,this.position.z,this.radius+.28,collider.box)&&this.position.y<collider.box.max.y+.4);
    this.onLadder=!!ladder&&Math.abs(input.z)>.1;
    if(this.onLadder){this.velocity.y=input.z*3.8;this.position.y=THREE.MathUtils.clamp(this.position.y,0,ladder!.box.max.y+.12);}
    else if (!this.grounded) this.velocity.y -= 19 * dt;
    this.contactNormals.length = 0;

    const horizontalTravel = Math.hypot(this.velocity.x, this.velocity.z) * dt;
    this.physicsSubsteps = Math.max(1, Math.ceil(horizontalTravel / (this.radius * 0.35)));
    const slice = dt / this.physicsSubsteps;
    for (let i = 0; i < this.physicsSubsteps; i++) this.sweepSlice(slice, colliders);

    const support = this.supportHeight(colliders, this.position.x, this.position.z);
    this.onRamp = support.ramp;
    this.grounded = this.position.y <= support.height + 0.025 && this.velocity.y <= 0;
    if (this.grounded) {
      this.position.y = support.height;
      this.velocity.y = 0;
    }
    if(!wasGrounded&&this.grounded&&impactSpeed>11)this.onFallDamage((impactSpeed-10.5)*4.2);
  }

  jump() {
    if(!this.grounded)return;
    const forward=new THREE.Vector3(-Math.sin(this.lastYaw),0,-Math.cos(this.lastYaw));
    const probe=this.position.clone().addScaledVector(forward,1);
    const vault=this.lastColliders.find(collider=>collider.kind==='cover'&&collider.box.max.y-this.position.y<1.22&&collider.box.max.y>this.position.y+.35&&circleOverlaps(probe.x,probe.z,.5,collider.box));
    if(vault){this.position.addScaledVector(forward,1.65);this.position.y=vault.box.max.y+.03;this.velocity.copy(forward).multiplyScalar(4.8);this.velocity.y=2.2;this.grounded=false;return;}
    this.velocity.y = 7; this.grounded = false;
  }

  teleport(position: THREE.Vector3) {
    this.position.copy(position);
    this.velocity.set(0, 0, 0);
  }

  private sweepSlice(dt: number, colliders: Collider[]) {
    const start = this.position.clone();
    const delta = this.velocity.clone().multiplyScalar(dt);
    this.position.y += delta.y;
    if (this.position.y < 0) this.position.y = 0;

    const futureX = start.x + delta.x;
    const futureZ = start.z + delta.z;
    const support = this.supportHeight(colliders, futureX, futureZ);
    if (this.grounded && support.height > this.position.y && support.height - this.position.y <= this.stepHeight + EPSILON) {
      this.position.y = support.height;
    }

    let remaining = new THREE.Vector2(delta.x, delta.z);
    for (let iteration = 0; iteration < 4 && remaining.lengthSq() > 1e-10; iteration++) {
      let earliest: SweepHit | null = null;
      for (const collider of colliders) {
        if (collider.kind === 'ramp'||collider.kind==='ladder') continue;
        if (collider.box.max.y <= this.position.y + EPSILON || collider.box.min.y >= this.position.y + this.height) continue;
        const hit = sweepCircleAabb(new THREE.Vector2(this.position.x, this.position.z), remaining, this.radius, collider.box);
        if (hit && (!earliest || hit.time < earliest.time)) earliest = hit;
      }
      if (!earliest) {
        this.position.x += remaining.x;
        this.position.z += remaining.y;
        break;
      }
      const travel = Math.max(0, earliest.time - EPSILON);
      this.position.x += remaining.x * travel;
      this.position.z += remaining.y * travel;
      this.contactNormals.push(earliest.normal.clone());
      const leftover = remaining.multiplyScalar(1 - travel);
      const dot = leftover.x * earliest.normal.x + leftover.y * earliest.normal.z;
      leftover.x -= earliest.normal.x * dot;
      leftover.y -= earliest.normal.z * dot;
      const velocityDot = this.velocity.x * earliest.normal.x + this.velocity.z * earliest.normal.z;
      if (velocityDot < 0) {
        this.velocity.x -= earliest.normal.x * velocityDot;
        this.velocity.z -= earliest.normal.z * velocityDot;
      }
      remaining = leftover;
    }
  }

  private supportHeight(colliders: Collider[], x: number, z: number) {
    let height = 0;
    let ramp = false;
    for (const collider of colliders) {
      if(collider.kind==='ladder')continue;
      if (collider.kind === 'ramp') {
        const value = rampHeight(collider, x, z);
        if (value !== null && value <= this.position.y + this.stepHeight + 0.12 && value >= height) { height = value; ramp = true; }
        continue;
      }
      if (collider.box.max.y > height && collider.box.max.y <= this.position.y + this.stepHeight + 0.03 && circleOverlaps(x, z, this.radius * 0.72, collider.box)) {
        height = collider.box.max.y;
        ramp = false;
      }
    }
    return { height, ramp };
  }
}

function circleOverlaps(x: number, z: number, radius: number, box: THREE.Box3) {
  const nearestX = THREE.MathUtils.clamp(x, box.min.x, box.max.x);
  const nearestZ = THREE.MathUtils.clamp(z, box.min.z, box.max.z);
  return (x - nearestX) ** 2 + (z - nearestZ) ** 2 < radius ** 2;
}
