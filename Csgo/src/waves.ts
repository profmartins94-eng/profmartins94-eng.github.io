import * as THREE from 'three';
import type { DroneDirector } from './ai';
import type { Difficulty, DroneType, LevelData, MatchPhase, ObjectiveType } from './types';

const OBJECTIVE_ROTATION:ObjectiveType[]=['ELIMINATE','CAPTURE','DEFEND','HUNT','ESCORT','BLACKOUT','SUPPLY'];

export class WaveDirector {
  wave=0;
  phase:MatchPhase='INTERVALO';
  timer=3;
  progress=0;
  objectiveLabel='PREPARAR';
  objective:ObjectiveType='ELIMINATE';
  defenseSite:'A'|'B'='A';
  radarDisabled=false;
  escortPosition=new THREE.Vector3();
  onAnnouncement=(_message:string,_tone:'info'|'danger'|'success')=>{};
  onUpgradeRequired=(_wave:number)=>{};
  private difficulty:Difficulty='TACTICAL';
  private supplied=new Set<number>();
  private objectiveStartAlive=1;

  constructor(private level:LevelData,private drones:DroneDirector){this.escortPosition.copy(level.objectivePoints.A);}

  setDifficulty(value:Difficulty){this.difficulty=value;}
  resumeAfterUpgrade(){if(this.phase!=='UPGRADE')return;this.phase='INTERVALO';this.timer=4;this.progress=0;this.objectiveLabel='REABASTECER E REPOSICIONAR';}

  update(dt:number,player:THREE.Vector3){
    const aliveDrones=this.drones.drones.filter(drone=>drone.alive);
    const alive=aliveDrones.length;
    this.radarDisabled=aliveDrones.some(drone=>drone.type==='JAMMER'&&drone.group.position.distanceTo(player)<20);
    if(this.phase==='UPGRADE')return;
    if(this.phase==='INTERVALO'){
      this.timer=Math.max(0,this.timer-dt);
      this.objectiveLabel='REABASTECER';
      if(this.timer<=0)this.startWave(player);
      return;
    }

    if(this.objective==='DEFEND'||this.objective==='CAPTURE'){
      const target=this.level.objectivePoints[this.defenseSite];
      const inside=player.distanceTo(target)<7;
      const contested=aliveDrones.some(drone=>drone.group.position.distanceTo(target)<7);
      if(inside&&!contested)this.progress=Math.min(1,this.progress+dt/(this.objective==='CAPTURE'?12:18));
      else if(!inside)this.progress=Math.max(0,this.progress-dt/34);
      this.objectiveLabel=contested?`SETOR ${this.defenseSite} CONTESTADO`:inside?`${this.objective==='CAPTURE'?'CAPTURANDO':'DEFENDENDO'} SETOR ${this.defenseSite}`:`RETORNE AO SETOR ${this.defenseSite}`;
      if(this.progress>=1){this.drones.destroyAll();this.finishWave();return;}
    }else if(this.objective==='ESCORT'){
      const destination=this.level.objectivePoints.B;
      const near=player.distanceTo(this.escortPosition)<8;
      if(near){this.escortPosition.lerp(destination,dt/24);this.progress=1-this.escortPosition.distanceTo(destination)/this.level.objectivePoints.A.distanceTo(destination);}
      this.objectiveLabel=near?'ESCOLTANDO NÚCLEO DE DADOS':'RETORNE AO NÚCLEO DE DADOS';
      if(this.progress>=.985){this.drones.destroyAll();this.finishWave();return;}
    }else if(this.objective==='BLACKOUT'){
      const jammers=aliveDrones.filter(drone=>drone.type==='JAMMER').length;
      this.progress=1-jammers/Math.max(1,this.objectiveStartAlive);
      this.objectiveLabel=`DESTRUIR BLOQUEADORES // ${jammers} RESTANTES`;
      if(jammers===0){this.drones.destroyAll();this.finishWave();return;}
    }else if(this.objective==='SUPPLY'){
      this.level.ammoPoints.slice(0,3).forEach((point,index)=>{if(player.distanceTo(point)<2.1)this.supplied.add(index);});
      this.progress=this.supplied.size/3;
      this.objectiveLabel=`RECUPERAR SUPRIMENTOS // ${this.supplied.size}/3`;
      if(this.supplied.size===3){this.drones.destroyAll();this.finishWave();return;}
    }else if(this.objective==='BOSS'){
      const boss=aliveDrones.find(drone=>drone.type==='COMMANDER');
      this.progress=boss?1-boss.health/boss.spec.health:1;
      this.objectiveLabel=boss?`OBELISCO // NÚCLEO ${Math.ceil(boss.health)}`:'OBELISCO DESTRUÍDO';
    }else{
      this.progress=alive?1-alive/Math.max(1,this.drones.spawnedThisWave):1;
      this.objectiveLabel=this.objective==='HUNT'?'CAÇAR UNIDADE DE COMANDO':'ELIMINAR SINAIS';
    }
    if(alive===0)this.finishWave();
  }

  private startWave(player:THREE.Vector3){
    this.wave++;
    this.objective=this.wave%5===0?'BOSS':OBJECTIVE_ROTATION[(this.wave-1)%OBJECTIVE_ROTATION.length];
    this.phase=this.objective==='BOSS'?'BOSS':this.objective==='DEFEND'||this.objective==='CAPTURE'?'DEFESA':'INCURSAO';
    this.progress=0;this.supplied.clear();this.defenseSite=this.wave%2===0?'B':'A';this.escortPosition.copy(this.level.objectivePoints.A);
    const composition=this.composition(this.wave);
    this.drones.spawnedThisWave=composition.length;
    composition.forEach((type,index)=>{
      const spawn=type==='COMMANDER'?{position:new THREE.Vector3(0,0,-5)}:this.pickSpawn(player,index);
      const position=spawn.position.clone();position.x+=(Math.random()-.5)*1.6;position.z+=(Math.random()-.5)*1.6;
      this.drones.spawn(position,type);
    });
    this.objectiveStartAlive=Math.max(1,composition.filter(type=>type==='JAMMER').length);
    const message=this.objective==='BOSS'?'ALERTA: OBELISCO DE COMANDO':this.objective==='ESCORT'?'ESCOLTE O NÚCLEO DE DADOS':this.objective==='BLACKOUT'?'RESTAURE O RADAR':this.objective==='SUPPLY'?'RECUPERE OS SUPRIMENTOS':this.objective==='DEFEND'||this.objective==='CAPTURE'?`${this.objective==='CAPTURE'?'CAPTURE':'DEFENDA'} O SETOR ${this.defenseSite}`:`INCURSÃO ${String(this.wave).padStart(2,'0')} // ${composition.length} SINAIS`;
    this.onAnnouncement(message,this.objective==='BOSS'?'danger':'info');
  }

  private finishWave(){
    if(this.phase==='UPGRADE'||this.phase==='INTERVALO')return;
    this.onAnnouncement(`INCURSÃO ${String(this.wave).padStart(2,'0')} CONTIDA`,'success');
    this.drones.clear();this.phase='UPGRADE';this.progress=1;this.objectiveLabel='ESCOLHA UMA MELHORIA';this.onUpgradeRequired(this.wave);
  }

  private composition(wave:number):DroneType[]{
    if(wave%5===0)return['COMMANDER','SHIELD','JAMMER',wave>=10?'ENGINEER':'ASSAULT'];
    const scale=this.difficulty==='RECRUIT'?.78:this.difficulty==='NIGHTMARE'?1.28:1;
    const count=Math.min(Math.ceil((4+wave*1.65)*scale),22),types:DroneType[]=[];
    for(let i=0;i<count;i++){
      if(this.objective==='BLACKOUT'&&i<Math.min(3,1+Math.floor(wave/4)))types.push('JAMMER');
      else if(this.objective==='HUNT'&&i===0)types.push(wave>7?'SHIELD':'HEAVY');
      else if(wave>=8&&i%11===0)types.push('ENGINEER');
      else if(wave>=7&&i%10===0)types.push('CLOAKED');
      else if(wave>=6&&i%9===0)types.push('SHIELD');
      else if(wave>=4&&i%8===0)types.push('KAMIKAZE');
      else if(wave>=5&&i%7===0)types.push('HEAVY');
      else if(wave>=4&&i%6===0)types.push('SUPPORT');
      else if(wave>=3&&i%5===0)types.push('SNIPER');
      else if(i%3===0)types.push('SCOUT');
      else types.push('ASSAULT');
    }
    return types;
  }

  private pickSpawn(player:THREE.Vector3,index:number){
    const safe=this.level.spawnPoints.filter(spawn=>spawn.position.distanceTo(player)>18&&!this.drones.lineOfSight(spawn.position.clone().setY(1.6),player.clone().setY(1.2)));
    const source=safe.length?safe:this.level.spawnPoints;
    return source[(index+this.wave*2)%source.length];
  }
}
