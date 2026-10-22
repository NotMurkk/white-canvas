import {
  decodePath,
  decodeTerrain,
  decodeZones,
  encodePath,
  encodeTerrain,
  encodeZones,
  type AirRoute,
  type EnemyRegistry,
  type Exit,
  type Junction,
  type KindRegistry,
  type MapDoc,
  type ObjectInstance,
  type Spawn,
  type TerrainGrid,
  type TerrainTypes,
  type ZoneGrid,
  type ZoneTypes,
} from '@tdmm/map-format';

/** The decoded, mutable form of a map that the editor edits and the game plays. */
export interface MapState {
  width: number;
  height: number;
  seed: number;
  terrain: TerrainGrid;
  /** Directed path cells (see @tdmm/pathing). */
  path: Uint8Array;
  zones: ZoneGrid;
  spawns: Spawn[];
  exits: Exit[];
  junctions: Junction[];
  airRoutes: AirRoute[];
  objects: ObjectInstance[];
}

export interface Registries {
  terrainTypes: TerrainTypes;
  kinds: KindRegistry;
  enemies: EnemyRegistry;
  zones: ZoneTypes;
}

export function mapStateFromDoc(doc: MapDoc): MapState {
  return {
    width: doc.grid.width,
    height: doc.grid.height,
    seed: doc.seed,
    terrain: decodeTerrain(doc),
    path: decodePath(doc),
    zones: decodeZones(doc),
    spawns: structuredClone(doc.spawns),
    exits: structuredClone(doc.exits),
    junctions: structuredClone(doc.junctions),
    airRoutes: structuredClone(doc.airRoutes),
    objects: structuredClone(doc.objects),
  };
}

/** Writes the state back into a map document (keeping the file's metadata and symbols). */
export function docFromMapState(base: MapDoc, s: MapState): MapDoc {
  const { path: _path, zones: _zones, ...rest } = base;
  const path = encodePath(s.path, s.width, s.height);
  const zones = encodeZones(s.zones, s.width, s.height, base.zones?.legend);
  return {
    ...rest,
    seed: s.seed,
    terrain: encodeTerrain(s.terrain, base.terrain.legend),
    ...(path ? { path } : {}),
    ...(zones ? { zones } : {}),
    spawns: structuredClone(s.spawns),
    exits: structuredClone(s.exits),
    junctions: structuredClone(s.junctions),
    airRoutes: structuredClone(s.airRoutes),
    objects: structuredClone(s.objects),
  };
}
