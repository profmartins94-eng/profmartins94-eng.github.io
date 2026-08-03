import * as THREE from 'three';
import type { DamageZone, LevelData, SoundEvent, WeaponSpec } from './types';
import type { ProgressionSystem } from './progression';
import type { Drone, DroneDirector } from './ai';
import { SynthAudio } from './audio';

export const WEAPON_SPECS:WeaponSpec[]=[
  {id:0,name:'AR-6 SENTINEL',short:'AUTO',magSize:30,fireRate:10,damage:18,spread:.011,adsSpread:.003,reload:1.75,type:'hitscan'},
  {id:1,name:'ARC LANCER',short:'ARC',magSize:5,fireRate:1,damage:78,spread:.004,adsSpread:.001,reload:2.1,type:'charged'},
  {id:2,name:'K-12 BREACH',short:'BREACH',magSize:8,fireRate:1.25,damage:15,spread:.075,adsSpread:.045,reload:2.45,type:'shotgun'},
  {id:3,name:'M-90 WIDOW',short:'WIDOW',magSize:5,fireRate:.62,damage:1600,spread:.035,adsSpread:.00015,reload:2.8,type:'sniper'}
];

interface Projectile { mesh:THREE.Mesh; velocity:THREE.Vector3; life:number; active:boolean; }
interface Particle { mesh:THREE.Mesh; velocity:THREE.Vector3; life:number; active:boolean; }
interface Decal { mesh:THREE.Mesh; life:number; active:boolean; }
interface Casing { mesh:THREE.Mesh; velocity:THREE.Vector3; life:number; active:boolean; }

export class WeaponSystem {
  current=0; mags=[30,5,8,5]; reserves=[120,20,32,20];
  ads=false; trigger=false; charging=false; charge=0; reloading=false; reloadStage='';boltTimer=0;
  holdingBreath=false;scopeDistance=0;
  shots=0;hits=0; lastShot=0; recoilIndex=0; recoilPitch=0; recoilYaw=0; currentSpread=.01;
  model=new THREE.Group(); muzzle=new THREE.Object3D();
  projectiles:Projectile[]=[]; particles:Particle[]=[]; decals:Decal[]=[];casings:Casing[]=[];
  lastRay:{start:THREE.Vector3;end:THREE.Vector3}|null=null;
  onSound:(event:SoundEvent)=>void=()=>{};
  onHit:(_critical:boolean)=>void=()=>{};
  onShot:()=>void=()=>{};
  onKill:(_drone:Drone,_critical:boolean)=>void=()=>{};
  onShake:(amount:number)=>void=()=>{};
  onHud:()=>void=()=>{};
  onTracer:(_a:THREE.Vector3,_b:THREE.Vector3,_color:string)=>void=()=>{};
  private reloadTimer=0; private sway=new THREE.Vector2(); private swayVelocity=new THREE.Vector2();private chargeAudioTimer=0;
  private damageMultiplier=1;private fireRateMultiplier=1;private magMultiplier=1;private reloadMultiplier=1;private arcRadiusMultiplier=1;private sniperPenetration=0;private incendiary=false;
  private bodyMaterial!:THREE.MeshStandardMaterial;private accentMaterial!:THREE.MeshStandardMaterial;private lensMaterial!:THREE.MeshStandardMaterial;
  private muzzleFlash:THREE.Mesh;private muzzleLight:THREE.PointLight;private muzzleLife=0;
  private scene:THREE.Scene; private audio:SynthAudio;

  constructor(scene:THREE.Scene,audio:SynthAudio){
    this.scene=scene;this.audio=audio;this.buildModel();
    this.muzzleFlash=new THREE.Mesh(new THREE.ConeGeometry(.11,.35,6),new THREE.MeshBasicMaterial({color:'#ffd68b',transparent:true,opacity:.9,depthWrite:false}));this.muzzleFlash.rotation.x=-Math.PI/2;this.muzzleFlash.position.z=-.18;this.muzzleFlash.visible=false;this.muzzle.add(this.muzzleFlash);
    this.muzzleLight=new THREE.PointLight('#ffbd61',0,4,2);this.muzzle.add(this.muzzleLight);
    const pGeo=new THREE.SphereGeometry(.12,8,8),pMat=new THREE.MeshBasicMaterial({color:'#ffb94a'});
    for(let i=0;i<8;i++){const mesh=new THREE.Mesh(pGeo,pMat);mesh.visible=false;scene.add(mesh);this.projectiles.push({mesh,velocity:new THREE.Vector3(),life:0,active:false});}
    const sparkGeo=new THREE.BoxGeometry(.025,.025,.2),sparkMat=new THREE.MeshBasicMaterial({color:'#ffd782'});
    for(let i=0;i<96;i++){const mesh=new THREE.Mesh(sparkGeo,sparkMat);mesh.visible=false;scene.add(mesh);this.particles.push({mesh,velocity:new THREE.Vector3(),life:0,active:false});}
    const dGeo=new THREE.CircleGeometry(.055,10),dMat=new THREE.MeshBasicMaterial({color:'#29231f',transparent:true,opacity:.72,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2});
    for(let i=0;i<48;i++){const mesh=new THREE.Mesh(dGeo,dMat.clone());mesh.visible=false;scene.add(mesh);this.decals.push({mesh,life:0,active:false});}
    const casingGeo=new THREE.CylinderGeometry(.025,.025,.11,6),casingMat=new THREE.MeshStandardMaterial({color:'#a27b35',metalness:.8,roughness:.3});
    for(let i=0;i<28;i++){const mesh=new THREE.Mesh(casingGeo,casingMat);mesh.visible=false;scene.add(mesh);this.casings.push({mesh,velocity:new THREE.Vector3(),life:0,active:false});}
    this.refreshModel();
  }

  private buildModel(){
    this.bodyMaterial=new THREE.MeshStandardMaterial({color:'#242925',emissive:'#0c1212',emissiveIntensity:.32,roughness:.42,metalness:.7});this.accentMaterial=new THREE.MeshStandardMaterial({color:'#b48147',emissive:'#301806',emissiveIntensity:.45,roughness:.42,metalness:.52});this.lensMaterial=new THREE.MeshStandardMaterial({color:'#7ed1c8',emissive:'#143a37',emissiveIntensity:1.2,metalness:.65,roughness:.2});
    const body=new THREE.Mesh(new THREE.BoxGeometry(.16,.18,.72),this.bodyMaterial);body.position.set(.28,-.25,-.62);this.model.add(body);
    const topRail=new THREE.Mesh(new THREE.BoxGeometry(.14,.025,.58),this.accentMaterial);topRail.position.set(.28,-.145,-.68);topRail.name='weapon-color-rail';this.model.add(topRail);
    const barrel=new THREE.Mesh(new THREE.CylinderGeometry(.035,.045,.55,10),this.bodyMaterial);barrel.rotation.x=Math.PI/2;barrel.position.set(.28,-.2,-1.19);this.model.add(barrel);
    const muzzleBand=new THREE.Mesh(new THREE.CylinderGeometry(.052,.052,.06,10),this.accentMaterial);muzzleBand.rotation.x=Math.PI/2;muzzleBand.position.set(.28,-.2,-1.34);this.model.add(muzzleBand);
    const mag=new THREE.Mesh(new THREE.BoxGeometry(.11,.31,.18),this.accentMaterial);mag.position.set(.27,-.43,-.52);mag.rotation.x=-.15;mag.name='magazine';this.model.add(mag);
    const scope=new THREE.Group();scope.name='sniper-scope';const tube=new THREE.Mesh(new THREE.CylinderGeometry(.075,.075,.34,12),this.bodyMaterial);tube.rotation.x=Math.PI/2;tube.position.set(.28,-.08,-.66);scope.add(tube);const lens=new THREE.Mesh(new THREE.CircleGeometry(.066,12),this.lensMaterial);lens.position.set(.28,-.08,-.835);scope.add(lens);scope.visible=false;this.model.add(scope);
    const coil=new THREE.Mesh(new THREE.TorusGeometry(.09,.018,7,18),this.accentMaterial);coil.rotation.x=Math.PI/2;coil.position.set(.28,-.2,-1.05);coil.name='arc-coil';coil.visible=false;this.model.add(coil);
    const pump=new THREE.Mesh(new THREE.BoxGeometry(.2,.12,.28),this.accentMaterial);pump.position.set(.28,-.31,-.94);pump.name='shotgun-pump';pump.visible=false;this.model.add(pump);
    const bolt=new THREE.Mesh(new THREE.CylinderGeometry(.018,.018,.16,7),this.accentMaterial);bolt.rotation.z=Math.PI/2;bolt.position.set(.39,-.12,-.58);bolt.name='sniper-bolt';bolt.visible=false;this.model.add(bolt);
    this.muzzle.position.set(.28,-.2,-1.5);this.model.add(this.muzzle);this.model.renderOrder=10;
  }

  select(index:number){if(index<0||index>3||this.reloading)return;this.current=index;this.recoilIndex=0;this.charge=0;this.charging=false;this.refreshModel();this.onHud();}
  private refreshModel(){const colors=[['#33464c','#d4a04e','#6ee8ff'],['#29345d','#55d6ff','#8af5ff'],['#59362d','#ff6c3b','#ffc152'],['#293747','#d9ecff','#73e6ff']] as const;const [body,accent,lens]=colors[this.current];this.bodyMaterial.color.set(body);this.bodyMaterial.emissive.set(body);this.bodyMaterial.emissiveIntensity=.16;this.accentMaterial.color.set(accent);this.accentMaterial.emissive.set(accent);this.accentMaterial.emissiveIntensity=.24;this.lensMaterial.color.set(lens);this.lensMaterial.emissive.set(lens);const s=this.current===2?1.15:this.current===1?.9:this.current===3?1.18:1;this.model.scale.setScalar(s);this.model.rotation.z=this.current===1?.06:0;for(const [name,index] of [['sniper-scope',3],['arc-coil',1],['shotgun-pump',2],['sniper-bolt',3]] as const){const object=this.model.getObjectByName(name);if(object)object.visible=this.current===index;}}

  applyProgression(progression:ProgressionSystem){this.damageMultiplier=progression.damageMultiplier;this.fireRateMultiplier=progression.fireRateMultiplier;this.magMultiplier=progression.magMultiplier;this.reloadMultiplier=progression.reloadMultiplier;this.arcRadiusMultiplier=progression.arcRadiusMultiplier;this.sniperPenetration=progression.sniperPenetration;this.incendiary=progression.incendiary;for(let i=0;i<this.mags.length;i++)this.mags[i]=Math.min(this.effectiveMagSize(i),this.mags[i]+Math.max(0,this.effectiveMagSize(i)-WEAPON_SPECS[i].magSize));this.onHud();}
  effectiveMagSize(index=this.current){return Math.ceil(WEAPON_SPECS[index].magSize*this.magMultiplier);}

  update(dt:number,now:number,camera:THREE.PerspectiveCamera,level:LevelData,director:DroneDirector,mouseDelta:THREE.Vector2){
    const spec=WEAPON_SPECS[this.current];const breath=this.current===3&&this.ads&&this.holdingBreath;this.currentSpread=THREE.MathUtils.damp(this.currentSpread,this.ads?spec.adsSpread:spec.spread,breath?24:15,dt);
    if(this.boltTimer>0){this.boltTimer=Math.max(0,this.boltTimer-dt);const bolt=this.model.getObjectByName('sniper-bolt');if(bolt)bolt.position.z=-.58+Math.sin((1-this.boltTimer/.52)*Math.PI)*.16;if(this.boltTimer===0)this.reloadStage='';}
    this.recoilPitch=THREE.MathUtils.damp(this.recoilPitch,0,9,dt);this.recoilYaw=THREE.MathUtils.damp(this.recoilYaw,0,9,dt);
    const swayScale=breath?.17:1;this.swayVelocity.x+=(-mouseDelta.x*.0006*swayScale-this.sway.x)*22*dt;this.swayVelocity.y+=(-mouseDelta.y*.0006*swayScale-this.sway.y)*22*dt;this.swayVelocity.multiplyScalar(Math.exp(-8*dt));this.sway.addScaledVector(this.swayVelocity,dt);
    this.model.position.set(this.sway.x,this.ads ? -.11 : 0,this.sway.y);this.model.rotation.y=this.sway.x*.9;this.model.rotation.x=this.sway.y*.8;
    if(this.reloading)this.updateReload(dt);
    else if(spec.type==='charged'){
      if(this.trigger){this.charging=true;this.charge=Math.min(1.5,this.charge+dt);this.chargeAudioTimer-=dt;if(this.chargeAudioTimer<=0){this.chargeAudioTimer=.16;this.audio.charge(this.charge/1.5);}}
      else if(this.charging){if(this.charge>.18)this.fire(now,camera,level,director);this.charging=false;this.charge=0;}
    } else if(this.trigger&&this.boltTimer<=0&&now-this.lastShot>=1/(spec.fireRate*this.fireRateMultiplier))this.fire(now,camera,level,director);
    this.updateProjectiles(dt,level,director);this.updateEffects(dt);this.updateCasings(dt);
    if(this.muzzleLife>0){this.muzzleLife-=dt;this.muzzleFlash.visible=this.muzzleLife>0;this.muzzleLight.intensity=Math.max(0,this.muzzleLife*70);}
    mouseDelta.set(0,0);
  }

  private fire(now:number,camera:THREE.PerspectiveCamera,level:LevelData,director:DroneDirector){
    const spec=WEAPON_SPECS[this.current];if(this.mags[this.current]<=0){this.startReload();return;}
    this.lastShot=now;this.mags[this.current]--;this.shots++;this.onShot();this.audio.shot(spec.type);this.onSound({position:camera.position.clone(),radius:spec.type==='shotgun'?30:24,time:now,kind:'shot'});
    this.muzzleLife=.055;this.muzzleFlash.visible=true;this.muzzleLight.intensity=4.5;this.ejectCasing(camera);
    this.onShake(spec.type==='shotgun'?.16:spec.type==='sniper'?.24:.07);this.recoilIndex++;
    const pattern=[[-.002,.008],[.003,.012],[-.004,.016],[.006,.02],[-.007,.025],[.005,.029],[0,.034]];
    const rp=pattern[(this.recoilIndex-1)%pattern.length];this.recoilYaw+=rp[0];this.recoilPitch+=rp[1];
    if(spec.type==='charged')this.launchProjectile(camera,Math.min(1,this.charge/1.1));
    else if(spec.type==='shotgun'){
      const pattern2=[[-.7,-.5],[0,-.55],[.7,-.5],[-.8,.1],[0,0],[.8,.1],[-.55,.65],[.55,.65]];
      let hitOne=false,critical=false;for(const [x,y] of pattern2){const result=this.cast(camera,level,director,x*this.currentSpread,y*this.currentSpread,spec.damage*this.damageMultiplier*(this.incendiary?1.12:1),22);hitOne||=result.hit;critical||=result.critical;}if(hitOne)this.markHit(critical);
    }else if(spec.type==='sniper'){this.boltTimer=.52;this.reloadStage='CICLANDO FERROLHO';setTimeout(()=>this.audio.reload('end'),210);const spread=this.ads?this.currentSpread:this.currentSpread*1.35;const result=this.cast(camera,level,director,(Math.random()-.5)*spread,(Math.random()-.5)*spread,spec.damage*this.damageMultiplier,150,true,this.sniperPenetration);if(result.hit)this.markHit(result.critical);}
    else{const result=this.cast(camera,level,director,(Math.random()-.5)*this.currentSpread,(Math.random()-.5)*this.currentSpread,spec.damage*this.damageMultiplier,100);if(result.hit)this.markHit(result.critical);}
    this.onHud();
  }

  // Every trajectory starts from the camera center. Spread only rotates that exact center ray.
  private centerRay(camera:THREE.PerspectiveCamera,x=0,y=0){const origin=camera.position.clone();const dir=new THREE.Vector3(x,y,-1).unproject(camera).sub(origin).normalize();return{origin,dir};}
  measureRange(camera:THREE.PerspectiveCamera,level:LevelData){const{origin,dir}=this.centerRay(camera);const ray=new THREE.Raycaster(origin,dir,0,150);this.scopeDistance=ray.intersectObjects(level.raycastMeshes,false)[0]?.distance??150;return this.scopeDistance;}
  private cast(camera:THREE.PerspectiveCamera,level:LevelData,director:DroneDirector,sx:number,sy:number,damage:number,range:number,noFalloff=false,penetration=0){
    const {origin,dir}=this.centerRay(camera,sx,sy);const ray=new THREE.Raycaster(origin,dir,0,range);const worldHit=ray.intersectObjects(level.raycastMeshes,false)[0];let end=origin.clone().addScaledVector(dir,range);const maxDist=worldHit?.distance??range;
    type Candidate={drone:Drone;distance:number;point:THREE.Vector3;zone:DamageZone;critical:boolean};
    const candidates:Candidate[]=[];
    for(const drone of director.drones){
      if(!drone.alive)continue;
      const targets=[...drone.damageZones,drone.weakpoint,drone.hitbox];
      const hit=ray.intersectObjects(targets,false).find(item=>item.distance<maxDist);
      if(!hit)continue;
      const zone=(hit.object.userData.damageZone??'BODY') as DamageZone;
      candidates.push({drone,distance:hit.distance,point:hit.point.clone(),zone,critical:zone==='CORE'});
    }
    candidates.sort((a,b)=>a.distance-b.distance);
    const hitTargets=candidates.slice(0,1+penetration);let critical=false;
    for(const target of hitTargets){const falloff=noFalloff?1:THREE.MathUtils.clamp(1-target.distance/range,.2,1);const killed=target.drone.damage(damage*falloff,origin,target.critical,target.zone);if(killed)this.onKill(target.drone,target.critical);critical||=target.critical;this.spawnSparks(target.point,new THREE.Vector3(0,1,0));}
    if(candidates[0]&&penetration===0)end.copy(candidates[0].point);
    else if(worldHit)end.copy(worldHit.point);
    if(worldHit){level.damageDestructible(worldHit.object,damage);this.impact(worldHit.point,worldHit.face?.normal.clone().transformDirection(worldHit.object.matrixWorld)??dir.clone().negate());}
    this.scopeDistance=candidates[0]?.distance??worldHit?.distance??range;this.lastRay={start:origin,end:end.clone()};this.onTracer(origin,end,critical?'#fff1b2':'#f0b857');return{hit:hitTargets.length>0,critical};
  }

  private launchProjectile(camera:THREE.PerspectiveCamera,power:number){const p=this.projectiles.find(v=>!v.active);if(!p)return;const{origin,dir}=this.centerRay(camera);p.active=true;p.life=5;p.mesh.visible=true;p.mesh.position.copy(origin).addScaledVector(dir,.8);p.velocity.copy(dir).multiplyScalar(20+power*22);this.lastRay={start:origin,end:origin.clone().addScaledVector(dir,5)};}
  private updateProjectiles(dt:number,level:LevelData,director:DroneDirector){for(const p of this.projectiles){if(!p.active)continue;const old=p.mesh.position.clone();p.velocity.y-=8.5*dt;p.mesh.position.addScaledVector(p.velocity,dt);p.life-=dt;const travel=p.mesh.position.clone().sub(old),dist=travel.length(),ray=new THREE.Raycaster(old,travel.normalize(),0,dist);const world=ray.intersectObjects(level.raycastMeshes,false)[0];let target:Drone|null=null;for(const d of director.drones){if(d.alive&&ray.intersectObject(d.hitbox,false).length){target=d;break;}}if(world||target||p.life<=0){this.explode(p.mesh.position,director);p.active=false;p.mesh.visible=false;}}}
  private explode(pos:THREE.Vector3,director:DroneDirector){this.audio.explosion();this.onSound({position:pos.clone(),radius:38,time:performance.now()/1000,kind:'explosion'});this.spawnSparks(pos,new THREE.Vector3(0,1,0),28);const radius=7*this.arcRadiusMultiplier;for(const d of director.drones){if(!d.alive)continue;const distance=d.group.position.distanceTo(pos);if(distance<radius){const killed=d.damage(85*this.damageMultiplier*(1-distance/radius),pos);if(killed)this.onKill(d,false);this.markHit();}}this.onShake(.28);}

  startReload(){if(this.reloading||this.mags[this.current]>=this.effectiveMagSize()||this.reserves[this.current]<=0)return;this.reloading=true;this.reloadTimer=0;this.reloadStage='INICIANDO';this.audio.reload('start');this.onHud();}
  private updateReload(dt:number){const spec=WEAPON_SPECS[this.current],duration=spec.reload*this.reloadMultiplier;this.reloadTimer+=dt;const mag=this.model.getObjectByName('magazine');if(this.reloadTimer<duration*.28){this.reloadStage='LIBERANDO';this.model.rotation.x=THREE.MathUtils.lerp(0,.22,this.reloadTimer/(duration*.28));}
    else if(this.reloadTimer<duration*.72){if(this.reloadStage!=='TROCA DE PENTE'){this.reloadStage='TROCA DE PENTE';this.audio.reload('mag');}if(mag)mag.visible=Math.sin(this.reloadTimer*18)>-.2;}
    else if(this.reloadTimer<duration){this.reloadStage='PRONTO';this.model.rotation.x=THREE.MathUtils.damp(this.model.rotation.x,0,18,dt);if(mag)mag.visible=true;}
    else{const need=this.effectiveMagSize()-this.mags[this.current],take=this.current===2?Math.min(1,this.reserves[this.current]):Math.min(need,this.reserves[this.current]);this.mags[this.current]+=take;this.reserves[this.current]-=take;if(this.current===2&&this.mags[this.current]<this.effectiveMagSize()&&this.reserves[this.current]>0){this.reloadTimer=spec.reload*this.reloadMultiplier*.28;this.reloadStage='INSERINDO CARTUCHO';this.audio.reload('mag');}else{this.reloading=false;this.reloadStage='';this.model.rotation.x=0;this.audio.reload('end');}this.onHud();}this.onHud();}

  private markHit(critical=false){this.hits++;this.onHit(critical);}
  private impact(point:THREE.Vector3,normal:THREE.Vector3){this.audio.impact();const d=this.decals.find(v=>!v.active)??this.decals.reduce((a,b)=>a.life<b.life?a:b);d.active=true;d.life=18;d.mesh.visible=true;d.mesh.position.copy(point).addScaledVector(normal,.012);d.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1),normal);(d.mesh.material as THREE.MeshBasicMaterial).opacity=.72;this.spawnSparks(point,normal);}
  private spawnSparks(point:THREE.Vector3,normal:THREE.Vector3,count=8){for(let i=0;i<count;i++){const p=this.particles.find(v=>!v.active);if(!p)break;p.active=true;p.life=.25+Math.random()*.35;p.mesh.visible=true;p.mesh.position.copy(point);p.velocity.copy(normal).multiplyScalar(2+Math.random()*5).add(new THREE.Vector3((Math.random()-.5)*4,Math.random()*3,(Math.random()-.5)*4));}}
  private updateEffects(dt:number){for(const p of this.particles){if(!p.active)continue;p.life-=dt;p.velocity.y-=9*dt;p.mesh.position.addScaledVector(p.velocity,dt);p.mesh.lookAt(p.mesh.position.clone().add(p.velocity));if(p.life<=0){p.active=false;p.mesh.visible=false;}}for(const d of this.decals){if(!d.active)continue;d.life-=dt;if(d.life<2)(d.mesh.material as THREE.MeshBasicMaterial).opacity=d.life*.36;if(d.life<=0){d.active=false;d.mesh.visible=false;}}}
  private ejectCasing(camera:THREE.PerspectiveCamera){if(this.current===1)return;const casing=this.casings.find(item=>!item.active);if(!casing)return;casing.active=true;casing.life=1.6;casing.mesh.visible=true;casing.mesh.position.copy(camera.position).add(new THREE.Vector3(.25,-.2,0).applyQuaternion(camera.quaternion));casing.velocity.set(2.2+Math.random(),1.7+Math.random(),.3*(Math.random()-.5)).applyQuaternion(camera.quaternion);this.audio.shell();}
  private updateCasings(dt:number){for(const casing of this.casings){if(!casing.active)continue;casing.life-=dt;casing.velocity.y-=9*dt;casing.mesh.position.addScaledVector(casing.velocity,dt);casing.mesh.rotation.x+=dt*14;casing.mesh.rotation.z+=dt*9;if(casing.mesh.position.y<.03){casing.mesh.position.y=.03;casing.velocity.y=Math.abs(casing.velocity.y)*.28;casing.velocity.multiplyScalar(.72);}if(casing.life<=0){casing.active=false;casing.mesh.visible=false;}}}
}
