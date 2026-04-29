import { Occupation } from '../types'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import type { CardImpl } from '../registry'

const CARD_ID = 'C152_Puppeteer'

/**
 * C152 Puppeteer:
 * Each time another player uses the Traveling Players accumulation space,
 * you can pay them 1 food to play 1 occupation for free.
 * Players 3+.
 */
const listener: CardListenerRegistration = {
  id: 'C152-puppeteer-opponent-traveling-players',
  cardIds: [CARD_ID],
  actions: ['place-farmer'],
  phases: ['after' as ActionHookPhase],
  scope: 'opponent',
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.space?.id !== 'traveling-players') return
    const triggerPlayerId = context.triggerPlayer?.id ?? context.player.id
    return {
      flow: {
        type: 'seq',
        optional: true,
        children: [
          {
            type: 'leaf',
            actionId: 'pay-resources',
            params: { food: 1 },
            sourceCard: CARD_ID,
          },
          {
            type: 'leaf',
            actionId: 'gain-trigger-player',
            params: { food: 1, targetPlayerId: triggerPlayerId },
            sourceCard: CARD_ID,
          },
          {
            type: 'leaf',
            actionId: 'play-occupation',
            sourceCard: CARD_ID,
            params: { costOverride: {} },
          },
        ],
      },
      sourceCard: CARD_ID,
    }
  },
}

export const C152_Puppeteer = new Occupation({
  id: CARD_ID,
  name: 'Puppeteer',
  deck: 'C',
  number: 152,
  category: 'ACTIONS_BOOSTER',
  desc: [
    'Each time another player uses the __Traveling Players__ accumulation space, you can pay them 1 <FOOD> to immediately play an occupation without paying an occupation cost.',
  ],
  cost: {},
  players: '4+',
  evenMoreSet: true,
})

export const C152_Puppeteer_impl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl
