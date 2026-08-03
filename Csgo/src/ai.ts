import * as THREE from 'three';
import type { DamageZone, Difficulty, DroneSpec, DroneState, DroneType, LevelData, SoundEvent } from './types';
import { findPath, hasClearPath } from './level';
import { SynthAudio } from './audio';

export const DRONE_SPECS:Record<DroneType,DroneSpec>={
  SCOUT:{type:'SCOUT',health:62,speed:4.6,damage:5,preferredRange:10,fireInterval:.62,visionRange:28,color:'#79e4db',scale:.82},
  ASSAULT:{type:'ASSAULT',health:100,speed:3.45,damage:8,preferredRange:14,fireInterval:.78,visionRange:34,color:'#f0b857',scale:1},
  HEAVY:{type:'HEAVY',health:230,speed:2.15,damage:14,preferredRange:12,fireInterval:1.05,visionRange:31,color:'#ff765f',scale:1.32},
  SNIPER:{type:'SNIPER',health:76,speed:2.8,damage:24,preferredRange:28,fireInterval:2.4,visionRange:48,color:'#d4a7ff',scale:.9},
  SUPPORT:{type:'SUPPORT',health:92,speed:3.1,damage:4,preferredRange:18,fireInterval:1.1,visionRange:34,color:'#87e188',scale:1.02},
  KAMIKAZE:{type:'KAMIKAZE',health:48,speed:6.4,damage:34,preferredRange:1.2,fireInterval:9,visionRange:38,color:'#ff7a2e',scale:.72},
  SHIELD:{type:'SHIELD',health:165,speed:2.7,damage:7,preferredRange:9,fireInterval:1.0,visionRange:33,color:'#d9f7ff',scale:1.12},
  JAMMER:{type:'JAMMER',health:84,speed:3.3,damage:5,preferredRange:17,fireInterval:1.25,visionRange:36,color:'#ff4fd8',scale:.95},
  CLOAKED:{type:'CLOAKED',health:70,speed:4.2,damage:11,preferredRange:8,fireInterval:.9,visionRange:35,color:'#6de9ff',scale:.86},
  ENGINEER:{type:'ENGINEER',health:108,speed:2.9,damage:6,preferredRange:20,fireInterval:1.3,visionRange:36,color:'#ffd55d',scale:1.02},
  TURRET:{type:'TURRET',health:74,speed:0,damage:7,preferredRange:22,fireInterval:.68,visionRange:42,color:'#ffb24a',scale:.82},
  COMMANDER:{type:'COMMANDER',health:1150,speed:1.75,damage:19,preferredRange:16,fireInterval:.76,visionRange:55,color:'#ffffff',scale:2.25},
};

const STATE_COLORS:Record<DroneState,string>={PATRULHA:'#67d8d5',SUSPEITA:'#f0b857',COMBATE:'#ff6d59',BUSCA:'#d4a7ff',RECUO:'#87e188'};
let NEXT_ID=1;

export class Drone {
  readonly id=NEXT_ID++;
  readonly group=new THREE.Group();
  readonly hitbox:THREE.Mesh;
  readonly weakpoint:THREE.Mesh;
  readonly damageZones:THREE.Object3D[]=[];
  readonly spec:DroneSpec;
  alive=true;
  health:number;
  state:DroneState='PATRULHA';
  lastKnown:THREE.Vector3|null=null;
  path:THREE.Vector3[]=[];
  pathIndex=0;
  stateTime=0;
  lastSeen=0;
  reaction=0;
  lastFire=0;
  contactTime=0;
  frontAttacker=false;
  visionVisible=false;
  debugLabel:THREE.Sprite;
  private patrol:THREE.Vector3[]=[];
  private patrolIndex=0;
  private investigateUntil=0;
  private searchAngle=0;
  private lastPathAt=-99;
  private supportTimer=0;
  private abilityTimer=5;
  private bossPhase=1;
  private rotorDamage=0;
  private weaponDamage=0;
  private lodAccumulator=0;
  private eyeMaterial:THREE.MeshStandardMaterial;
  private stateLight:THREE.PointLight;
  private hum:ReturnType<SynthAudio['createDroneHum']>;

  constructor(position:THREE.Vector3,readonly type:DroneType,private level:LevelData,private audio:SynthAudio,private director:DroneDirector){
    this.spec=DRONE_SPECS[type];
    this.health=this.spec.health;
    const shellColor:Partial<Record<DroneType,string>>={HEAVY:'#6b2924',SNIPER:'#3b2d50',SCOUT:'#28575c',ASSAULT:'#6b4a1e',SUPPORT:'#28543a',KAMIKAZE:'#7a2411',SHIELD:'#74858b',JAMMER:'#502044',CLOAKED:'#244653',ENGINEER:'#6a551b',TURRET:'#493822',COMMANDER:'#090d10'};
    const shell=new THREE.MeshStandardMaterial({color:shellColor[type]??'#465553',roughness:type==='COMMANDER'?.18:.32,metalness:.78,transparent:type==='CLOAKED',opacity:type==='CLOAKED'?.28:1});
    this.eyeMaterial=new THREE.MeshStandardMaterial({color:'#15201f',emissive:this.spec.color,emissiveIntensity:2.5});
    const core=new THREE.Mesh(new THREE.SphereGeometry(.55,12,8),shell);core.scale.y=.65;core.userData.damageZone='BODY';this.damageZones.push(core);this.group.add(core);
    const armor=new THREE.Mesh(new THREE.TorusGeometry(.58,.09,6,14),shell);armor.rotation.x=Math.PI/2;this.group.add(armor);
    const eye=new THREE.Mesh(new THREE.BoxGeometry(type==='SNIPER'?.22:.42,.12,.08),this.eyeMaterial);eye.position.set(0,.02,-.53);eye.userData.damageZone='CORE';this.damageZones.push(eye);this.group.add(eye);
    for(const x of [-.78,.78]){const rotor=new THREE.Mesh(new THREE.CylinderGeometry(.34,.34,.05,12),shell);rotor.rotation.x=Math.PI/2;rotor.position.set(x,.05,0);rotor.userData.damageZone=x<0?'ROTOR_LEFT':'ROTOR_RIGHT';this.damageZones.push(rotor);this.group.add(rotor);}
    if(type==='HEAVY'){for(const x of [-.52,.52]){const plate=new THREE.Mesh(new THREE.BoxGeometry(.38,.42,.5),shell);plate.position.set(x,.05,.1);this.group.add(plate);}}
    if(type==='SUPPORT'){const halo=new THREE.Mesh(new THREE.TorusGeometry(.75,.025,5,20),new THREE.MeshBasicMaterial({color:this.spec.color}));halo.rotation.x=Math.PI/2;halo.position.y=.34;this.group.add(halo);}
    if(type==='SHIELD'||type==='COMMANDER'){const shield=new THREE.Mesh(new THREE.CylinderGeometry(type==='COMMANDER'?1.05:.86,type==='COMMANDER'?1.05:.86,.07,24),new THREE.MeshStandardMaterial({color:'#aeeeff',emissive:'#54d9ff',emissiveIntensity:1.1,transparent:true,opacity:.42,roughness:.16,metalness:.65}));shield.rotation.x=Math.PI/2;shield.position.set(0,0,-.9);shield.userData.damageZone='BODY';this.damageZones.push(shield);this.group.add(shield);}
    if(type==='JAMMER'){for(const radius of [.72,.98]){const ring=new THREE.Mesh(new THREE.TorusGeometry(radius,.025,6,28),new THREE.MeshBasicMaterial({color:'#ff4fd8',transparent:true,opacity:.8}));ring.rotation.x=Math.PI/2;this.group.add(ring);}}
    if(type==='KAMIKAZE'){for(let i=0;i<6;i++){const spike=new THREE.Mesh(new THREE.ConeGeometry(.11,.65,6),new THREE.MeshStandardMaterial({color:'#ff6b20',emissive:'#8b1b08',emissiveIntensity:1.8}));spike.rotation.z=Math.PI/2;spike.rotation.y=i*Math.PI/3;spike.position.set(Math.cos(i*Math.PI/3)*.65,0,Math.sin(i*Math.PI/3)*.65);this.group.add(spike);}}
    if(type==='ENGINEER'){const arm=new THREE.Mesh(new THREE.BoxGeometry(.15,.15,.9),new THREE.MeshStandardMaterial({color:'#ffd55d',metalness:.65,roughness:.28}));arm.position.set(.52,-.2,.2);arm.rotation.x=.7;arm.userData.damageZone='WEAPON';this.damageZones.push(arm);this.group.add(arm);}
    if(type==='TURRET'){const barrel=new THREE.Mesh(new THREE.CylinderGeometry(.07,.11,1.1,8),new THREE.MeshStandardMaterial({color:'#171b1d',metalness:.9,roughness:.22}));barrel.rotation.x=Math.PI/2;barrel.position.set(0,0,-.65);barrel.userData.damageZone='WEAPON';this.damageZones.push(barrel);this.group.add(barrel);}
    if(type==='COMMANDER'){for(const radius of [.72,1.08,1.38]){const ring=new THREE.Mesh(new THREE.TorusGeometry(radius,.035,8,36),new THREE.MeshBasicMaterial({color:'#ffffff',transparent:true,opacity:.65}));ring.rotation.x=Math.PI/2;this.group.add(ring);}}
    this.hitbox=new THREE.Mesh(new THREE.BoxGeometry(2,1.4,1.6),new THREE.MeshBasicMaterial({visible:false}));this.group.add(this.hitbox);
    this.weakpoint=new THREE.Mesh(new THREE.BoxGeometry(.55,.3,.18),new THREE.MeshBasicMaterial({visible:false}));this.weakpoint.position.set(0,.12,-.68);this.group.add(this.weakpoint);
    this.weakpoint.userData.damageZone='CORE';
    for(const target of [...this.damageZones,this.hitbox,this.weakpoint])target.userData.drone=this;
    this.stateLight=new THREE.PointLight(STATE_COLORS.PATRULHA,3.4,4,2);this.stateLight.position.set(0,.2,-.55);this.group.add(this.stateLight);
    this.debugLabel=createLabel(this.labelText(),STATE_COLORS.PATRULHA);this.debugLabel.position.set(0,1.25,0);this.debugLabel.scale.set(2.5,.55,1);this.debugLabel.visible=false;this.group.add(this.debugLabel);
    this.group.position.copy(position).setY(level.floorHeightAt(position.x,position.z)+1.65);this.group.scale.setScalar(this.spec.scale);this.group.name=`Drone ${this.id} ${type}`;
    this.hum=this.audio.createDroneHum(this.group.position);
    const spawns=level.spawnPoints.map(spawn=>spawn.position);
    this.patrol=[position.clone(),spawns[(this.id*3)%spawns.length].clone(),spawns[(this.id*5+1)%spawns.length].clone()];
    this.setPath(this.patrol[1]);
  }

  update(dt:number,now:number,player:THREE.Vector3,sounds:SoundEvent[]){
    if(!this.alive)return;
    const playerDistance=this.group.position.distanceTo(player);
    if(playerDistance>45&&this.state==='PATRULHA'){
      this.lodAccumulator+=dt;
      if(this.lodAccumulator<1/15)return;
      dt=this.lodAccumulator;this.lodAccumulator=0;
    }
    this.stateTime+=dt;
    const toPlayer=player.clone().sub(this.group.position),distance=toPlayer.length();
    const forward=new THREE.Vector3(0,0,-1).applyQuaternion(this.group.quaternion);
    const angle=forward.angleTo(toPlayer.clone().setY(0));
    const visionAngle=this.type==='COMMANDER'||this.type==='TURRET'?179:this.type==='SNIPER'?38:this.type==='KAMIKAZE'?78:52;
    const hasLOS=distance<this.spec.visionRange&&angle<THREE.MathUtils.degToRad(visionAngle)&&this.director.lineOfSight(this.group.position,player);
    this.visionVisible=hasLOS;
    if(hasLOS){
      this.lastKnown=player.clone();this.lastSeen=now;this.contactTime+=dt;
      if(this.state!=='COMBATE'){this.setState('COMBATE');this.reaction=.38+Math.random()*.55+(this.type==='HEAVY'?.22:0);}
      this.director.shareKnowledge(this);
    }else this.contactTime=Math.max(0,this.contactTime-dt*.5);

    const heard=sounds.filter(sound=>now-sound.time<1.2&&this.group.position.distanceTo(sound.position)<sound.radius).sort((a,b)=>b.time-a.time)[0];
    if(heard&&!hasLOS&&(this.state==='PATRULHA'||this.state==='BUSCA')){this.lastKnown=heard.position.clone();this.setState('SUSPEITA');this.investigateUntil=now+5;this.setPath(heard.position);}
    if(this.health<this.spec.health*.28&&this.state!=='RECUO'&&this.type!=='HEAVY')this.retreat(player);

    switch(this.state){
      case 'PATRULHA':if(this.followPath(dt,this.spec.speed*.7)){this.patrolIndex=(this.patrolIndex+1)%this.patrol.length;this.setPath(this.patrol[this.patrolIndex]);}break;
      case 'SUSPEITA':if(this.followPath(dt,this.spec.speed*.9)||now>this.investigateUntil){this.setState('BUSCA');this.stateTime=0;}break;
      case 'COMBATE':this.combat(dt,now,player,distance,hasLOS);break;
      case 'BUSCA':if(this.path.length&&this.followPath(dt,this.spec.speed*.85)){this.path=[];this.stateTime=0;}else if(!this.path.length){this.searchAngle+=dt*.8;this.group.rotation.y+=dt*(this.id%2?1:-1)*.65;if(this.stateTime>6)this.setState('PATRULHA');}break;
      case 'RECUO':if(this.followPath(dt,this.spec.speed*1.05)&&this.stateTime>5)this.setState('BUSCA');break;
    }
    if(this.type==='SUPPORT')this.supportAllies(dt);
    if(this.type==='JAMMER')this.director.onJammer(this.group.position,distance<19);
    if(this.type==='ENGINEER')this.engineerAbility(dt);
    if(this.type==='COMMANDER')this.commanderAbility(dt,player);
    const floor=this.level.floorHeightAt(this.group.position.x,this.group.position.z);
    this.group.position.y=floor+1.65+Math.sin(now*2.4+this.id)*.12;
    this.hum?.update(this.group.position);
  }

  receiveIntel(position:THREE.Vector3){
    if(!this.alive)return;
    this.lastKnown=position.clone();
    if(this.state==='PATRULHA'){this.setState('SUSPEITA');this.setPath(position);}
  }

  damage(amount:number,source:THREE.Vector3,critical=false,zone:DamageZone='BODY'){
    if(!this.alive)return false;
    const forward=new THREE.Vector3(0,0,-1).applyQuaternion(this.group.quaternion);
    const fromSource=source.clone().sub(this.group.position).setY(0).normalize();
    const shielded=(this.type==='SHIELD'||this.type==='COMMANDER')&&zone!=='CORE'&&forward.dot(fromSource)>.05;
    if(shielded)amount*=.16;
    if(zone==='CORE')amount*=1.65;
    if(zone==='ROTOR_LEFT'||zone==='ROTOR_RIGHT')this.rotorDamage=Math.min(.58,this.rotorDamage+.14);
    if(zone==='WEAPON')this.weaponDamage=Math.min(.7,this.weaponDamage+.22);
    this.health-=amount*(critical&&zone!=='CORE'?1.65:1);this.lastKnown=source.clone();
    if(this.state==='PATRULHA')this.setState('SUSPEITA');
    if(this.health<=0){this.alive=false;this.group.visible=false;this.hum?.stop();this.director.onDroneKilled(this);return true;}
    return false;
  }

  heal(amount:number){if(this.alive)this.health=Math.min(this.spec.health,this.health+amount);}
  dispose(){this.hum?.stop();}
  setDebugVisible(visible:boolean){this.debugLabel.visible=visible;}
  forceNextState(){const states:DroneState[]=['PATRULHA','SUSPEITA','COMBATE','BUSCA','RECUO'];this.setState(states[(states.indexOf(this.state)+1)%states.length]);}

  private combat(dt:number,now:number,player:THREE.Vector3,distance:number,hasLOS:boolean){
    if(!hasLOS&&now-this.lastSeen>1.15){this.setState('BUSCA');if(this.lastKnown)this.setPath(this.lastKnown);return;}
    if(!hasLOS)return;
    this.turnToward(player,dt,this.type==='HEAVY'?2.4:3.8);
    const desired=this.frontAttacker?this.spec.preferredRange:this.spec.preferredRange+4;
    if(this.type==='KAMIKAZE'&&distance<2.35){this.director.onKamikazeBlast(this.group.position,this.spec.damage);this.damage(Infinity,player);return;}
    if(Math.abs(distance-desired)>2&&this.type!=='TURRET'){
      const toward=player.clone().sub(this.group.position).normalize();
      const target=player.clone().addScaledVector(toward,-desired);
      if(!this.frontAttacker)target.add(new THREE.Vector3(-toward.z,0,toward.x).multiplyScalar(this.id%2?8:-8));
      this.setPathThrottled(target,now);
      this.followPath(dt,this.spec.speed*(1-this.rotorDamage));
    }
    if(this.stateTime>this.reaction&&now-this.lastFire>Math.max(this.spec.fireInterval,this.spec.fireInterval+.35-this.contactTime*.06))this.shoot(now,player);
  }

  private shoot(now:number,player:THREE.Vector3){
    this.lastFire=now;this.audio.droneShot(this.group.position);
    const baseError=this.type==='SNIPER'?.65:this.type==='HEAVY'?1.35:1.05;
    const aimError=THREE.MathUtils.lerp(baseError,.12,THREE.MathUtils.clamp(this.contactTime/5,0,1))+this.weaponDamage;
    const miss=new THREE.Vector3((Math.random()-.5)*aimError,(Math.random()-.5)*aimError*.4,(Math.random()-.5)*aimError);
    const target=player.clone().add(miss),accuracy=target.distanceTo(player)<.55;
    if(accuracy)this.director.onPlayerDamage(this.spec.damage*this.director.damageScale*(.82+Math.random()*.36),this.group.position);
    this.director.spawnEnemyTracer(this.group.position,target,accuracy);
  }

  private supportAllies(dt:number){
    this.supportTimer-=dt;if(this.supportTimer>0)return;this.supportTimer=2.8;
    const ally=this.director.drones.filter(drone=>drone.alive&&drone!==this&&drone.group.position.distanceTo(this.group.position)<8&&drone.health<drone.spec.health).sort((a,b)=>a.health/a.spec.health-b.health/b.spec.health)[0];
    if(ally){ally.heal(10);this.director.onSupportPulse(this.group.position,ally.group.position);}
  }

  private engineerAbility(dt:number){
    this.abilityTimer-=dt;
    if(this.abilityTimer>0||this.state!=='COMBATE')return;
    this.abilityTimer=10;
    const nearbyTurrets=this.director.drones.filter(drone=>drone.alive&&drone.type==='TURRET'&&drone.group.position.distanceTo(this.group.position)<16).length;
    if(nearbyTurrets<2)this.director.onEngineerDeploy(this.group.position.clone());
  }

  private commanderAbility(dt:number,player:THREE.Vector3){
    const nextPhase=this.health<this.spec.health*.34?3:this.health<this.spec.health*.67?2:1;
    if(nextPhase!==this.bossPhase){this.bossPhase=nextPhase;this.director.onBossPhase(this,nextPhase);this.director.onCommanderSummon(this.group.position.clone(),nextPhase);}
    this.abilityTimer-=dt;
    if(this.abilityTimer>0||this.state!=='COMBATE')return;
    this.abilityTimer=Math.max(3.2,6.4-this.bossPhase);
    this.director.onBossAttack(this.group.position.clone(),player.clone(),this.bossPhase);
  }

  private retreat(player:THREE.Vector3){
    this.setState('RECUO');let best:THREE.Vector3|null=null,bestScore=-Infinity;
    for(const cover of this.level.covers){const center=cover.getCenter(new THREE.Vector3());const hidden=!this.director.lineOfSight(center.clone().setY(1.4),player);const score=(hidden?45:0)+center.distanceTo(player)-this.group.position.distanceTo(center)*.55;if(score>bestScore&&hasClearPath(this.group.position,center,this.level.colliders,1)){bestScore=score;best=center;}}
    if(best)this.setPath(best,1.2);
  }

  private setState(state:DroneState){
    if(this.state===state)return;
    const previous=this.state;this.state=state;this.stateTime=0;
    const color=STATE_COLORS[state];this.eyeMaterial.emissive.set(color);this.stateLight.color.set(color);this.stateLight.intensity=state==='COMBATE'?6:3.4;
    updateLabel(this.debugLabel,this.labelText(),color);
    this.audio.droneAlert(this.group.position,state);
    this.director.recordState(this,state);
    this.director.onStateChange(this,previous,state);
  }

  private labelText(){return`D-${String(this.id).padStart(2,'0')} ${this.type} · ${this.state}`;}
  private setPath(target:THREE.Vector3,exposureWeight=this.state==='RECUO'?1.5:.35){this.path=findPath(this.group.position,target,this.level,exposureWeight);this.pathIndex=1;}
  private setPathThrottled(target:THREE.Vector3,now:number){if(now-this.lastPathAt<.85)return;this.lastPathAt=now;this.setPath(target);}
  private followPath(dt:number,speed:number){
    if(this.pathIndex>=this.path.length)return true;
    const target=this.path[this.pathIndex].clone().setY(this.group.position.y),delta=target.sub(this.group.position);delta.y=0;
    if(delta.length()<.65){this.pathIndex++;return this.pathIndex>=this.path.length;}
    delta.normalize();
    const steering=this.director.steeringFor(this).multiplyScalar(1.25).add(delta).normalize();
    this.group.position.addScaledVector(steering,speed*dt);
    this.turnToward(this.group.position.clone().add(steering),dt,5);
    return false;
  }
  private turnToward(target:THREE.Vector3,dt:number,speed:number){const direction=target.clone().sub(this.group.position);const targetYaw=Math.atan2(-direction.x,-direction.z);const difference=THREE.MathUtils.euclideanModulo(targetYaw-this.group.rotation.y+Math.PI,Math.PI*2)-Math.PI;this.group.rotation.y+=difference*Math.min(1,dt*speed);}
}

export class DroneDirector {
  drones:Drone[]=[];
  spawnedThisWave=0;
  stateHistory:string[]=[];
  onPlayerDamage=(_amount:number,_source:THREE.Vector3)=>{};
  onDroneKilled=(_drone:Drone)=>{};
  onStateChange=(_drone:Drone,_from:DroneState,_to:DroneState)=>{};
  onSupportPulse=(_from:THREE.Vector3,_to:THREE.Vector3)=>{};
  onJammer=(_position:THREE.Vector3,_active:boolean)=>{};
  onKamikazeBlast=(_position:THREE.Vector3,_damage:number)=>{};
  onEngineerDeploy=(_position:THREE.Vector3)=>{};
  onBossPhase=(_boss:Drone,_phase:number)=>{};
  onCommanderSummon=(_position:THREE.Vector3,_phase:number)=>{};
  onBossAttack=(_origin:THREE.Vector3,_target:THREE.Vector3,_phase:number)=>{};
  spawnEnemyTracer=(_a:THREE.Vector3,_b:THREE.Vector3,_hit:boolean)=>{};
  damageScale=1;
  private raycaster=new THREE.Raycaster();
  constructor(private scene:THREE.Scene,public level:LevelData,private audio:SynthAudio){}
  setDifficulty(difficulty:Difficulty){this.damageScale=difficulty==='RECRUIT'?.72:difficulty==='NIGHTMARE'?1.38:1;}
  spawn(position:THREE.Vector3,type:DroneType='ASSAULT'){const drone=new Drone(position,type,this.level,this.audio,this);this.drones.push(drone);this.scene.add(drone.group);return drone;}
  update(dt:number,now:number,player:THREE.Vector3,sounds:SoundEvent[]){const combat=this.drones.filter(drone=>drone.alive&&drone.state==='COMBATE').sort((a,b)=>a.group.position.distanceTo(player)-b.group.position.distanceTo(player));combat.forEach((drone,index)=>drone.frontAttacker=index<2);for(const drone of this.drones){if(drone.alive)drone.group.visible=drone.group.position.distanceTo(player)<70||drone.state!=='PATRULHA';drone.update(dt,now,player,sounds);}}
  lineOfSight(a:THREE.Vector3,b:THREE.Vector3){const origin=a.clone(),delta=b.clone().sub(origin),distance=delta.length();this.raycaster.set(origin,delta.normalize());this.raycaster.far=distance;return this.raycaster.intersectObjects(this.level.raycastMeshes,false).length===0;}
  shareKnowledge(source:Drone){if(!source.lastKnown)return;for(const drone of this.drones){if(drone===source||!drone.alive||drone.group.position.distanceTo(source.group.position)>18)continue;drone.receiveIntel(source.lastKnown);}}
  steeringFor(source:Drone){const force=new THREE.Vector3();for(const other of this.drones){if(other===source||!other.alive)continue;const offset=source.group.position.clone().sub(other.group.position);offset.y=0;const distance=offset.length();const minimum=(source.spec.scale+other.spec.scale)*1.25;if(distance>0&&distance<minimum)force.addScaledVector(offset.normalize(),(minimum-distance)/minimum);}return force;}
  destroyAll(){for(const drone of this.drones)if(drone.alive)drone.damage(Infinity,drone.group.position);}
  forceStates(){for(const drone of this.drones)if(drone.alive)drone.forceNextState();}
  recordState(drone:Drone,state:DroneState){this.stateHistory.unshift(`${new Date().toLocaleTimeString('pt-BR',{hour12:false})} D-${String(drone.id).padStart(2,'0')} → ${state}`);this.stateHistory.length=Math.min(this.stateHistory.length,12);}
  setDebugVisible(visible:boolean){for(const drone of this.drones)drone.setDebugVisible(visible);}
  clear(){for(const drone of this.drones){drone.dispose();this.scene.remove(drone.group);}this.drones=[];}
}

function createLabel(text:string,color:string){const canvas=document.createElement('canvas');canvas.width=512;canvas.height=96;const texture=new THREE.CanvasTexture(canvas);const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:texture,transparent:true,depthWrite:false}));updateLabel(sprite,text,color);return sprite;}
function updateLabel(sprite:THREE.Sprite,text:string,color:string){const texture=(sprite.material as THREE.SpriteMaterial).map!;const canvas=texture.image as HTMLCanvasElement;const context=canvas.getContext('2d')!;context.clearRect(0,0,canvas.width,canvas.height);context.fillStyle='rgba(13,18,16,.82)';context.fillRect(0,12,canvas.width,68);context.strokeStyle=color;context.strokeRect(1,13,canvas.width-2,66);context.fillStyle=color;context.font='bold 27px Consolas, monospace';context.textAlign='center';context.fillText(text,canvas.width/2,56);texture.needsUpdate=true;}
