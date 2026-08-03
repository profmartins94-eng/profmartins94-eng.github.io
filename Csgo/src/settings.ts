import type { GameSettings } from './types';

const STORAGE_KEY='dust-protocol-settings-v3';
export const DEFAULT_SETTINGS:GameSettings={sensitivity:1,masterVolume:.75,shake:.8,colorblind:false,difficulty:'TACTICAL',map:'DESERT'};

export class SettingsManager {
  value:GameSettings;
  onChange=(_value:GameSettings)=>{};
  constructor(){
    try{this.value={...DEFAULT_SETTINGS,...JSON.parse(localStorage.getItem(STORAGE_KEY)??'{}')};}
    catch{this.value={...DEFAULT_SETTINGS};}
  }
  update(patch:Partial<GameSettings>){this.value={...this.value,...patch};localStorage.setItem(STORAGE_KEY,JSON.stringify(this.value));this.applyDocument();this.onChange(this.value);}
  applyDocument(){document.documentElement.classList.toggle('colorblind',this.value.colorblind);}
  bind(){
    const sensitivity=document.querySelector<HTMLInputElement>('#setting-sensitivity'),volume=document.querySelector<HTMLInputElement>('#setting-volume'),shake=document.querySelector<HTMLInputElement>('#setting-shake'),colorblind=document.querySelector<HTMLInputElement>('#setting-colorblind'),difficulty=document.querySelector<HTMLSelectElement>('#setting-difficulty'),map=document.querySelector<HTMLSelectElement>('#setting-map');
    if(!sensitivity||!volume||!shake||!colorblind||!difficulty||!map)return;
    sensitivity.value=String(this.value.sensitivity);volume.value=String(this.value.masterVolume);shake.value=String(this.value.shake);colorblind.checked=this.value.colorblind;difficulty.value=this.value.difficulty;map.value=this.value.map;
    sensitivity.addEventListener('input',()=>this.update({sensitivity:Number(sensitivity.value)}));volume.addEventListener('input',()=>this.update({masterVolume:Number(volume.value)}));shake.addEventListener('input',()=>this.update({shake:Number(shake.value)}));colorblind.addEventListener('change',()=>this.update({colorblind:colorblind.checked}));difficulty.addEventListener('change',()=>this.update({difficulty:difficulty.value as GameSettings['difficulty']}));map.addEventListener('change',()=>this.update({map:map.value as GameSettings['map']}));this.applyDocument();
  }
}
