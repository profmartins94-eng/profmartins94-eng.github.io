import * as THREE from 'three';

export type ZoneId = 'A' | 'B' | 'MID' | 'LONG' | 'TUNNEL';
export type MapVariant = 'DESERT' | 'REFINERY' | 'NIGHT_LAB';
export type Difficulty = 'RECRUIT' | 'TACTICAL' | 'NIGHTMARE';
export type SurfaceType = 'sand' | 'stone' | 'metal';

export interface GameSettings {
  sensitivity: number;
  masterVolume: number;
  shake: number;
  colorblind: boolean;
  difficulty: Difficulty;
  map: MapVariant;
}

export interface RampData { axis: 'x' | 'z'; direction: 1 | -1; minHeight: number; maxHeight: number; }
export interface Collider { box: THREE.Box3; kind: 'wall' | 'cover' | 'step' | 'ramp' | 'ladder'; ramp?: RampData; id?: string; }
export interface NavNode { id: number; pos: THREE.Vector3; links: number[]; exposure: number; zone: ZoneId; }
export interface SoundEvent { position: THREE.Vector3; radius: number; time: number; kind: 'shot' | 'step' | 'explosion' | 'drone-call'; }

export type DroneState = 'PATRULHA' | 'SUSPEITA' | 'COMBATE' | 'BUSCA' | 'RECUO';
export type DroneType = 'SCOUT' | 'ASSAULT' | 'HEAVY' | 'SNIPER' | 'SUPPORT' | 'KAMIKAZE' | 'SHIELD' | 'JAMMER' | 'CLOAKED' | 'ENGINEER' | 'TURRET' | 'COMMANDER';
export type DamageZone = 'CORE' | 'ROTOR_LEFT' | 'ROTOR_RIGHT' | 'WEAPON' | 'BODY';

export interface DroneSpec {
  type: DroneType; health: number; speed: number; damage: number; preferredRange: number;
  fireInterval: number; visionRange: number; color: string; scale: number;
}

export interface SpawnPoint { position: THREE.Vector3; zone: ZoneId; }
export interface Destructible {
  id: string; mesh: THREE.Mesh; collider: Collider; health: number; maxHealth: number; destroyed: boolean;
}

export interface LevelData {
  group: THREE.Group;
  colliders: Collider[];
  raycastMeshes: THREE.Object3D[];
  covers: THREE.Box3[];
  navNodes: NavNode[];
  spawnPoints: SpawnPoint[];
  ammoPoints: THREE.Vector3[];
  objectivePoints: Record<'A' | 'B', THREE.Vector3>;
  destructibles: Destructible[];
  variant: MapVariant;
  floorHeightAt(x: number, z: number): number;
  surfaceAt(x: number, z: number): SurfaceType;
  damageDestructible(mesh: THREE.Object3D, damage: number): boolean;
}

export interface WeaponSpec {
  id: number; name: string; short: string; magSize: number; fireRate: number; damage: number;
  spread: number; adsSpread: number; reload: number; type: 'hitscan' | 'charged' | 'shotgun' | 'sniper';
}

export type MatchPhase = 'INTERVALO' | 'UPGRADE' | 'INCURSAO' | 'DEFESA' | 'BOSS' | 'CONCLUIDA';
export type ObjectiveType = 'ELIMINATE' | 'DEFEND' | 'CAPTURE' | 'HUNT' | 'ESCORT' | 'BLACKOUT' | 'SUPPLY' | 'BOSS';
export type UpgradeId = 'DAMAGE' | 'FIRE_RATE' | 'MAG_SIZE' | 'FAST_RELOAD' | 'REGEN' | 'SHIELD' | 'ARC_RADIUS' | 'SNIPER_PENETRATION' | 'INCENDIARY';
