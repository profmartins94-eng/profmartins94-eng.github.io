import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { PlayerController, rampHeight, sweepCircleAabb } from '../src/collision';
import type { Collider, DroneType } from '../src/types';
import { WEAPON_SPECS } from '../src/weapons';
import { DRONE_SPECS } from '../src/ai';
import { ProgressionSystem, ScoreSystem } from '../src/progression';

test('sweep contínuo intercepta uma parede mesmo em velocidade extrema',()=>{
  const box=new THREE.Box3(new THREE.Vector3(0,0,-2),new THREE.Vector3(1,4,2));
  const hit=sweepCircleAabb(new THREE.Vector2(-20,0),new THREE.Vector2(50,0),.5,box);
  assert.ok(hit);assert.ok(hit.time>0&&hit.time<1);assert.equal(hit.normal.x,-1);
});

test('correr diagonalmente contra uma quina nunca atravessa o manifold',()=>{
  const colliders:Collider[]=[
    {kind:'wall',box:new THREE.Box3(new THREE.Vector3(0,0,-8),new THREE.Vector3(1,5,8))},
    {kind:'wall',box:new THREE.Box3(new THREE.Vector3(-8,0,0),new THREE.Vector3(8,5,1))},
  ];
  const player=new PlayerController();player.position.set(-3,0,-3);
  for(let i=0;i<1200;i++)player.update(1/120,new THREE.Vector3(1,0,1),-Math.PI/2,true,colliders);
  assert.ok(player.position.x<=-.48,'não cruzou a parede X');assert.ok(player.position.z<=-.48,'não cruzou a parede Z');assert.ok(Number.isFinite(player.position.x)&&Number.isFinite(player.position.z));
});

test('rampa calcula altura contínua nos dois sentidos',()=>{
  const forward:Collider={kind:'ramp',box:new THREE.Box3(new THREE.Vector3(-2,0,-5),new THREE.Vector3(2,3,5)),ramp:{axis:'z',direction:1,minHeight:0,maxHeight:3}};
  const backward:Collider={...forward,ramp:{axis:'z',direction:-1,minHeight:0,maxHeight:3}};
  assert.equal(rampHeight(forward,0,-5),0);assert.equal(rampHeight(forward,0,5),3);assert.equal(rampHeight(backward,0,-5),3);assert.equal(rampHeight(backward,0,5),0);
});

test('raio central permanece central em diferentes FOV e proporções',()=>{
  for(const [fov,aspect] of [[54,16/9],[72,16/10],[95,4/3]]){
    const camera=new THREE.PerspectiveCamera(fov,aspect,.05,200);camera.position.set(4,2,-8);camera.rotation.set(.17,-.62,0);camera.updateMatrixWorld();camera.updateProjectionMatrix();
    const direction=new THREE.Vector3(0,0,-1).unproject(camera).sub(camera.position).normalize();const expected=new THREE.Vector3(0,0,-1).applyQuaternion(camera.quaternion).normalize();assert.ok(direction.angleTo(expected)<1e-6,`FOV ${fov} continua no centro`);
  }
});

test('sniper elimina até o chefe com um tiro limpo e mantém precisão de luneta',()=>{
  const sniper=WEAPON_SPECS.find(spec=>spec.type==='sniper');const maximumDroneHealth=Math.max(...Object.values(DRONE_SPECS).map(spec=>spec.health));
  assert.ok(sniper);assert.ok(sniper.damage>=maximumDroneHealth);assert.equal(sniper.magSize,5);assert.ok(sniper.adsSpread<.001);
});

test('catálogo inclui máquinas especiais e chefe',()=>{
  const required:DroneType[]=['KAMIKAZE','SHIELD','JAMMER','CLOAKED','ENGINEER','TURRET','COMMANDER'];
  for(const type of required)assert.equal(DRONE_SPECS[type].type,type);
  assert.ok(DRONE_SPECS.COMMANDER.health>DRONE_SPECS.HEAVY.health);
});

test('progressão oferece três melhorias e aplica multiplicadores',()=>{
  const progression=new ProgressionSystem();const choices=progression.offer(1);assert.equal(choices.length,3);const selected=choices.findIndex(choice=>choice.id==='FAST_RELOAD');const fallback=0;const choice=choices[selected>=0?selected:fallback];const before={damage:progression.damageMultiplier,reload:progression.reloadMultiplier};progression.choose(selected>=0?selected:fallback);
  if(choice.id==='FAST_RELOAD')assert.ok(progression.reloadMultiplier<before.reload);else assert.notDeepEqual({damage:progression.damageMultiplier,reload:progression.reloadMultiplier},before);
});

test('placar preserva precisão e classificação local sem navegador',()=>{
  const score=new ScoreSystem();score.shot();score.hit(true);score.kill('COMMANDER',true,1);assert.equal(score.accuracy,1);assert.ok(score.score>5000);assert.match(score.rank,/^[A-S][+]?|[B-D]$/);
});
