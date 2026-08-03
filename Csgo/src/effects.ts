import * as THREE from 'three';

interface Tracer { line:THREE.Line; life:number; active:boolean; }
interface Pulse { mesh:THREE.Mesh; life:number; duration:number; radius:number; active:boolean; }

export class EffectsManager {
  private tracers:Tracer[]=[];
  private pulses:Pulse[]=[];
  constructor(private scene:THREE.Scene){
    for(let i=0;i<32;i++){const geometry=new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(),new THREE.Vector3()]);const line=new THREE.Line(geometry,new THREE.LineBasicMaterial({color:'#efbd68',transparent:true,opacity:0}));line.visible=false;scene.add(line);this.tracers.push({line,life:0,active:false});}
    for(let i=0;i<12;i++){const mesh=new THREE.Mesh(new THREE.RingGeometry(.88,1,48),new THREE.MeshBasicMaterial({color:'#ff5a3d',transparent:true,opacity:0,side:THREE.DoubleSide,depthWrite:false}));mesh.rotation.x=-Math.PI/2;mesh.visible=false;scene.add(mesh);this.pulses.push({mesh,life:0,duration:0,radius:1,active:false});}
  }
  tracer(a:THREE.Vector3,b:THREE.Vector3,color:string){const tracer=this.tracers.find(item=>!item.active)??this.tracers[0];tracer.active=true;tracer.life=.1;tracer.line.visible=true;(tracer.line.material as THREE.LineBasicMaterial).color.set(color);(tracer.line.material as THREE.LineBasicMaterial).opacity=.85;tracer.line.geometry.setFromPoints([a,b]);}
  areaWarning(position:THREE.Vector3,radius=5,duration=1.25,color='#ff5a3d'){const pulse=this.pulses.find(item=>!item.active)??this.pulses[0];pulse.active=true;pulse.life=duration;pulse.duration=duration;pulse.radius=radius;pulse.mesh.visible=true;pulse.mesh.position.copy(position).setY(position.y+.035);pulse.mesh.scale.setScalar(radius);(pulse.mesh.material as THREE.MeshBasicMaterial).color.set(color);}
  update(dt:number){for(const tracer of this.tracers){if(!tracer.active)continue;tracer.life-=dt;(tracer.line.material as THREE.LineBasicMaterial).opacity=Math.max(0,tracer.life/.1);if(tracer.life<=0){tracer.active=false;tracer.line.visible=false;}}for(const pulse of this.pulses){if(!pulse.active)continue;pulse.life-=dt;const t=1-pulse.life/pulse.duration;pulse.mesh.scale.setScalar(pulse.radius*(.7+t*.3));(pulse.mesh.material as THREE.MeshBasicMaterial).opacity=Math.sin(Math.max(0,pulse.life)*18)*.18+.42*(pulse.life/pulse.duration);if(pulse.life<=0){pulse.active=false;pulse.mesh.visible=false;}}}
}
