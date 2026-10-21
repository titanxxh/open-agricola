import { defineOccupationCard } from '../card-source'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import {
  countDistinctStablesBuiltThisTurn,
} from '../helpers/action-snapshot'
import type { ActionFlow } from '../../contract/types'
import type { CardImpl } from '../registry'
import { isUsedThisTurn, markUsedThisTurnLeaf } from '../helpers/turn-token'

const CARD_ID = 'D166_StableMilker'

const tryGainCattle = (
  player: CardListenerContext['player'],
): ActionFlow | undefined => {
  if (countDistinctStablesBuiltThisTurn(player) < 2 || isUsedThisTurn(player, CARD_ID)) return
  const mark = markUsedThisTurnLeaf(player, CARD_ID)
  if (!mark) return

  return {
    type: 'seq',
    children: [
      mark,
      gainLeaf(CARD_ID, { cattle: 1 }),
    ],
  }
}

const listener: CardListenerRegistration = {
  id: 'D166-stable-milker-after-stables',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['stables'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const flow = tryGainCattle(context.player)
    if (flow) return { flow, sourceCard: CARD_ID }
  },
}

const cardImpl = {
  listeners: [listener],
  effect: {
  id: CARD_ID,
  onBuy: (_state, player) => tryGainCattle(player),
},
  reaches: [] as readonly string[],
} satisfies CardImpl

export const D166_StableMilker = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: 'Stable Milker',
    deck: 'D',
    number: 166,
    category: 'LIVESTOCK_PROVIDER',
    desc: [
        'Each time you build at least 2 <STABLE> on the same turn, you also get 1 <CATTLE>.',
      ],
    cost: {},
    players: '4+',
    evenMoreSet: true,
  },
  impl: cardImpl,
})

export const D166_StableMilker_impl = D166_StableMilker.impl
