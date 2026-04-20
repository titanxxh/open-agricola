import { MinorImprovement } from '../types'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { positionKey } from '../../game/farm'
import { registerSelectionEffect } from '../../actions/effects/selection-effect-registry'
import type { ActionFlow } from '../../game/types'
import { fieldTopStack } from '../../game/field'
import type { CardImpl } from '../registry'

const CARD_ID = 'E71_CowPatty'

/**
 * E71 Cow Patty (Minor Improvement):
 * Each time you sow in a field that is orthogonally adjacent to a pasture,
 * you can place 1 additional good of the planted type in it.
 *
 * Prerequisite: 1 Cattle (checked at play time, not at trigger time).
 *
 * Implementation: after sow listener. Detect freshly sown fields,
 * filter to those adjacent to pastures. Add 1 bonus crop to one.
 * If multiple eligible, player selects.
 */

/** Initial remaining values for each crop type when freshly sown. */
const INITIAL_REMAINING: Record<string, number> = { grain: 3, vegetable: 2 }

// Field effect: add 1 crop to the selected field (matching its crop type)
registerSelectionEffect('cow-patty-bonus-crop', ({ player, positions }) => {
  for (const key of positions) {
    const [r, c] = key.split('-').map(Number)
    const field = player.fields.find((f) => f.row === r && f.col === c)
    if (!field) continue
    const top = fieldTopStack(field)
    if (top) {
      top.remaining += 1
      break // only 1 field
    }
  }
})

/**
 * Check if a tile is orthogonally adjacent to any pasture tile.
 */
const isAdjacentToPasture = (
  row: number,
  col: number,
  context: CardListenerContext,
): boolean => {
  const pastureTileKeys = new Set<string>()
  for (const pasture of context.player.pastures) {
    for (const tile of pasture.tiles) {
      pastureTileKeys.add(positionKey(tile))
    }
  }
  const neighbors = [
    { row: row - 1, col },
    { row: row + 1, col },
    { row, col: col - 1 },
    { row, col: col + 1 },
  ]
  return neighbors.some((n) => pastureTileKeys.has(positionKey(n)))
}

// --- After sow: find freshly sown fields adjacent to pastures, add bonus crop ---
const afterSowListener: CardListenerRegistration = {
  id: 'E71-cow-patty-after-sow',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['sow'],
  handler: (context: CardListenerContext): ActionHookResult | void => {

    // Detect freshly sown fields (top stack at initial remaining)
    const freshFields = context.player.fields.filter((f) => {
      const top = fieldTopStack(f)
      return !!top && top.remaining === INITIAL_REMAINING[top.kind]
    })

    // Filter to those adjacent to a pasture
    const eligible = freshFields.filter((f) => isAdjacentToPasture(f.row, f.col, context))
    if (eligible.length === 0) return

    if (eligible.length === 1) {
      // Auto-add 1 crop to top stack
      const top = fieldTopStack(eligible[0]!)
      if (top) top.remaining += 1
      return
    }

    // Multiple eligible fields — player selects which one gets the bonus
    return {
      flow: {
        type: 'leaf',
        actionId: 'selection',
        sourceCard: CARD_ID,
        actionContext: {
          selectionKind: 'farm-position',
          positionFilter: 'has-crop',
          maxSelections: 1,
          selectionEffect: 'cow-patty-bonus-crop',
        },
      } as ActionFlow,
      sourceCard: CARD_ID,
    }
  },
}

export const E71_CowPatty = new MinorImprovement({
  id: 'E71_CowPatty',
  name: 'Cow Patty',
  deck: 'E',
  number: 71,
  desc: ['Each time you sow in a field that is orthogonally adjacent to a pasture, you can place 1 additional good of the planted type in it.'],
  cost: {},
  vp: 1,
  prerequisite: '1 Cattle',
  implemented: true,
})

export const E71_CowPatty_impl = {
  listeners: [afterSowListener],
  reaches: [] as readonly string[],
} satisfies CardImpl
