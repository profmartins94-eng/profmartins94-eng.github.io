import * as THREE from 'three';
import type { LevelData } from './types';
import type { PlayerController } from './collision';
import type { DroneDirector } from './ai';
import type { WeaponSystem } from './weapons';

export class DebugView {
  enabled=false;
  private group=new THREE.Group();
  private dynamic=new THREE.Group();
  private statsEl=document.querySelector<HTMLElement>('#debug-stats')!;
  private aiEl=document.querySelector<HTMLElement>('#ai-states')!;
  private frames=0;private fps=0;private lastFps=0;
  constructor(scene:THREE.Scene,private level:LevelData){scene.add(this.group);this.group.add(this.dynamic);this.buildNav();this.group.visible=false;}
  toggle(director?:DroneDirector){this.enabled=!this.enabled;this.group.visible=this.enabled;director?.setDebugVisible(this.enabled);document.querySelector('#debug-panel')?.classList.toggle('hidden',!this.enabled);}
  update(now:number,renderer:THREE.WebGLRenderer,player:PlayerController,director:DroneDirector,weapons:WeaponSystem,physicsSteps:number,paused=false,phase='INCURSAO'){
    this.frames++;if(now-this.lastFps>=.5){this.fps=Math.round(this.frames/(now-this.lastFps));this.frames=0;this.lastFps=now;}
    if(!this.enabled)return;
    this.dynamic.clear();
    const circle=new THREE.EllipseCurve(0,0,player.radius,player.radius,0,Math.PI*2).getPoints(24).map(point=>new THREE.Vector3(point.x,0,point.y));
    const circleGeometry=new THREE.BufferGeometry().setFromPoints(circle),capsuleMaterial=new THREE.LineBasicMaterial({color:'#ffd26b'});
    const bottom=new THREE.LineLoop(circleGeometry,capsuleMaterial);bottom.position.copy(player.position).setY(player.position.y+.04);this.dynamic.add(bottom);
    const top=bottom.clone();top.position.y=player.position.y+player.height;this.dynamic.add(top);
    for(const normal of player.contactNormals){const a=player.position.clone().add(new THREE.Vector3(0,.8,0));this.dynamic.add(line(a,a.clone().addScaledVector(normal,1.5),'#ff7d61'));}
    for(const drone of director.drones){if(!drone.alive)continue;const position=drone.group.position.clone();
      const cone=new THREE.Shape();cone.moveTo(0,0);const range=Math.min(14,drone.spec.visionRange*.35),angle=THREE.MathUtils.degToRad(drone.type==='SNIPER'?38:52);for(let i=0;i<=12;i++){const value=-angle+angle*2*i/12;cone.lineTo(Math.sin(value)*range,-Math.cos(value)*range);}cone.lineTo(0,0);
      const vision=new THREE.Mesh(new THREE.ShapeGeometry(cone),new THREE.MeshBasicMaterial({color:drone.visionVisible?'#ff665c':'#67d8d5',transparent:true,opacity:.11,side:THREE.DoubleSide,depthWrite:false}));vision.rotation.x=-Math.PI/2;vision.rotation.z=drone.group.rotation.y;vision.position.copy(position).setY(.045);this.dynamic.add(vision);
      this.dynamic.add(line(position,player.position.clone().add(new THREE.Vector3(0,1.1,0)),drone.visionVisible?'#ff6d59':'#52615d'));
      if(drone.path.length){const points=[position,...drone.path.slice(drone.pathIndex).map(point=>point.clone().setY(.12))];this.dynamic.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(points),new THREE.LineBasicMaterial({color:'#f3b855'})));}
      if(drone.lastKnown){const mark=new THREE.Mesh(new THREE.RingGeometry(.35,.5,16),new THREE.MeshBasicMaterial({color:'#ff826c',side:THREE.DoubleSide}));mark.rotation.x=-Math.PI/2;mark.position.copy(drone.lastKnown).setY(.07);this.dynamic.add(mark);}
    }
    if(weapons.lastRay)this.dynamic.add(line(weapons.lastRay.start,weapons.lastRay.end,'#fff1b2'));
    const info=renderer.info.render;
    this.statsEl.textContent=`FPS             ${this.fps}\nFÍSICA / FRAME  ${physicsSteps}\nSUBPASSOS       ${player.physicsSubsteps}\nSIMULAÇÃO       ${paused?'PAUSADA':phase}\nDRAW CALLS      ${info.calls}\nTRIÂNGULOS       ${info.triangles.toLocaleString('pt-BR')}\nDRONES ATIVOS   ${director.drones.filter(drone=>drone.alive).length}\nNAV NODES       ${this.level.navNodes.length}\nCONTATOS        ${player.contactNormals.length}`;
    const current=director.drones.filter(drone=>drone.alive).map(drone=>`<span><b>D-${String(drone.id).padStart(2,'0')}</b> ${drone.type} · ${drone.state} · ${Math.ceil(drone.health)}/${drone.spec.health}</span>`).join('');
    const history=director.stateHistory.slice(0,4).map(item=>`<span class="history">${item}</span>`).join('');
    this.aiEl.innerHTML=current+(history?`<hr>${history}`:'');
  }
  private buildNav(){const safe:number[]=[],exposed:number[]=[];for(const node of this.level.navNodes){for(const link of node.links){if(link<node.id)continue;const target=node.exposure>.7?exposed:safe;target.push(node.pos.x,.06,node.pos.z,this.level.navNodes[link].pos.x,.06,this.level.navNodes[link].pos.z);}}for(const [points,color] of [[safe,'#56cbc9'],[exposed,'#f0b857']] as const){const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(points,3));this.group.add(new THREE.LineSegments(geometry,new THREE.LineBasicMaterial({color,transparent:true,opacity:.16})));}}
}

function line(a:THREE.Vector3,b:THREE.Vector3,color:string){return new THREE.Line(new THREE.BufferGeometry().setFromPoints([a,b]),new THREE.LineBasicMaterial({color}));}
