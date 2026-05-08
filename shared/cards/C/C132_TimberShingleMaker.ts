import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { payLeaf } from '../helpers/pay-gain-node'
import type { ActionFlow } from '../../contract/types'
import type { CardImpl } from '../registry'
import { C132_TimberShingleMaker } from '../../cards-display/C/C132_TimberShingleMaker'

const CARD_ID = C132_TimberShingleMaker.id

const afterRenovateListener: CardListenerRegistration = {
  id: 'C132-timber-shingle-maker-after-renovate',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['renovate-house'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    // Only triggers when renovating to stone
    if (context.player.houseType !== 'stone') return
    const rooms = context.player.rooms
    if (rooms <= 0) return
    if (context.player.resources.wood < 1) return

    // XOR: pay 1..N wood; each placed wood is worth 1 bonus VP via
    // computeBonusScore reading cardStates.counters.woodPlaced.
    const maxWood = Math.min(rooms, context.player.resources.wood)
    const children: ActionFlow[] = []
    for (let i = 1; i <= maxWood; i++) {
      children.push({
        type: 'seq',
        children: [
          payLeaf({ cardId: CARD_ID, cost: { wood: i } }),
          {
            type: 'leaf',
            actionId: 'special-effect',
            sourceCard: CARD_ID,
            params: { kind: 'increment-counter', key: 'woodPlaced', amount: i },
          },
        ],
      })
    }

    return {
      flow: {
        type: 'xor',
        optional: true,
        children,
      } as ActionFlow,
      sourceCard: CARD_ID,
    }
  },
}

export const C132_TimberShingleMaker_impl = {
  listeners: [afterRenovateListener],
  effect: {
  id: CARD_ID,
  computeBonusScore: (_state, player) => {
    return player.cardStates?.[CARD_ID]?.counters?.woodPlaced ?? 0
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
