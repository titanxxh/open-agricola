import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import type { CardImpl } from '../registry'
import { E31_Upholstery } from '../../cards-display/E/E31_Upholstery'
export { E31_Upholstery }

const CARD_ID = E31_Upholstery.id

const listener: CardListenerRegistration = {
  id: 'E31-upholstery-after-improvement',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['improvement-any'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const choice = context.choice ?? ''
    const builtId = choice.replace(/^major:/, '').replace(/^minor:/, '')
    if (!builtId || builtId === CARD_ID) return
    // Cap: number of rooms in house
    const roomCount = context.player.roomTiles.length
    if (roomCount <= 0) return
    return {
      flow: {
        type: 'seq',
        optional: true,
        children: [
          {
            type: 'leaf',
            actionId: 'return-to-space',
            params: { reed: 1 },
            sourceCard: CARD_ID,
          },
          {
            type: 'leaf',
            actionId: 'bonus-vp',
            sourceCard: CARD_ID,
          },
        ],
      },
      sourceCard: CARD_ID,
    }
  },
}

export const E31_Upholstery_impl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl
