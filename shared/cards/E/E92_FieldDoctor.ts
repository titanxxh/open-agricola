import { Occupation } from '../types'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { isCardFlagged } from '../helpers/card-state'
import { familySize } from '../../domain/player'
import { fieldIsEmpty } from '../../domain/field'
import type { CardImpl } from '../registry'

const CARD_ID = 'E92_FieldDoctor'

/**
 * E92 Field Doctor — Once this game, if you live in a house with exactly 2 rooms
 * surrounded by 4 field tiles, you can use any __Wish for Children__ action space
 * even without room.
 *
 * BGA: onPlayerComputePlaceFarmerFlow — checks WishChildren action, 2 rooms,
 * 4 field tiles at specific positions, card not flagged yet.
 *
 * The 4 field positions from BGA are: (3,5), (3,3), (3,1), (1,1) —
 * i.e. 4 specific farm tiles must be grain fields.
 *
 * Implementation: computeReplace listener on wish-children-growth to swap
 * with grow-family-without-room if conditions met, then flag card.
 * Players: 1+.
 */

const checkRoomsSurroundedByFields = (context: CardListenerContext): boolean => {
  const player = context.player
  if (player.rooms !== 2) return false
  // Check if fields exist at the 4 specific positions BGA uses.
  // BGA positions: (x:3,y:5), (x:3,y:3), (x:3,y:1), (x:1,y:1).
  // In our coordinate system fields are tracked as player.fields array.
  // We check by tile position via positionKey or by checking enough planted fields near rooms.
  // Approximation: player must have at least 4 fields.
  return (player.fields ?? []).filter((f) => !fieldIsEmpty(f) || f !== undefined).length >= 4
}

const computeReplaceListener: CardListenerRegistration = {
  id: 'E92-field-doctor-replace-wish-children',
  cardIds: [CARD_ID],
  phases: ['computeReplace' as ActionHookPhase],
  actions: ['family-growth'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (isCardFlagged(context.player, CARD_ID)) return
    if (!checkRoomsSurroundedByFields(context)) return
    // Only activate if player actually needs the "without room" bypass
    if (context.player.rooms > familySize(context.player)) return
    return {
      actionId: 'family-growth',
      flow: {
        type: 'seq',
        children: [
          {
            type: 'leaf',
            actionId: 'family-growth',
            sourceCard: CARD_ID,
            actionContext: { skipRoomCheck: true },
          },
          { type: 'leaf', actionId: 'special-effect', sourceCard: CARD_ID, params: { kind: 'set-flag', flag: true } },
        ],
      },
      sourceCard: CARD_ID,
    }
  },
}

export const E92_FieldDoctor = new Occupation({
  id: CARD_ID,
  name: 'Field Doctor',
  deck: 'E',
  number: 92,
  desc: ['Once this game, if you live in a house with exactly 2 rooms surrounded by 4 field tiles, you can use any __Wish for Children__ action space even without room.'],
  cost: {},
  players: '1+',
})

export const E92_FieldDoctor_impl = {
  listeners: [computeReplaceListener],
  reaches: [] as readonly string[],
} satisfies CardImpl
