import type { UpgradeId } from './types';

export interface UpgradeChoice { id:UpgradeId; name:string; description:string; color:string; level:string; }
const ALL_UPGRADES:Omit<UpgradeChoice,'level'>[]=[
  {id:'DAMAGE',name:'Munição de tungstênio',description:'+18% de dano para todas as armas',color:'#f0b857'},
  {id:'FIRE_RATE',name:'Ciclo acelerado',description:'+12% de cadência',color:'#ff8069'},
  {id:'MAG_SIZE',name:'Carregadores estendidos',description:'+25% de munição no pente',color:'#67d8d5'},
  {id:'FAST_RELOAD',name:'Mãos treinadas',description:'Recargas 20% mais rápidas',color:'#d4c8aa'},
  {id:'REGEN',name:'Nanorreparo',description:'Regeneração começa mais cedo',color:'#87e188'},
  {id:'SHIELD',name:'Blindagem reativa',description:'+25 de integridade máxima e imediata',color:'#8fb8ff'},
  {id:'ARC_RADIUS',name:'Sobrecarga ARC',description:'+35% no raio da explosão',color:'#b89cff'},
  {id:'SNIPER_PENETRATION',name:'Projétil sabot',description:'Widow atravessa mais dois alvos',color:'#f4eee0'},
  {id:'INCENDIARY',name:'Carga térmica',description:'Breach causa +12% de dano térmico',color:'#ff784f'},
];

export class ProgressionSystem {
  damageMultiplier=1;fireRateMultiplier=1;magMultiplier=1;reloadMultiplier=1;regenDelay=4;arcRadiusMultiplier=1;sniperPenetration=0;incendiary=false;
  pending:UpgradeChoice[]=[];onChoices=(_choices:UpgradeChoice[])=>{};onApplied=(_choice:UpgradeChoice)=>{};
  private levels=new Map<UpgradeId,number>();
  offer(wave:number){const start=(wave*3)%ALL_UPGRADES.length;this.pending=[0,1,2].map(offset=>{const base=ALL_UPGRADES[(start+offset*2)%ALL_UPGRADES.length];return{...base,level:`NÍVEL ${(this.levels.get(base.id)??0)+1}`};});this.onChoices(this.pending);return this.pending;}
  choose(index:number){const choice=this.pending[index];if(!choice)return null;switch(choice.id){case'DAMAGE':this.damageMultiplier*=1.18;break;case'FIRE_RATE':this.fireRateMultiplier*=1.12;break;case'MAG_SIZE':this.magMultiplier*=1.25;break;case'FAST_RELOAD':this.reloadMultiplier*=.8;break;case'REGEN':this.regenDelay=Math.max(1.8,this.regenDelay-.7);break;case'ARC_RADIUS':this.arcRadiusMultiplier*=1.35;break;case'SNIPER_PENETRATION':this.sniperPenetration+=2;break;case'INCENDIARY':this.incendiary=true;break;case'SHIELD':break;}this.levels.set(choice.id,(this.levels.get(choice.id)??0)+1);this.pending=[];this.onApplied(choice);return choice;}
}

export class ScoreSystem {
  score=0;multiplier=1;streak=0;bestStreak=0;shots=0;hits=0;lastKill=-99;record=typeof window==='undefined'?0:Number(localStorage.getItem('dust-protocol-record')??0);
  onChange=()=>{};
  shot(){this.shots++;this.onChange();}
  hit(critical=false){this.hits++;if(critical)this.score+=Math.round(75*this.multiplier);this.onChange();}
  kill(type:string,critical:boolean,now:number){this.streak=now-this.lastKill<4?this.streak+1:1;this.lastKill=now;this.bestStreak=Math.max(this.bestStreak,this.streak);this.multiplier=Math.min(5,1+Math.floor(this.streak/3)*.5);const base=type==='COMMANDER'?5000:type==='HEAVY'?350:100;this.score+=Math.round((base+(critical?100:0))*this.multiplier);this.save();this.onChange();}
  damageTaken(){this.multiplier=1;this.streak=0;this.onChange();}
  get accuracy(){return this.shots?this.hits/this.shots:0;}
  get rank(){const value=this.score+this.accuracy*2500;return value>18000?'S+':value>12000?'S':value>8000?'A':value>4500?'B':value>2000?'C':'D';}
  private save(){if(this.score>this.record){this.record=this.score;if(typeof window!=='undefined')localStorage.setItem('dust-protocol-record',String(this.record));}}
}
