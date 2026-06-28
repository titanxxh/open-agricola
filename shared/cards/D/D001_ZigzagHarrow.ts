import { defineMinorCard } from '../card-source'
import type { CardImpl } from '../registry'
import type { FarmTilePosition, PlayerState } from '../../contract/types'
import { FARM_COLS, FARM_ROWS, positionKey } from '../../domain/farm'

const CARD_ID = 'D001_ZigzagHarrow'
type Dir = 'W' | 'N' | 'E' | 'S'

const DIR_DELTA: Record<Dir, { dr: number; dc: number }> = {
  W: { dr: 0, dc: -1 },
  N: { dr: -1, dc: 0 },
  E: { dr: 0, dc: 1 },
  S: { dr: 1, dc: 0 },
}

// BGA traverses neighbors in W → N → E → S → W (W repeated so the
// S↔W pair also closes an L corner). See PlayerBoard.php::zigzag.
const DIR_RING: Dir[] = ['W', 'N', 'E', 'S', 'W']

/**
 * Port of BGA `PlayerBoard::zigzag()`. For every existing field, walk the
 * 4 neighbors in a ring (W→N→E→S→W). Whenever two consecutive ring steps
 * land on fields (i.e. the field sits at an L corner), the two opposite-diagonal
 * tiles relative to the current corner are added to the zigzag candidate set.
 * BGA does NOT restrict candidates to in-bounds / unoccupied tiles — neither
 * do we (matches buyable behavior exactly; plow validation rejects unusable
 * targets later).
 */
export const computeZigzagCandidates = (player: PlayerState): FarmTilePosition[] => {
  const fieldKeys = new Set<string>(
    player.fields.map((f) => positionKey({ row: f.row, col: f.col })),
  )
  if (fieldKeys.size === 0) return []

  const seen = new Set<string>()
  const candidates: FarmTilePosition[] = []
  const addCandidate = (row: number, col: number) => {
    const key = `${row}-${col}`
    if (seen.has(key)) return
    seen.add(key)
    candidates.push({ row, col })
  }

  player.fields.forEach((field) => {
    let aroundFields = 0
    for (const dir of DIR_RING) {
      const delta = DIR_DELTA[dir]
      const nr = field.row + delta.dr
      const nc = field.col + delta.dc
      const inBounds = nr >= 0 && nr < FARM_ROWS && nc >= 0 && nc < FARM_COLS
      if (!inBounds) {
        aroundFields = 0
        continue
      }
      if (!fieldKeys.has(`${nr}-${nc}`)) {
        aroundFields = 0
        continue
      }
      if (aroundFields === 1) {
        // BGA grid step 2 == one OA tile. (x±2, y±2) → (row±1, col±1).
        if (dir === 'N' || dir === 'S') {
          addCandidate(field.row + 1, field.col - 1)
          addCandidate(field.row - 1, field.col + 1)
        } else {
          addCandidate(field.row + 1, field.col + 1)
          addCandidate(field.row - 1, field.col - 1)
        }
      }
      aroundFields = 1
    }
  })

  return candidates
}

const cardImpl = {
  prerequisiteCheck: (player) => computeZigzagCandidates(player).length > 0,
  effect: {
    id: CARD_ID,
    onBuy: (_state, player) => ({
      type: 'leaf' as const,
      actionId: 'plow',
      sourceCard: CARD_ID,
      optional: true,
      actionContext: {
        allowedTiles: computeZigzagCandidates(player),
      },
    }),
  },
  reaches: [] as readonly string[],
} satisfies CardImpl

export const D001_ZigzagHarrow = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: 'Zigzag Harrow',
    deck: 'D',
    number: 1,
    category: 'FARM_PLANNER',
    desc: ['You can immediately plow 1 field such that it completes a "zigzag" pattern.'],
    cost: { wood: 1 },
    prerequisite: '3 Fields in an "L" Shape',
    passing: true,
  },
  impl: cardImpl,
})

export const D001_ZigzagHarrow_impl = D001_ZigzagHarrow.impl
