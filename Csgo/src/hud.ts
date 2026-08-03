import * as THREE from 'three';
import type { Drone } from './ai';
import type { UpgradeChoice } from './progression';
import type { MatchPhase } from './types';
import { WEAPON_SPECS, type WeaponSystem } from './weapons';

const $=<T extends HTMLElement>(selector:string)=>document.querySelector<T>(selector)!;

export class HUDController {
  private toastTimer=0;
  private tutorialTimer=9;
  private feedItems:{element:HTMLElement;life:number}[]=[];
  private radarDisabled=false;
  updateVitals(health:number,maxHealth=100){$('#health').textContent=String(Math.ceil(health));$('#health-fill').style.width=`${THREE.MathUtils.clamp(health/maxHealth*100,0,100)}%`;}
  updateWeapon(weapons:WeaponSystem){const spec=WEAPON_SPECS[weapons.current];$('#weapon-name').textContent=spec.name;$('#mag').textContent=String(weapons.mags[weapons.current]).padStart(2,'0');$('#reserve').textContent=String(weapons.reserves[weapons.current]).padStart(3,'0');$('#reload-state').textContent=weapons.reloading?weapons.reloadStage:weapons.boltTimer>0?weapons.reloadStage:weapons.charging?`CARGA ${Math.round(weapons.charge/1.5*100)}%`:weapons.current===3&&weapons.ads&&weapons.holdingBreath?'PULSO ESTÁVEL':'';document.querySelectorAll('#weapon-slots span').forEach((element,index)=>element.classList.toggle('active',index===weapons.current));}
  updateMatch(wave:number,phase:MatchPhase,enemies:number,label:string,progress:number,timer:number){$('#wave').textContent=String(wave).padStart(2,'0');$('#wave-state').textContent=phase==='INCURSAO'?'INCURSÃO':phase;$('#enemies').textContent=String(enemies);$('#objective-label').textContent=label;$('#objective-fill').style.width=`${Math.round(progress*100)}%`;const banner=$('#phase-banner');banner.classList.toggle('show',phase==='INTERVALO');$('#phase-kicker').textContent=wave===0?'PRIMEIRA INCURSÃO':'PRÓXIMA INCURSÃO';$('#phase-timer').textContent=timer.toFixed(1);}
  updateScore(score:number,multiplier:number,rank:string){$('#score').textContent=Math.floor(score).toString().padStart(6,'0');$('#multiplier').textContent=`×${multiplier.toFixed(1)}`;$('#rank').textContent=rank;}
  updateBoss(boss:Drone|null,phase=1){const bar=$('#boss-bar');bar.classList.toggle('show',!!boss);if(!boss)return;$('#boss-fill').style.width=`${Math.max(0,boss.health/boss.spec.health*100)}%`;$('#boss-phase').textContent=`FASE ${['I','II','III'][phase-1]??phase}`;}
  showUpgrades(choices:UpgradeChoice[],select:(index:number)=>void){const panel=$('#upgrade-panel');const cards=$('#upgrade-cards');cards.replaceChildren();choices.forEach((choice,index)=>{const button=document.createElement('button');button.className='upgrade-card';button.innerHTML=`<small>${7+index}</small><b>${choice.name}</b><span>${choice.description}</span><i>${choice.level}</i>`;button.addEventListener('click',()=>select(index));cards.append(button);});panel.classList.add('visible');}
  hideUpgrades(){$('#upgrade-panel').classList.remove('visible');}
  showTutorial(title:string,text:string,duration=7){$('#tutorial-title').textContent=title;$('#tutorial-text').textContent=text;$('#tutorial').classList.add('show');this.tutorialTimer=duration;}
  setScopeDistance(distance:number){const label=document.querySelector<HTMLElement>('#scope-overlay span');if(label)label.textContent=`8× // DIST ${Math.round(distance).toString().padStart(3,'0')}M`;}
  setRadarDisabled(disabled:boolean){this.radarDisabled=disabled;$('#radar').classList.toggle('jammed',disabled);}
  updateSpread(spread:number){$('#crosshair').style.setProperty('--spread',`${THREE.MathUtils.clamp(spread*380,4,28)}px`);}
  showToast(text:string){const element=$('#toast');element.textContent=text;element.classList.add('show');this.toastTimer=2.4;}
  feed(text:string,tone:'info'|'danger'|'success'='info'){const element=document.createElement('span');element.className=tone;element.textContent=text;$('#status-feed').prepend(element);this.feedItems.push({element,life:3.5});while(this.feedItems.length>4)this.feedItems.shift()?.element.remove();}
  hit(critical=false){const element=$('#hitmarker');element.textContent=critical?'◆':'×';element.classList.remove('show','critical');if(critical)element.classList.add('critical');void element.offsetWidth;element.classList.add('show');}
  soundPulse(){const element=$('#sound-pulse');element.classList.remove('pulse');void element.offsetWidth;element.classList.add('pulse');}
  damageDirection(player:THREE.Vector3,source:THREE.Vector3,yaw:number){const local=source.clone().sub(player);const angle=Math.atan2(local.x,local.z)-yaw;const element=$('#damage-direction');element.style.transform=`translateX(-50%) rotate(${angle}rad)`;element.classList.remove('show');void element.offsetWidth;element.classList.add('show');$('#damage-flash').classList.remove('show');void $('#damage-flash').offsetWidth;$('#damage-flash').classList.add('show');}
  update(dt:number){if(this.toastTimer>0){this.toastTimer-=dt;if(this.toastTimer<=0)$('#toast').classList.remove('show');}if(this.tutorialTimer>0){this.tutorialTimer-=dt;if(this.tutorialTimer<=0)$('#tutorial').classList.remove('show');}for(let i=this.feedItems.length-1;i>=0;i--){this.feedItems[i].life-=dt;if(this.feedItems[i].life<=0){this.feedItems[i].element.remove();this.feedItems.splice(i,1);}}}
  drawRadar(player:THREE.Vector3,yaw:number,drones:Drone[]){const canvas=$('#radar canvas') as HTMLCanvasElement,ctx=canvas.getContext('2d')!;ctx.clearRect(0,0,180,180);ctx.save();ctx.translate(90,90);if(this.radarDisabled){ctx.fillStyle='rgba(255,79,216,.18)';for(let i=0;i<34;i++)ctx.fillRect(-82,Math.random()*164-82,164,Math.random()*2+1);ctx.fillStyle='#ff4fd8';ctx.font='700 12px monospace';ctx.textAlign='center';ctx.fillText('SINAL BLOQUEADO',0,4);ctx.restore();return;}ctx.rotate(-yaw);ctx.strokeStyle='rgba(106,220,211,.2)';for(const radius of [28,55,82]){ctx.beginPath();ctx.arc(0,0,radius,0,Math.PI*2);ctx.stroke();}for(const drone of drones){if(!drone.alive)continue;const delta=drone.group.position.clone().sub(player);if(delta.length()>40)continue;ctx.fillStyle=drone.spec.color;ctx.fillRect(delta.x*2-2,delta.z*2-2,drone.type==='COMMANDER'?7:4,drone.type==='COMMANDER'?7:4);}ctx.fillStyle='#f3e6ca';ctx.beginPath();ctx.moveTo(0,-5);ctx.lineTo(4,5);ctx.lineTo(-4,5);ctx.fill();ctx.restore();}
}
