import { Occupation } from '../types'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf, payLeaf } from '../helpers/pay-gain-node'
import { initCardState } from '../__stubs__/helpers'
import type { CardImpl } from '../registry'

const CARD_ID = 'B157_Salter'

const anytimeListener: CardListenerRegistration = {
  id: 'B157-salter-anytime',
  cardIds: [CARD_ID],
  phases: ['anytime' as ActionHookPhase],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const { sheep, boar, cattle } = context.player.resources
    const hasSheep = (sheep ?? 0) >= 1
    const hasBoar = (boar ?? 0) >= 1
    const hasCattle = (cattle ?? 0) >= 1
    if (!hasSheep && !hasBoar && !hasCattle) return
    if (context.state.round >= 14) return // no future rounds
    const options = []
    if (hasSheep) {
      options.push({
        type: 'seq' as const,
        children: [
          payLeaf({ cardId: CARD_ID, cost: { sheep: 1 } }),
          { type: 'leaf' as const, actionId: 'store-on-card', params: { pending: 3 }, sourceCard: CARD_ID },
        ],
        choiceLabelKey: 'ui.interactionSalterSheep',
      })
    }
    if (hasBoar) {
      options.push({
        type: 'seq' as const,
        children: [
          payLeaf({ cardId: CARD_ID, cost: { boar: 1 } }),
          { type: 'leaf' as const, actionId: 'store-on-card', params: { pending: 5 }, sourceCard: CARD_ID },
        ],
        choiceLabelKey: 'ui.interactionSalterBoar',
      })
    }
    if (hasCattle) {
      options.push({
        type: 'seq' as const,
        children: [
          payLeaf({ cardId: CARD_ID, cost: { cattle: 1 } }),
          { type: 'leaf' as const, actionId: 'store-on-card', params: { pending: 7 }, sourceCard: CARD_ID },
        ],
        choiceLabelKey: 'ui.interactionSalterCattle',
      })
    }
    if (options.length === 0) return
    return {
      flow: {
        type: 'xor',
        children: options,
      },
      sourceCard: CARD_ID,
      labelKey: 'cards.B157_Salter.anytime',
    }
  },
}

export const B157_Salter = new Occupation({
  id: CARD_ID,
  name: 'Salter',
  deck: 'B',
  number: 157,
  category: 'FOOD_PROVIDER',
  desc: ['At any time, you can pay 1 <SHEEP>/<PIG>/<CATTLE> from your farm. If you do, place 1 <FOOD> on each of the next 3/5/7 round spaces. At the start of these rounds, you get the <FOOD>.'],
  cost: {},
  players: '4+',
  newSet: true,
})

export const B157_Salter_impl = {
  listeners: [anytimeListener],
  effect: {
  id: CARD_ID,
  onRoundStart: (_state, player) => {
    const pending = player.cardStates?.[CARD_ID]?.counters?.pending ?? 0
    if (pending <= 0) return
    const counters = initCardState(player, CARD_ID)
    counters.pending = pending - 1
    return gainLeaf(CARD_ID, { food: 1 })
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
