import { defineMinorCard } from '../card-source'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import type { CardImpl } from '../registry'
import { getStoredResource } from '../helpers/card-storage'

const CARD_ID = 'E031_Upholstery'
const listener: CardListenerRegistration = {
  id: 'E31-upholstery-after-improvement',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['improvement'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const choice = context.choice ?? ''
    const builtId = choice.replace(/^major:/, '').replace(/^minor:/, '')
    if (!builtId || builtId === CARD_ID) return
    // Cap: number of rooms in house
    const roomCount = context.player.roomTiles.length
    const storedReed = getStoredResource(context.player, CARD_ID, 'reed')
    if (roomCount <= 0 || storedReed >= roomCount) return
    if (context.player.resources.reed < 1) return
    return {
      flow: {
        type: 'seq',
        optional: true,
        children: [
          {
            type: 'leaf',
            actionId: 'pay',
            params: { reed: 1 },
            sourceCard: CARD_ID,
          },
          {
            type: 'leaf',
            actionId: 'store-on-card',
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

const cardImpl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl

export const E031_Upholstery = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: 'Upholstery',
    deck: 'E',
    number: 31,
    category: 'BONUS_POINTS_-_GET',
    desc: [
        'Each time you build or play an improvement after this one, you can place 1 <REED> on this card, irretrievably, to get 1 bonus <SCORE>, up to the number of rooms in your house.',
      ],
    cost: {},
    extraVp: true,
  },
  impl: cardImpl,
})

export const E031_Upholstery_impl = E031_Upholstery.impl
