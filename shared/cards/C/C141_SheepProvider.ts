import { Occupation } from '../types'
import type { CardListenerContext, CardListenerRegistration } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'C141_SheepProvider'

const listener: CardListenerRegistration = {
  id: 'C141-sheep-provider-any-sheep-market',
  cardIds: [CARD_ID],
  actions: ['place-farmer'],
  phases: ['after' as ActionHookPhase],
  scope: 'any',
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.space?.id !== 'sheep-market') return
    return { flow: gainLeaf(CARD_ID, { grain: 1 }), sourceCard: CARD_ID }
  },
}

export const C141_SheepProvider = new Occupation({
  id: CARD_ID,
  name: "Sheep Provider",
  deck: "C",
  number: 141,
  category: "CROP_PROVIDER",
  desc: [
    'Each time any player (including you) uses the __Sheep Market__ accumulation space, you get 1 <GRAIN>.',
  ],
  cost: {},
  players: "3+",
})

export const C141_SheepProvider_impl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl
