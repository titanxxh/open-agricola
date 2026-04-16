import { Occupation } from '../types'
import { registerCardEffect } from '../card-effects'
import { registerCardListener } from '../card-listeners'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { isCardFlagged } from '../helpers/card-state'
import { payLeaf } from '../helpers/pay-gain-node'
import { FARM_ROWS, FARM_COLS, positionKey } from '../../game/farm'
import type { PlayerState } from '../../game/types'

const CARD_ID = 'B85_FarmHand'

/**
 * Check if the player has 4 fields arranged in a 2x2 block.
 */
const has2x2FieldBlock = (player: PlayerState): boolean => {
  const fieldKeys = new Set(
    player.fields.map((f) => positionKey({ row: f.row, col: f.col })),
  )
  for (let r = 0; r < FARM_ROWS - 1; r++) {
    for (let c = 0; c < FARM_COLS - 1; c++) {
      if (
        fieldKeys.has(positionKey({ row: r, col: c })) &&
        fieldKeys.has(positionKey({ row: r, col: c + 1 })) &&
        fieldKeys.has(positionKey({ row: r + 1, col: c })) &&
        fieldKeys.has(positionKey({ row: r + 1, col: c + 1 }))
      ) {
        return true
      }
    }
  }
  return false
}

/**
 * Anytime action: once per game, if player has 4 fields in a 2x2 pattern
 * and 2+ wood, build a "Farm Hand stable" that provides room for 1 person
 * but NOT for animals.
 *
 * Implementation: pay 2 wood, increment player.rooms by 1 (via build-farmhand-room
 * action), then flag the card so it cannot be used again.
 */
const anytimeListener: CardListenerRegistration = {
  id: 'B85-farm-hand-anytime',
  cardIds: [CARD_ID],
  phases: ['anytime' as ActionHookPhase],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (isCardFlagged(context.player, CARD_ID)) return
    if (context.player.resources.wood < 2) return
    if (!has2x2FieldBlock(context.player)) return

    return {
      flow: {
        type: 'seq',
        children: [
          payLeaf({ cardId: CARD_ID, cost: { wood: 2 } }),
          { type: 'leaf', actionId: 'build-farmhand-room', sourceCard: CARD_ID },
          { type: 'leaf', actionId: 'flag-card', sourceCard: CARD_ID },
        ],
      },
      sourceCard: CARD_ID,
      labelKey: 'cards.B85_FarmHand.anytime',
    }
  },
}

registerCardListener(anytimeListener)

registerCardEffect({
  id: CARD_ID,
})

export const B85_FarmHand = new Occupation({
  id: CARD_ID,
  name: 'Farm Hand',
  deck: 'B',
  number: 85,
  category: 'FARM_PLANNER',
  desc: [
    'Once this game, if you have 4 field tiles in a 2x2, you can build a stable in the center of the 2x2 during a __Build Stables__ action. This stable provides room for a person but not animals.',
  ],
  players: '1+',
  newSet: true,
  implemented: true,
})
