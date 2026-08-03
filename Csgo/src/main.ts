import * as THREE from 'three';
import './styles.css';
import { buildLevel } from './level';
import { PlayerController } from './collision';
import { SynthAudio } from './audio';
import { DroneDirector } from './ai';
import { WeaponSystem, WEAPON_SPECS } from './weapons';
import { DebugView } from './debug';
import { InputManager } from './input';
import { HUDController } from './hud';
import { EffectsManager } from './effects';
import { WaveDirector } from './waves';
import { SettingsManager } from './settings';
import { ProgressionSystem, ScoreSystem } from './progression';
import type { SoundEvent } from './types';

const $=<T extends HTMLElement>(selector:string)=>document.querySelector<T>(selector)!;
const root=$('#game'),start=$('#start-screen'),hudElement=$('#hud'),death=$('#death-screen');
const settings=new SettingsManager();settings.bind();
const renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance'});
renderer.setPixelRatio(Math.min(devicePixelRatio,1.65));renderer.setSize(innerWidth,innerHeight);renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.08;root.prepend(renderer.domElement);

const atmosphere={DESERT:{sky:'#ad8561',fog:'#b58d68',hemi:'#f5d8aa',ground:'#403a35',sun:'#ffd69e'},REFINERY:{sky:'#705f51',fog:'#77685c',hemi:'#d6c3a8',ground:'#25292a',sun:'#ffd19a'},NIGHT_LAB:{sky:'#122129',fog:'#172c34',hemi:'#7acbd0',ground:'#11171b',sun:'#8edbe0'}}[settings.value.map];
const scene=new THREE.Scene();scene.background=new THREE.Color(atmosphere.sky);scene.fog=new THREE.FogExp2(atmosphere.fog,settings.value.map==='NIGHT_LAB'?.012:.0085);
const camera=new THREE.PerspectiveCamera(72,innerWidth/innerHeight,.05,155);scene.add(camera);
const weaponLight=new THREE.PointLight('#ffd9a8',3.4,5,2);weaponLight.position.set(.35,.25,.55);camera.add(weaponLight);
scene.add(new THREE.HemisphereLight(atmosphere.hemi,atmosphere.ground,2.05));
const sun=new THREE.DirectionalLight(atmosphere.sun,settings.value.map==='NIGHT_LAB'?1.45:2.75);sun.position.set(-28,44,18);sun.castShadow=true;sun.shadow.mapSize.set(1024,1024);sun.shadow.camera.left=-56;sun.shadow.camera.right=56;sun.shadow.camera.top=56;sun.shadow.camera.bottom=-56;scene.add(sun);

const level=buildLevel(settings.value.map);scene.add(level.group);
const audio=new SynthAudio(),player=new PlayerController(),director=new DroneDirector(scene,level,audio),weapons=new WeaponSystem(scene,audio),debug=new DebugView(scene,level),input=new InputManager(renderer.domElement),hud=new HUDController(),effects=new EffectsManager(scene),waves=new WaveDirector(level,director),progression=new ProgressionSystem(),score=new ScoreSystem();
camera.add(weapons.model);audio.setVolume(settings.value.masterVolume);input.sensitivity=settings.value.sensitivity;director.setDifficulty(settings.value.difficulty);waves.setDifficulty(settings.value.difficulty);

const escortCore=new THREE.Mesh(new THREE.IcosahedronGeometry(.55,1),new THREE.MeshStandardMaterial({color:'#8ff8ff',emissive:'#20aebb',emissiveIntensity:2,metalness:.58,roughness:.2}));escortCore.visible=false;scene.add(escortCore);
const FIXED=1/120;
let playing=false,dead=false,upgradeOpen=false,last=performance.now()/1000,accumulator=0,physicsSteps=0,physicsPaused=false,stepOnce=false;
let health=100,maxHealth=100,lastDamage=-99,startedAt=0,sounds:SoundEvent[]=[],stepTimer=0,shake=0,shakeTime=0,hudTimer=0,teleportIndex=0,freeCamera=false,selectedDrone=0,bossPhase=1,leanVisual=0;
const freeCameraPosition=new THREE.Vector3();
const hazards:{position:THREE.Vector3;radius:number;expires:number;damage:number}[]=[];
const query=new URLSearchParams(location.search),qaMode=location.hostname==='127.0.0.1'&&query.has('qa');

input.onFire=pressed=>weapons.trigger=pressed;
input.onAds=pressed=>weapons.ads=pressed;
input.onSelectWeapon=index=>weapons.select(index);
input.onReload=()=>weapons.startReload();
input.onJump=()=>player.jump();
input.onUpgradeChoice=index=>chooseUpgrade(index);
player.onFallDamage=amount=>damagePlayer(amount,player.position.clone().add(new THREE.Vector3(0,8,0)));
input.onDebugToggle=()=>debug.toggle(director);
input.onDebugPause=()=>{physicsPaused=!physicsPaused;hud.showToast(physicsPaused?'SIMULAÇÃO PAUSADA':'SIMULAÇÃO ATIVA');};
input.onDebugStep=()=>{physicsPaused=true;stepOnce=true;};
input.onDebugFreeCamera=()=>{freeCamera=!freeCamera;if(freeCamera)freeCameraPosition.copy(camera.position);hud.showToast(freeCamera?'CÂMERA LIVRE ATIVA':'CÂMERA DO OPERADOR');};
input.onDebugTeleport=()=>{const points=[level.objectivePoints.A,level.objectivePoints.B,new THREE.Vector3(0,0,3),new THREE.Vector3(0,0,-35)];player.teleport(points[teleportIndex++%points.length].clone().add(new THREE.Vector3(0,0,2)));hud.showToast('OPERADOR REPOSICIONADO');};
input.onDebugForceState=()=>{const alive=director.drones.filter(drone=>drone.alive);if(alive.length){alive[selectedDrone%alive.length].forceNextState();hud.showToast(`ESTADO DE D-${String(alive[selectedDrone%alive.length].id).padStart(2,'0')} AVANÇADO`);}else director.forceStates();};
input.onDebugSelectDrone=()=>{const alive=director.drones.filter(drone=>drone.alive);if(!alive.length)return;selectedDrone=(selectedDrone+1)%alive.length;hud.showToast(`SELECIONADO D-${String(alive[selectedDrone].id).padStart(2,'0')} ${alive[selectedDrone].type}`);};

async function begin(){if(dead||upgradeOpen)return;await audio.resume();input.requestLock();hud.showTutorial('ORIENTAÇÃO','WASD move · CTRL agacha/desliza · Q/E inclina · SHIFT corre ou estabiliza a Widow');}
$('#play-button').addEventListener('click',begin);$('#restart-button').addEventListener('click',()=>location.reload());
document.addEventListener('pointerlockchange',()=>{playing=input.locked&&!dead&&!upgradeOpen;start.classList.toggle('visible',!playing&&!dead&&!upgradeOpen);hudElement.classList.toggle('hidden',!playing&&waves.wave===0&&!upgradeOpen);if(playing){startedAt=startedAt||performance.now()/1000;last=performance.now()/1000;$('#pause-reason').textContent='Sinal restabelecido.';}else if(!dead&&!upgradeOpen)$('#pause-reason').textContent='Jogo pausado — clique para retomar.';});
addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setPixelRatio(Math.min(devicePixelRatio,1.65));renderer.setSize(innerWidth,innerHeight);});
renderer.domElement.addEventListener('webglcontextlost',event=>{event.preventDefault();playing=false;$('#context-message').classList.add('visible');});renderer.domElement.addEventListener('webglcontextrestored',()=>{$('#context-message').classList.remove('visible');location.reload();});

weapons.onSound=event=>{sounds.push(event);hud.soundPulse();};
weapons.onShot=()=>score.shot();
weapons.onHit=critical=>{hud.hit(critical);score.hit(critical);};
weapons.onKill=(drone,critical)=>score.kill(drone.type,critical,performance.now()/1000);
weapons.onShake=amount=>{shake=Math.max(shake,amount*settings.value.shake);shakeTime=.13;};
weapons.onHud=()=>hud.updateWeapon(weapons);
weapons.onTracer=(a,b,color)=>effects.tracer(a,b,color);
score.onChange=()=>hud.updateScore(score.score,score.multiplier,score.rank);
director.onPlayerDamage=(amount,source)=>damagePlayer(amount,source);
director.onDroneKilled=drone=>hud.feed(`${drone.type} D-${String(drone.id).padStart(2,'0')} neutralizado`,'success');
director.spawnEnemyTracer=(a,b,hit)=>effects.tracer(a,b,hit?'#ff765f':'#efbd68');
director.onSupportPulse=(a,b)=>effects.tracer(a,b,'#87e188');
director.onJammer=(_position,active)=>{if(active)hud.setRadarDisabled(true);};
director.onKamikazeBlast=(position,damage)=>{audio.explosion();effects.areaWarning(position,4,.38,'#ff7a2e');if(player.position.distanceTo(position)<4.2)damagePlayer(damage,position);};
director.onEngineerDeploy=position=>{position.y=level.floorHeightAt(position.x,position.z);director.spawn(position.add(new THREE.Vector3(1.5,0,0)),'TURRET');hud.feed('ENGENHEIRO implantou uma torre','danger');};
director.onBossPhase=(_boss,phase)=>{bossPhase=phase;audio.boss();hud.showToast(`OBELISCO // FASE ${phase}`);};
director.onCommanderSummon=(position,phase)=>{for(let i=0;i<phase;i++){const angle=i/phase*Math.PI*2;director.spawn(position.clone().add(new THREE.Vector3(Math.cos(angle)*5,0,Math.sin(angle)*5)),phase===3?'SHIELD':'SCOUT');}};
director.onBossAttack=(_origin,target,phase)=>{target.y=level.floorHeightAt(target.x,target.z);const radius=4+phase;const expires=performance.now()/1000+1.35;effects.areaWarning(target,radius,1.35,'#ff4c3d');hazards.push({position:target,radius,expires,damage:18+phase*6});hud.feed('ATAQUE DE ÁREA MARCADO','danger');};
director.onStateChange=(drone,_from,to)=>{if(to==='COMBATE')hud.feed(`D-${String(drone.id).padStart(2,'0')} confirmou contato`,'danger');else if(to==='SUSPEITA')hud.feed(`D-${String(drone.id).padStart(2,'0')} investigando sinal`,'info');};
waves.onAnnouncement=(message,tone)=>{hud.showToast(message);hud.feed(message,tone);if(waves.objective==='BOSS')audio.boss();};
waves.onUpgradeRequired=wave=>openUpgrade(wave);
settings.onChange=value=>{input.sensitivity=value.sensitivity;audio.setVolume(value.masterVolume);director.setDifficulty(value.difficulty);waves.setDifficulty(value.difficulty);if(value.map!==level.variant)location.reload();};

function openUpgrade(wave:number){upgradeOpen=true;playing=false;weapons.trigger=false;const choices=progression.offer(wave);hud.showUpgrades(choices,chooseUpgrade);hudElement.classList.remove('hidden');start.classList.remove('visible');if(document.pointerLockElement)document.exitPointerLock();}
function chooseUpgrade(index:number){if(!upgradeOpen)return;const choice=progression.choose(index);if(!choice)return;if(choice.id==='SHIELD'){maxHealth+=25;health=Math.min(maxHealth,health+25);}weapons.applyProgression(progression);audio.upgrade();hud.showToast(`${choice.name.toUpperCase()} INSTALADO`);hud.hideUpgrades();hud.updateVitals(health,maxHealth);waves.resumeAfterUpgrade();upgradeOpen=false;start.classList.add('visible');void begin();}

function damagePlayer(amount:number,source:THREE.Vector3){if(dead)return;health=Math.max(0,health-amount);lastDamage=performance.now()/1000;shake=.25*settings.value.shake;shakeTime=.18;score.damageTaken();hud.damageDirection(player.position,source,input.yaw);hud.updateVitals(health,maxHealth);if(health<=0)die();}
function die(){dead=true;playing=false;if(document.pointerLockElement)document.exitPointerLock();hudElement.classList.add('hidden');death.classList.add('visible');const survived=performance.now()/1000-startedAt;$('#sum-wave').textContent=String(waves.wave);$('#sum-time').textContent=`${Math.floor(survived/60)}:${String(Math.floor(survived%60)).padStart(2,'0')}`;$('#sum-accuracy').textContent=`${Math.round(score.accuracy*100)}%`;$('#sum-hits').textContent=String(score.hits);$('#sum-score').textContent=String(score.score);$('#sum-rank').textContent=score.rank;}

function simulate(dt:number,now:number){
  if(!playing||upgradeOpen)return;
  if(physicsPaused&&!stepOnce)return;stepOnce=false;
  const movement=input.movement();
  weapons.holdingBreath=weapons.current===3&&weapons.ads&&input.sprinting;
  const canSprint=input.sprinting&&!weapons.holdingBreath;
  if(freeCamera){const forward=new THREE.Vector3(-Math.sin(input.yaw),0,-Math.cos(input.yaw)),right=new THREE.Vector3(Math.cos(input.yaw),0,-Math.sin(input.yaw));freeCameraPosition.addScaledVector(forward,movement.z*12*dt).addScaledVector(right,movement.x*12*dt);if(input.keys.has('Space'))freeCameraPosition.y+=8*dt;if(input.keys.has('ControlLeft'))freeCameraPosition.y-=8*dt;}
  else player.update(dt,movement,input.yaw,canSprint,level.colliders,input.crouching);
  const moving=!freeCamera&&movement.lengthSq()>0&&player.grounded;stepTimer-=dt;if(moving&&stepTimer<=0){stepTimer=player.sliding?.18:canSprint?.28:input.crouching?.58:.42;audio.step(level.surfaceAt(player.position.x,player.position.z));sounds.push({position:player.position.clone(),radius:canSprint?12:input.crouching?3:7,time:now,kind:'step'});hud.soundPulse();}
  sounds=sounds.filter(sound=>now-sound.time<1.3);
  const playerEye=player.position.clone().add(new THREE.Vector3(0,1.1,0));
  director.update(dt,now,playerEye,sounds);waves.update(dt,player.position);weapons.update(dt,now,camera,level,director,input.mouseDelta);
  for(let i=hazards.length-1;i>=0;i--){if(now<hazards[i].expires)continue;const hazard=hazards.splice(i,1)[0];audio.explosion();if(player.position.distanceTo(hazard.position)<hazard.radius)damagePlayer(hazard.damage,hazard.position);}
  if(now-lastDamage>progression.regenDelay&&health<maxHealth){health=Math.min(maxHealth,health+8*dt);hud.updateVitals(health,maxHealth);}
  collectAmmo();
}

function collectAmmo(){for(const point of level.ammoPoints){if(player.position.distanceTo(point)>=1.45)continue;const mesh=level.group.children.find(object=>object.name==='ammo'&&object.position.distanceTo(point)<1) as THREE.Mesh|undefined;if(!mesh?.visible)continue;mesh.visible=false;weapons.reserves=weapons.reserves.map((value,index)=>Math.min(value+WEAPON_SPECS[index].magSize*2,WEAPON_SPECS[index].magSize*6));audio.pickup();hud.showToast('MUNIÇÃO REABASTECIDA');hud.updateWeapon(weapons);setTimeout(()=>{mesh.visible=true;},18000);}}

function render(now:number,dt:number){
  leanVisual=THREE.MathUtils.damp(leanVisual,input.lean*.09,12,dt);camera.rotation.order='YXZ';camera.rotation.y=input.yaw+weapons.recoilYaw;camera.rotation.x=input.pitch-weapons.recoilPitch;camera.rotation.z=-leanVisual;
  if(freeCamera)camera.position.copy(freeCameraPosition);else{camera.position.copy(player.position).add(new THREE.Vector3(0,player.eyeHeight,0));camera.position.x+=Math.cos(input.yaw)*leanVisual*3.5;camera.position.z-=Math.sin(input.yaw)*leanVisual*3.5;}
  if(shakeTime>0){shakeTime-=dt;camera.position.x+=(Math.random()-.5)*shake;camera.position.y+=(Math.random()-.5)*shake;shake*=.86;}
  const sniperScope=weapons.current===3&&weapons.ads&&!freeCamera;root.classList.toggle('sniper-scope',sniperScope);camera.fov=THREE.MathUtils.damp(camera.fov,weapons.ads?(weapons.current===3?24:54):72,weapons.current===3?9:12,dt);camera.updateProjectionMatrix();weapons.model.position.z=weapons.ads?-.2:0;weapons.model.visible=!freeCamera&&!sniperScope;
  escortCore.visible=waves.objective==='ESCORT'&&waves.phase!=='INTERVALO'&&waves.phase!=='UPGRADE';escortCore.position.copy(waves.escortPosition).setY(level.floorHeightAt(waves.escortPosition.x,waves.escortPosition.z)+1);escortCore.rotation.y+=dt;escortCore.rotation.x+=dt*.45;
  if(sniperScope)weapons.measureRange(camera,level);audio.setListener(camera.position,new THREE.Vector3(0,0,-1).applyQuaternion(camera.quaternion));effects.update(dt);hud.update(dt);hud.updateSpread(weapons.currentSpread);hud.setScopeDistance(weapons.scopeDistance);hud.setRadarDisabled(waves.radarDisabled);hud.drawRadar(player.position,input.yaw,director.drones);
  hudTimer-=dt;if(hudTimer<=0){hudTimer=.08;const alive=director.drones.filter(drone=>drone.alive).length,boss=director.drones.find(drone=>drone.alive&&drone.type==='COMMANDER')??null;hud.updateMatch(waves.wave,waves.phase,alive,waves.objectiveLabel,waves.progress,waves.timer);hud.updateWeapon(weapons);hud.updateBoss(boss,bossPhase);hud.updateScore(score.score,score.multiplier,score.rank);}
  renderer.render(scene,camera);debug.update(now,renderer,player,director,weapons,physicsSteps,physicsPaused,waves.phase);
}

function loop(milliseconds:number){requestAnimationFrame(loop);const now=milliseconds/1000,frame=Math.min(.1,now-last);last=now;physicsSteps=0;if(playing){accumulator+=frame;while(accumulator>=FIXED&&physicsSteps<14){simulate(FIXED,now);accumulator-=FIXED;physicsSteps++;}}render(now,frame);}

hud.updateVitals(health,maxHealth);hud.updateWeapon(weapons);hud.updateScore(0,1,'D');hud.updateMatch(0,'INTERVALO',0,'PREPARAR',0,3);
if(qaMode){void audio.resume();playing=true;startedAt=performance.now()/1000;start.classList.remove('visible');hudElement.classList.remove('hidden');const weapon=Number(query.get('weapon'));if(Number.isInteger(weapon)&&weapon>=0&&weapon<4)weapons.select(weapon);if(query.has('scope'))weapons.ads=true;if(query.has('boss')){waves.wave=5;waves.phase='BOSS';waves.objective='BOSS';director.spawn(new THREE.Vector3(0,0,18),'COMMANDER');}if(query.has('upgrades'))setTimeout(()=>openUpgrade(1),100);}
requestAnimationFrame(loop);
