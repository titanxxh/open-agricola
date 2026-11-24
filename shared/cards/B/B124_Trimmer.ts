import { defineOccupationCard } from '../card-source'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import { readCardExtraData } from '../helpers/card-state'
import { getActionNewlyEnclosedPastureTiles, hasFenceBuiltEvent } from '../helpers/fence-events'
import type { CardImpl } from '../registry'

const CARD_ID = 'B124_Trimmer'
const REWARD_ROUND_KEY = 'rewardRound'

/** The work phase lasts until `work.ended`, as for Action Space use (`action-space-use.ts`). */
const isWorkPhaseOpen = (state: CardListenerContext['state']): boolean =>
  state.roundPhase === 'work' || (state.roundPhase === 'returning-home'
    && !state.events.some((event) => event.round === state.round && event.type === 'work.ended'))

/** Newly enclosed area belongs to the completed host; the once-per-work-phase
 * limit is the owner's reward round. */
const afterFencingListener: CardListenerRegistration = {
  id: 'B124-trimmer-after-fencing',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['fence'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!isWorkPhaseOpen(context.state) || !hasFenceBuiltEvent(context)) return
    if (readCardExtraData<number>(context.player, CARD_ID, REWARD_ROUND_KEY) === context.state.round) return
    if (getActionNewlyEnclosedPastureTiles(context).length === 0) return
    return {
      flow: {
        type: 'seq',
        children: [
          { type: 'leaf', actionId: 'special-effect', sourceCard: CARD_ID, params: { kind: 'set-extra-data', key: REWARD_ROUND_KEY, value: context.state.round } },
          gainLeaf(CARD_ID, { stone: 2 }),
        ],
      },
      sourceCard: CARD_ID,
    }
  },
}

const cardImpl = {
  listeners: [afterFencingListener],
  reaches: [] as readonly string[],
} satisfies CardImpl

export const B124_Trimmer = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: 'Trimmer',
    deck: 'B',
    number: 124,
    category: 'BUILDING_RESOURCE_PROVIDER',
    desc: ['In each work phase, after you enclose at least one farmyard space, you get 2 <STONE>. (Subdividing an existing pasture does not count.)'],
    cost: {},
    players: '1+',
    evenMoreSet: true,
  },
  impl: cardImpl,
})

export const B124_Trimmer_impl = B124_Trimmer.impl
