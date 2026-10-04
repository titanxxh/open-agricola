import { createSeededRng, shuffleWithRng, type GameSeed } from '../utils/rng'
import type { FarmTerrainTile, MoorStartCardId } from './types'

export type MoorStartCardDefinition = {
  id: MoorStartCardId
  terrain: FarmTerrainTile[]
}

const t = (row: number, col: number, kind: FarmTerrainTile['kind']): FarmTerrainTile => ({
  row,
  col,
  kind,
})

export const moorStartCards: MoorStartCardDefinition[] = [
  {
    id: 'moor-start-1',
    terrain: [
      t(0, 3, 'forest'), t(1, 2, 'forest'), t(1, 3, 'forest'), t(2, 3, 'forest'), t(2, 4, 'forest'),
      t(0, 0, 'moor'), t(0, 1, 'moor'), t(1, 1, 'moor'),
    ],
  },
  {
    id: 'moor-start-2',
    terrain: [
      t(0, 1, 'forest'), t(0, 2, 'forest'), t(0, 3, 'forest'), t(2, 3, 'forest'), t(2, 4, 'forest'),
      t(1, 1, 'moor'), t(1, 2, 'moor'), t(2, 1, 'moor'),
    ],
  },
  {
    id: 'moor-start-3',
    terrain: [
      t(0, 2, 'forest'), t(0, 3, 'forest'), t(0, 4, 'forest'), t(1, 4, 'forest'), t(2, 4, 'forest'),
      t(1, 2, 'moor'), t(2, 1, 'moor'), t(2, 2, 'moor'),
    ],
  },
  {
    id: 'moor-start-4',
    terrain: [
      t(0, 1, 'forest'), t(1, 1, 'forest'), t(1, 3, 'forest'), t(2, 1, 'forest'), t(2, 3, 'forest'),
      t(0, 3, 'moor'), t(0, 4, 'moor'), t(1, 4, 'moor'),
    ],
  },
  {
    id: 'moor-start-5',
    terrain: [
      t(0, 3, 'forest'), t(0, 4, 'forest'), t(1, 4, 'forest'), t(2, 3, 'forest'), t(2, 4, 'forest'),
      t(1, 1, 'moor'), t(1, 2, 'moor'), t(1, 3, 'moor'),
    ],
  },
  {
    id: 'moor-start-6',
    terrain: [
      t(0, 0, 'forest'), t(0, 1, 'forest'), t(0, 4, 'forest'), t(1, 4, 'forest'), t(2, 4, 'forest'),
      t(0, 2, 'moor'), t(0, 3, 'moor'), t(1, 3, 'moor'),
    ],
  },
  {
    id: 'moor-start-7',
    terrain: [
      t(0, 1, 'forest'), t(1, 1, 'forest'), t(1, 4, 'forest'), t(2, 3, 'forest'), t(2, 4, 'forest'),
      t(0, 2, 'moor'), t(1, 2, 'moor'), t(2, 2, 'moor'),
    ],
  },
  {
    id: 'moor-start-8',
    terrain: [
      t(0, 4, 'forest'), t(1, 1, 'forest'), t(1, 4, 'forest'), t(2, 1, 'forest'), t(2, 2, 'forest'),
      t(1, 2, 'moor'), t(1, 3, 'moor'), t(2, 3, 'moor'),
    ],
  },
  {
    id: 'moor-start-9',
    terrain: [
      t(0, 0, 'forest'), t(0, 1, 'forest'), t(1, 1, 'forest'), t(2, 1, 'forest'), t(2, 2, 'forest'),
      t(0, 2, 'moor'), t(1, 2, 'moor'), t(1, 3, 'moor'),
    ],
  },
]

export const moorStartCardIds = moorStartCards.map((card) => card.id)

const moorStartCardById = new Map(moorStartCards.map((card) => [card.id, card]))

export const isMoorStartCardId = (value: unknown): value is MoorStartCardId =>
  typeof value === 'string' && moorStartCardById.has(value as MoorStartCardId)

export const getMoorStartCardTerrain = (id: MoorStartCardId): FarmTerrainTile[] =>
  (moorStartCardById.get(id)?.terrain ?? []).map((tile) => ({ ...tile }))

export const dealMoorStartCards = (
  playerIds: readonly string[],
  seed: GameSeed,
): Record<string, MoorStartCardId> => {
  const shuffled = shuffleWithRng(
    [...moorStartCardIds],
    createSeededRng(seed, 'moor-start-cards', (value) => value + 0x4d4f4f52),
  )
  return Object.fromEntries(
    playerIds.map((playerId, index) => [playerId, shuffled[index % shuffled.length] as MoorStartCardId]),
  )
}
