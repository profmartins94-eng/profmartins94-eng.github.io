import * as THREE from 'three';
import type { DroneState, SurfaceType } from './types';

export class SynthAudio {
  context:AudioContext|null=null;
  master:GainNode|null=null;
  listenerPosition=new THREE.Vector3();
  volume=.75;

  async resume(){
    if(!this.context){this.context=new AudioContext();this.master=this.context.createGain();this.master.gain.value=.36*this.volume;this.master.connect(this.context.destination);}
    await this.context.resume();
  }
  setVolume(value:number){this.volume=THREE.MathUtils.clamp(value,0,1);if(this.master&&this.context)this.master.gain.setTargetAtTime(.36*this.volume,this.context.currentTime,.04);}
  setListener(position:THREE.Vector3,forward:THREE.Vector3){
    this.listenerPosition.copy(position);if(!this.context)return;const l=this.context.listener,t=this.context.currentTime;
    l.positionX?.setTargetAtTime(position.x,t,.02);l.positionY?.setTargetAtTime(position.y,t,.02);l.positionZ?.setTargetAtTime(position.z,t,.02);
    l.forwardX?.setTargetAtTime(forward.x,t,.02);l.forwardY?.setTargetAtTime(forward.y,t,.02);l.forwardZ?.setTargetAtTime(forward.z,t,.02);
  }
  private tone(freq:number,duration:number,type:OscillatorType='square',gain=.15,slide=0){
    if(!this.context||!this.master)return; const t=this.context.currentTime,o=this.context.createOscillator(),g=this.context.createGain();
    o.type=type;o.frequency.setValueAtTime(freq,t);o.frequency.exponentialRampToValueAtTime(Math.max(30,freq+slide),t+duration);
    g.gain.setValueAtTime(gain,t);g.gain.exponentialRampToValueAtTime(.001,t+duration);o.connect(g).connect(this.master);o.start(t);o.stop(t+duration);
  }
  private noise(duration:number,gain=.12,lowpass=1200){
    if(!this.context||!this.master)return;const len=Math.ceil(this.context.sampleRate*duration),buf=this.context.createBuffer(1,len,this.context.sampleRate),data=buf.getChannelData(0);
    for(let i=0;i<len;i++)data[i]=(Math.random()*2-1)*(1-i/len);const src=this.context.createBufferSource(),filter=this.context.createBiquadFilter(),g=this.context.createGain();
    src.buffer=buf;filter.type='lowpass';filter.frequency.value=lowpass;g.gain.value=gain;src.connect(filter).connect(g).connect(this.master);src.start();
  }
  shot(type:string){if(type==='hitscan'){this.noise(.07,.28,1900);this.tone(92,.08,'sawtooth',.22,-50);this.tone(1450,.025,'square',.035,-700);}else if(type==='shotgun'){this.noise(.18,.38,900);this.tone(65,.16,'square',.2,-30);this.tone(190,.045,'triangle',.12,-80);}else if(type==='sniper'){this.noise(.2,.42,1350);this.tone(58,.28,'sawtooth',.3,-24);this.tone(980,.055,'square',.08,-620);}else{this.tone(420,.24,'sine',.16,-310);this.tone(860,.12,'triangle',.06,-300);this.noise(.12,.12,2500);}}
  impact(){this.tone(820,.035,'square',.05,-500);}
  reload(stage:'start'|'mag'|'end'){this.tone(stage==='mag'?260:stage==='start'?180:340,.06,'square',.07,-40);}
  step(surface:SurfaceType='sand'){const profile={sand:[.055,.035,230],stone:[.04,.045,520],metal:[.035,.052,1100]}[surface];this.noise(profile[0],profile[1],profile[2]);if(surface==='metal')this.tone(760,.025,'square',.018,-360);}
  upgrade(){this.tone(340,.08,'sine',.08,280);setTimeout(()=>this.tone(620,.11,'triangle',.07,260),75);}
  boss(){this.tone(54,.7,'sawtooth',.18,-18);this.noise(.65,.2,240);}
  explosion(){this.noise(.5,.42,420);this.tone(70,.36,'sawtooth',.22,-35);}
  droneShot(position:THREE.Vector3){this.spatialTone(position,610,.08,'sawtooth',.16,-290);}
  droneAlert(position:THREE.Vector3,state:DroneState){const frequency=state==='COMBATE'?880:state==='SUSPEITA'?520:state==='RECUO'?260:390;this.spatialTone(position,frequency,.12,state==='COMBATE'?'square':'sine',.075,state==='COMBATE'?-420:120);}
  shell(){this.tone(1700,.025,'square',.025,-900);setTimeout(()=>this.tone(520,.035,'square',.018,-180),55);}
  charge(level:number){this.tone(280+level*520,.035,'sine',.025,80);}
  pickup(){this.tone(390,.08,'sine',.1,320);}
  createDroneHum(position:THREE.Vector3){
    if(!this.context||!this.master)return null;const ctx=this.context,osc=ctx.createOscillator(),gain=ctx.createGain(),panner=ctx.createPanner();
    osc.type='sawtooth';osc.frequency.value=67;gain.gain.value=.035;panner.panningModel='HRTF';panner.distanceModel='inverse';panner.refDistance=3;panner.maxDistance=42;panner.rolloffFactor=1.3;
    panner.positionX.value=position.x;panner.positionY.value=position.y;panner.positionZ.value=position.z;osc.connect(gain).connect(panner).connect(this.master);osc.start();
    return{update:(p:THREE.Vector3)=>{const t=ctx.currentTime;panner.positionX.setTargetAtTime(p.x,t,.03);panner.positionY.setTargetAtTime(p.y,t,.03);panner.positionZ.setTargetAtTime(p.z,t,.03);},stop:()=>{gain.gain.setTargetAtTime(.0001,ctx.currentTime,.04);osc.stop(ctx.currentTime+.2);}};
  }
  private spatialTone(position:THREE.Vector3,freq:number,duration:number,type:OscillatorType,gainValue:number,slide:number){
    if(!this.context||!this.master)return;const t=this.context.currentTime,o=this.context.createOscillator(),g=this.context.createGain(),p=this.context.createPanner();
    o.type=type;o.frequency.setValueAtTime(freq,t);o.frequency.exponentialRampToValueAtTime(Math.max(30,freq+slide),t+duration);g.gain.setValueAtTime(gainValue,t);g.gain.exponentialRampToValueAtTime(.001,t+duration);
    p.panningModel='HRTF';p.distanceModel='inverse';p.refDistance=2;p.maxDistance=45;p.positionX.value=position.x;p.positionY.value=position.y;p.positionZ.value=position.z;o.connect(g).connect(p).connect(this.master);o.start(t);o.stop(t+duration);
  }
}
