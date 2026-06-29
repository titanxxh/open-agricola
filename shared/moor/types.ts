import type { FarmTilePosition } from '../contract/types'

export type FarmTerrainKind = 'forest' | 'moor'

export type FarmTerrainTile = FarmTilePosition & {
  kind: FarmTerrainKind
  covered?: FarmTerrainKind
}

export type MoorStartCardId =
  | 'moor-start-1'
  | 'moor-start-2'
  | 'moor-start-3'
  | 'moor-start-4'
  | 'moor-start-5'
  | 'moor-start-6'
  | 'moor-start-7'
  | 'moor-start-8'
  | 'moor-start-9'

export type MoorSpecialActionId =
  | 'cut-peat'
  | 'fell-trees'
  | 'slash-and-burn'
  | 'horse-market'
  | 'hiring-fair'
  | 'black-market'
  | 'illicit-work'

export type MoorSpecialActionCardLocation =
  | { kind: 'market' }
  | { kind: 'playerFaceUp'; playerId: string }
  | { kind: 'playerFaceDown'; playerId: string }

export type MoorSpecialActionCardState = {
  id: string
  players: number[]
  actions: MoorSpecialActionId[]
  image: string
  location: MoorSpecialActionCardLocation
}

export type FarmersOfTheMoorState = {
  complexity: 'iii'
  startCardByPlayerId: Record<string, MoorStartCardId>
  specialActionCards: MoorSpecialActionCardState[]
}
