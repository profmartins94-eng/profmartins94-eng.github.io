import * as THREE from 'three';
import type { Collider, Destructible, LevelData, MapVariant, NavNode, RampData, SpawnPoint, SurfaceType, ZoneId } from './types';

const SAND = new THREE.Color('#9c7250');
const SAND_DARK = new THREE.Color('#5d4737');

function sandTexture(seed: number, base: string) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 256, 256);
  let value = seed >>> 0;
  const random = () => ((value = (value * 1664525 + 1013904223) >>> 0) / 0xffffffff);
  for (let i = 0; i < 3600; i++) {
    const shade = Math.floor(80 + random() * 90);
    ctx.fillStyle = `rgba(${shade},${Math.floor(shade * 0.78)},${Math.floor(shade * 0.56)},${0.025 + random() * 0.065})`;
    const size = 0.5 + random() * 2.2;
    ctx.fillRect(random() * 256, random() * 256, size, size);
  }
  for (let i = 0; i < 9; i++) {
    ctx.strokeStyle = `rgba(55,38,28,${0.06 + random() * 0.08})`;
    ctx.beginPath();
    const y = random() * 256;
    ctx.moveTo(0, y);
    ctx.bezierCurveTo(70, y + random() * 14, 170, y - random() * 15, 256, y + random() * 9);
    ctx.stroke();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(2.4, 2.4);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function proceduralMaterial(base = SAND, seed = 7, roughness = 0.94) {
  return new THREE.MeshStandardMaterial({ color: '#ffffff', map: sandTexture(seed, `#${base.getHexString()}`), roughness, metalness: 0.015 });
}

export function buildLevel(variant: MapVariant = 'DESERT'): LevelData {
  const palette = {
    DESERT: { floor: '#8a6549', wall: '#9c7250', cover: '#5d4737', grid: '#735642' },
    REFINERY: { floor: '#514b43', wall: '#77695a', cover: '#343b3c', grid: '#d29a47' },
    NIGHT_LAB: { floor: '#1e2930', wall: '#3e5059', cover: '#17252c', grid: '#54c8d2' },
  }[variant];
  const group = new THREE.Group();
  group.name = `Setor 06 / ${variant}`;
  const colliders: Collider[] = [];
  const raycastMeshes: THREE.Object3D[] = [];
  const covers: THREE.Box3[] = [];
  const ramps: Collider[] = [];
  const destructibles: Destructible[] = [];

  const floorMaterial = proceduralMaterial(new THREE.Color(palette.floor), 31, variant === 'NIGHT_LAB' ? .7 : .94);
  floorMaterial.map!.repeat.set(18, 15);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(108, 92), floorMaterial);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  group.add(floor);
  raycastMeshes.push(floor);

  const laneLines = new THREE.GridHelper(108, 54, palette.grid, palette.grid);
  laneLines.position.y = 0.012;
  laneLines.material.opacity = 0.1;
  laneLines.material.transparent = true;
  group.add(laneLines);

  function block(x: number, z: number, w: number, d: number, h: number, kind: Collider['kind'] = 'wall', color = new THREE.Color(palette.wall), seed = Math.abs(Math.floor(x * 11 + z * 17))) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), proceduralMaterial(color, seed));
    mesh.position.set(x, h / 2, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    const box = new THREE.Box3().setFromObject(mesh);
    colliders.push({ box, kind });
    raycastMeshes.push(mesh);
    if (kind === 'cover') covers.push(box.clone());
    return mesh;
  }

  function destructibleBlock(id: string, x: number, z: number, w: number, d: number, h: number, health = 120) {
    const material = new THREE.MeshStandardMaterial({ color: palette.cover, roughness: .62, metalness: .34, emissive: variant === 'NIGHT_LAB' ? '#082e37' : '#000000', emissiveIntensity: .35 });
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    mesh.position.set(x, h / 2, z);
    mesh.castShadow = mesh.receiveShadow = true;
    mesh.userData.destructibleId = id;
    group.add(mesh);
    const box = new THREE.Box3().setFromObject(mesh);
    const collider: Collider = { box, kind: 'cover', id };
    colliders.push(collider);
    covers.push(box.clone());
    raycastMeshes.push(mesh);
    destructibles.push({ id, mesh, collider, health, maxHealth: health, destroyed: false });
    const brace = new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry), new THREE.LineBasicMaterial({ color: variant === 'NIGHT_LAB' ? '#5ae7f0' : '#d7a667', transparent: true, opacity: .52 }));
    mesh.add(brace);
  }

  function ladder(x: number, z: number, height: number, facing: 'x' | 'z') {
    const ladderGroup = new THREE.Group();
    const metal = new THREE.MeshStandardMaterial({ color: '#d6a84d', roughness: .32, metalness: .78 });
    const railGeo = new THREE.CylinderGeometry(.055, .055, height, 7);
    for (const offset of [-.38, .38]) {
      const rail = new THREE.Mesh(railGeo, metal);
      if (facing === 'x') rail.position.set(0, height / 2, offset); else rail.position.set(offset, height / 2, 0);
      ladderGroup.add(rail);
    }
    for (let y = .25; y < height; y += .34) {
      const rung = new THREE.Mesh(new THREE.CylinderGeometry(.035, .035, .76, 7), metal);
      rung.rotation.z = Math.PI / 2;
      rung.position.y = y;
      if (facing === 'x') rung.rotation.y = Math.PI / 2;
      ladderGroup.add(rung);
    }
    ladderGroup.position.set(x, 0, z);
    group.add(ladderGroup);
    const center = new THREE.Vector3(x, height / 2, z);
    const half = facing === 'x' ? new THREE.Vector3(.55, height / 2, .7) : new THREE.Vector3(.7, height / 2, .55);
    colliders.push({ box: new THREE.Box3(center.clone().sub(half), center.clone().add(half)), kind: 'ladder' });
  }

  function ramp(x: number, z: number, w: number, d: number, height: number, axis: 'x' | 'z', direction: 1 | -1) {
    const geometry = wedgeGeometry(w, d, height, axis, direction);
    const mesh = new THREE.Mesh(geometry, proceduralMaterial(new THREE.Color('#a97e58'), Math.floor(x * 9 + z * 13)));
    mesh.position.set(x, 0, z);
    mesh.castShadow = mesh.receiveShadow = true;
    group.add(mesh);
    raycastMeshes.push(mesh);
    const box = new THREE.Box3(new THREE.Vector3(x - w / 2, 0, z - d / 2), new THREE.Vector3(x + w / 2, height, z + d / 2));
    const rampData: RampData = { axis, direction, minHeight: 0, maxHeight: height };
    const collider: Collider = { box, kind: 'ramp', ramp: rampData };
    colliders.push(collider);
    ramps.push(collider);
  }

  // Shell and original A/Mid/B lane topology.
  block(0, -46, 108, 2, 8); block(0, 46, 108, 2, 8);
  block(-54, 0, 2, 92, 8); block(54, 0, 2, 92, 8);
  block(-30, -20, 3, 34, 5.5); block(-30, 24, 3, 26, 5.5);
  block(29, -24, 3, 26, 5.5); block(29, 19, 3, 34, 5.5);
  block(-9, -8, 24, 3, 5.2); block(8, 14, 23, 3, 5.2);
  block(-41, 2, 15, 3, 5); block(42, -2, 15, 3, 5);
  block(-17, 35, 3, 15, 5); block(18, -35, 3, 15, 5);

  block(-13, -15, 4, 4, 0.25, 'step', new THREE.Color('#b38a63'));
  block(15, 21, 4, 4, 0.25, 'step', new THREE.Color('#b38a63'));
  ramp(-23, 34, 8, 10, 2.8, 'z', -1);
  block(-23, 39.5, 8, 5, 2.8, 'wall', new THREE.Color('#79563d'));
  ramp(23, -34, 8, 10, 2.8, 'z', 1);
  block(23, -39.5, 8, 5, 2.8, 'wall', new THREE.Color('#79563d'));

  [
    [-42,-33,4,4,3],[-37,-33,4,4,5],[-18,-27,5,4,3],[-6,-30,5,5,4],
    [39,32,5,5,4],[44,27,4,4,3],[16,29,5,4,4],[4,30,4,4,3],
    [-18,4,5,5,4],[20,-7,5,5,4],[0,2,4,4,3],[-46,20,4,6,4],[46,-20,4,6,4],
    [-7,22,2.4,5,2.2],[8,-20,2.4,5,2.2]
  ].forEach(([x,z,w,d,h]) => block(x,z,w,d,h,'cover', new THREE.Color(palette.cover)));

  destructibleBlock('crate-a1', -34, -12, 3.2, 2.4, 2.5);
  destructibleBlock('crate-a2', -11, 29, 3.6, 2.2, 2.1);
  destructibleBlock('crate-mid', 6, 4, 3.4, 2.4, 2.8, 160);
  destructibleBlock('crate-b1', 34, 12, 3.2, 2.4, 2.5);
  destructibleBlock('crate-b2', 12, -28, 3.6, 2.2, 2.1);
  ladder(-27.35, 39.5, 2.8, 'z');
  ladder(27.35, -39.5, 2.8, 'z');

  if (variant === 'REFINERY') addRefineryDetails(group);
  if (variant === 'NIGHT_LAB') addLabDetails(group);

  addSector(group, -43, -36, 'A', '#e6a44f');
  addSector(group, 43, 35, 'B', '#5ad3d5');
  addSector(group, 0, 3, 'MID', '#d2c6a5', 3.2);
  addDirectionalSigns(group);
  addCanopyInstances(group);

  const navNodes = generateNav(colliders, covers);
  const spawnPoints: SpawnPoint[] = [
    [-45,-38,'A'],[-42,35,'TUNNEL'],[44,38,'B'],[45,-37,'LONG'],[-19,-39,'A'],[20,39,'B'],[-43,10,'TUNNEL'],[43,-12,'LONG'],[0,-40,'MID'],[0,40,'MID']
  ].map(([x,z,zone]) => ({ position: new THREE.Vector3(Number(x), 0, Number(z)), zone: zone as ZoneId }));
  const ammoPoints = [new THREE.Vector3(-43,0,-28),new THREE.Vector3(43,0,26),new THREE.Vector3(-4,0,35),new THREE.Vector3(4,0,-35)];

  for (const p of ammoPoints) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1.1,.55,.8), new THREE.MeshStandardMaterial({color:'#315f5d',emissive:'#2c9e97',emissiveIntensity:.45,roughness:.55,metalness:.4}));
    mesh.position.copy(p).add(new THREE.Vector3(0,.3,0));
    mesh.name = 'ammo';
    group.add(mesh);
  }

  const floorHeightAt = (x: number, z: number) => {
    let result = 0;
    for (const collider of ramps) {
      if (!collider.ramp || x < collider.box.min.x || x > collider.box.max.x || z < collider.box.min.z || z > collider.box.max.z) continue;
      const { axis, direction, minHeight, maxHeight } = collider.ramp;
      const min = axis === 'x' ? collider.box.min.x : collider.box.min.z;
      const max = axis === 'x' ? collider.box.max.x : collider.box.max.z;
      const value = axis === 'x' ? x : z;
      let t = (value - min) / (max - min);
      if (direction < 0) t = 1 - t;
      result = Math.max(result, THREE.MathUtils.lerp(minHeight, maxHeight, THREE.MathUtils.clamp(t, 0, 1)));
    }
    return result;
  };

  const surfaceAt = (x: number, z: number): SurfaceType => {
    if (variant === 'NIGHT_LAB') return 'metal';
    if (variant === 'REFINERY' || Math.abs(x) > 31 || Math.abs(z) > 37) return 'stone';
    return 'sand';
  };

  const damageDestructible = (hit: THREE.Object3D, damage: number) => {
    let object: THREE.Object3D | null = hit;
    while (object && !object.userData.destructibleId) object = object.parent;
    const item = destructibles.find(candidate => candidate.id === object?.userData.destructibleId);
    if (!item || item.destroyed) return false;
    item.health -= damage;
    const material = item.mesh.material as THREE.MeshStandardMaterial;
    material.emissive.set(item.health < item.maxHealth * .45 ? '#8b2c16' : variant === 'NIGHT_LAB' ? '#082e37' : '#000000');
    material.emissiveIntensity = item.health < item.maxHealth * .45 ? .9 : .35;
    if (item.health > 0) return true;
    item.destroyed = true;
    item.mesh.visible = false;
    const colliderIndex = colliders.indexOf(item.collider);
    if (colliderIndex >= 0) colliders.splice(colliderIndex, 1);
    const rayIndex = raycastMeshes.indexOf(item.mesh);
    if (rayIndex >= 0) raycastMeshes.splice(rayIndex, 1);
    const coverIndex = covers.findIndex(box => box.equals(item.collider.box));
    if (coverIndex >= 0) covers.splice(coverIndex, 1);
    const recalculated=generateNav(colliders,covers);navNodes.splice(0,navNodes.length,...recalculated);
    return true;
  };

  return {
    group, colliders, raycastMeshes, covers, navNodes, spawnPoints, ammoPoints,
    objectivePoints: { A: new THREE.Vector3(-43, 0, -36), B: new THREE.Vector3(43, 0, 35) },
    destructibles, variant, floorHeightAt, surfaceAt, damageDestructible,
  };
}

function wedgeGeometry(w: number, d: number, h: number, axis: 'x' | 'z', direction: 1 | -1) {
  const low = direction > 0 ? -1 : 1;
  const high = -low;
  const coordinates = axis === 'z'
    ? [[-w/2,0,low*d/2],[w/2,0,low*d/2],[-w/2,h,high*d/2],[w/2,h,high*d/2],[-w/2,0,high*d/2],[w/2,0,high*d/2]]
    : [[low*w/2,0,-d/2],[low*w/2,0,d/2],[high*w/2,h,-d/2],[high*w/2,h,d/2],[high*w/2,0,-d/2],[high*w/2,0,d/2]];
  const indices = [0,1,3,0,3,2, 0,4,5,0,5,1, 2,3,5,2,5,4, 0,2,4, 1,5,3];
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(coordinates.flat(), 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  return geometry;
}

function addSector(group: THREE.Group, x: number, z: number, label: string, color: string, radius = 5) {
  const ring = new THREE.Mesh(new THREE.RingGeometry(radius - .5, radius, 48), new THREE.MeshBasicMaterial({color, transparent:true, opacity:.42, side:THREE.DoubleSide}));
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(x,.03,z);
  group.add(ring);
  const light = new THREE.PointLight(color, label === 'MID' ? 14 : 24, 17, 2);
  light.position.set(x, 3.5, z);
  group.add(light);
  const sprite = textSprite(label, color, label === 'MID' ? 256 : 128);
  sprite.position.set(x, 7, z);
  sprite.scale.set(label === 'MID' ? 5.4 : 3, 3, 1);
  group.add(sprite);
}

function textSprite(text: string, color: string, width = 256) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = color;
  ctx.font = `bold ${text.length > 1 ? 54 : 92}px Bahnschrift, monospace`;
  ctx.textAlign = 'center';
  ctx.fillText(text, width / 2, 92);
  return new THREE.Sprite(new THREE.SpriteMaterial({map:new THREE.CanvasTexture(canvas),transparent:true,depthWrite:false}));
}

function addDirectionalSigns(group: THREE.Group) {
  for (const [x,z,text,color] of [[-22,8,'A  ←','#e6a44f'],[21,-12,'→  B','#5ad3d5'],[0,27,'MID  ↓','#d2c6a5']] as const) {
    const sprite = textSprite(text,color,256);
    sprite.position.set(x,3.1,z);
    sprite.scale.set(5,2.5,1);
    group.add(sprite);
  }
}

function addCanopyInstances(group: THREE.Group) {
  const geometry = new THREE.CylinderGeometry(.14,.2,4,7);
  const material = new THREE.MeshStandardMaterial({color:'#4c4035',roughness:.8,metalness:.2});
  const mesh = new THREE.InstancedMesh(geometry, material, 12);
  const matrix = new THREE.Matrix4();
  const points = [[-49,-41],[-43,-41],[-37,-41],[37,41],[43,41],[49,41],[-49,31],[-49,37],[49,-31],[49,-37],[-24,43],[24,-43]];
  points.forEach(([x,z],i)=>{matrix.makeTranslation(x,2,z);mesh.setMatrixAt(i,matrix);});
  mesh.castShadow = true;
  group.add(mesh);
}

function addRefineryDetails(group: THREE.Group) {
  const metal = new THREE.MeshStandardMaterial({ color: '#6c7780', roughness: .35, metalness: .82 });
  const hot = new THREE.MeshStandardMaterial({ color: '#251b13', emissive: '#e17a22', emissiveIntensity: 1.8, roughness: .42, metalness: .55 });
  for (const [x, z, height] of [[-47, -5, 8], [47, 7, 10], [-35, 41, 6], [35, -41, 6]] as const) {
    const tank = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.2, height, 18), metal);
    tank.position.set(x, height / 2, z);
    tank.castShadow = true;
    group.add(tank);
    const band = new THREE.Mesh(new THREE.TorusGeometry(2.23, .09, 8, 24), hot);
    band.rotation.x = Math.PI / 2;
    band.position.set(x, height * .72, z);
    group.add(band);
  }
}

function addLabDetails(group: THREE.Group) {
  const panelMaterial = new THREE.MeshStandardMaterial({ color: '#12242b', emissive: '#19aab6', emissiveIntensity: 1.35, roughness: .24, metalness: .58 });
  for (const [x, z, rotation] of [[-52, -20, Math.PI / 2], [-52, 20, Math.PI / 2], [52, -20, -Math.PI / 2], [52, 20, -Math.PI / 2]] as const) {
    const panel = new THREE.Mesh(new THREE.BoxGeometry(3.2, .12, .6), panelMaterial);
    panel.rotation.z = rotation;
    panel.position.set(x, 3.3, z);
    group.add(panel);
    const light = new THREE.PointLight('#45eaf2', 7, 10, 2);
    light.position.set(x, 3.3, z);
    group.add(light);
  }
}

function zoneAt(x: number, z: number): ZoneId {
  if (x < -30 && z < -15) return 'A';
  if (x > 30 && z > 14) return 'B';
  if (x < -30) return 'TUNNEL';
  if (x > 30) return 'LONG';
  return 'MID';
}

function pointBlocked(x: number, z: number, colliders: Collider[], padding = 1.2) {
  return colliders.some(({box,kind}) => kind !== 'step' && kind !== 'ramp' && kind !== 'ladder' && x > box.min.x-padding && x < box.max.x+padding && z > box.min.z-padding && z < box.max.z+padding);
}

function generateNav(colliders: Collider[], covers: THREE.Box3[]): NavNode[] {
  const nodes: NavNode[] = [];
  const byCell = new Map<string, number>();
  const step = 3.5;
  for (let zi=0,z=-42; z<=42; z+=step,zi++) for (let xi=0,x=-49; x<=49; x+=step,xi++) {
    if (pointBlocked(x,z,colliders)) continue;
    const nearCover = covers.some(box => box.distanceToPoint(new THREE.Vector3(x,1,z)) < 3.5);
    const exposure = nearCover ? 0.15 : zoneAt(x,z)==='MID' ? 1 : .62;
    const id=nodes.length;
    nodes.push({id,pos:new THREE.Vector3(x,0,z),links:[],exposure,zone:zoneAt(x,z)});
    byCell.set(`${xi},${zi}`,id);
  }
  const width = Math.floor((49 - (-49)) / step) + 1;
  for (const node of nodes) {
    const xi=Math.round((node.pos.x+49)/step),zi=Math.round((node.pos.z+42)/step);
    for (const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]]) {
      const id=byCell.get(`${xi+dx},${zi+dz}`);
      if(id!==undefined&&!pointBlocked(node.pos.x+dx*step*.5,node.pos.z+dz*step*.5,colliders,.72))node.links.push(id);
    }
    void width;
  }
  return nodes;
}

export function hasClearPath(a: THREE.Vector3, b: THREE.Vector3, colliders: Collider[], padding=.8) {
  const distance=a.distanceTo(b),steps=Math.ceil(distance/1.1);
  for(let i=1;i<steps;i++){const t=i/steps;if(pointBlocked(THREE.MathUtils.lerp(a.x,b.x,t),THREE.MathUtils.lerp(a.z,b.z,t),colliders,padding))return false;}
  return true;
}

export function findPath(start: THREE.Vector3, goal: THREE.Vector3, level: LevelData, exposureWeight=.35): THREE.Vector3[] {
  const nodes=level.navNodes;
  if(!nodes.length)return[start.clone(),goal.clone()];
  const nearest=(p:THREE.Vector3)=>nodes.reduce((best,n)=>n.pos.distanceToSquared(p)<best.pos.distanceToSquared(p)?n:best,nodes[0]);
  const s=nearest(start),g=nearest(goal),open=[s.id],came=new Map<number,number>(),score=new Map<number,number>([[s.id,0]]),estimate=new Map<number,number>([[s.id,s.pos.distanceTo(g.pos)]]);
  while(open.length){open.sort((a,b)=>(estimate.get(a)??Infinity)-(estimate.get(b)??Infinity));const current=open.shift()!;if(current===g.id)break;for(const next of nodes[current].links){const node=nodes[next];const cost=nodes[current].pos.distanceTo(node.pos)*(1+node.exposure*exposureWeight);const tentative=(score.get(current)??Infinity)+cost;if(tentative<(score.get(next)??Infinity)){came.set(next,current);score.set(next,tentative);estimate.set(next,tentative+node.pos.distanceTo(g.pos));if(!open.includes(next))open.push(next);}}}
  const raw:THREE.Vector3[]=[goal.clone()];let current=g.id;while(current!==s.id&&came.has(current)){raw.push(nodes[current].pos.clone());current=came.get(current)!;}raw.push(start.clone());raw.reverse();
  const smooth=[raw[0]];let anchor=0;while(anchor<raw.length-1){let far=raw.length-1;while(far>anchor+1&&!hasClearPath(raw[anchor],raw[far],level.colliders))far--;smooth.push(raw[far]);anchor=far;}
  return smooth;
}
