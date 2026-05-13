import type { FarmField, PlayerFarmState } from '../farmyard'

export type BlankResources = Partial<PlayerFarmState['resources']>

export type BlankPlayerOverrides = {
  id?: string
  name?: string
  resources?: BlankResources
  rooms?: number
  houseType?: PlayerFarmState['houseType']
  fields?: FarmField[]
  roomTiles?: PlayerFarmState['roomTiles']
  stableTiles?: PlayerFarmState['stableTiles']
  fenceSegments?: PlayerFarmState['fenceSegments']
  pastures?: PlayerFarmState['pastures']
  // Extra fields tolerated for downstream PlayerState callers
  minorPlayed?: string[]
  occupationsPlayed?: string[]
}

const DEFAULT_RESOURCES: PlayerFarmState['resources'] = {
  wood: 0,
  clay: 0,
  reed: 0,
  stone: 0,
  food: 0,
  grain: 0,
  vegetable: 0,
  sheep: 0,
  boar: 0,
  cattle: 0,
  begging: 0,
}

/**
 * Minimal blank player factory for shared-layer tests. Provides a
 * `PlayerFarmState`-compatible shape with sensible empties and accepts
 * partial overrides for the few fields a test actually cares about.
 *
 * Cast as `unknown as PlayerState` at the call site if a test needs the
 * wider `PlayerState` shape (e.g. for `buildSowFarmInteraction`); the
 * helpers in this file deliberately stay in farm-only territory so they
 * compose with the validator-generic-over-`PlayerFarmState` pattern.
 */
export const makeBlankPlayer = (overrides: BlankPlayerOverrides = {}) => {
  const base = {
    id: overrides.id ?? 'p1',
    name: overrides.name ?? 'Tester',
    resources: { ...DEFAULT_RESOURCES, ...(overrides.resources ?? {}) },
    rooms: overrides.rooms ?? 2,
    houseType: overrides.houseType ?? ('wood' as const),
    fields: overrides.fields ?? [],
    roomTiles: overrides.roomTiles ?? [
      { row: 1, col: 0 },
      { row: 2, col: 0 },
    ],
    stableTiles: overrides.stableTiles ?? [],
    fenceSegments: overrides.fenceSegments ?? [],
    pastures: overrides.pastures ?? [],
    // PlayerState extras kept blank but present so PlayerState consumers
    // (e.g. buildSowFarmInteraction) don't trip on missing card-state fields.
    minorPlayed: overrides.minorPlayed ?? [],
    occupationsPlayed: overrides.occupationsPlayed ?? [],
    occupationHand: [] as string[],
    minorHand: [] as string[],
    majorPlayed: [] as string[],
    cardStates: {} as Record<string, unknown>,
    actionStateUsed: {} as Record<string, unknown>,
    listeners: [] as unknown[],
    flags: {} as Record<string, unknown>,
    counts: {} as Record<string, number>,
    extraSowableFields: [] as unknown[],
    family: { adults: 2, newborns: 0 } as unknown,
  }
  return base
}
