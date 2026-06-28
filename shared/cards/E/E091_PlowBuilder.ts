import { defineOccupationCard } from '../card-source'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import type { ActionFlow } from '../../contract/types'
import { isCardFlagged, setCardFlag, readCardExtraData, writeCardExtraData } from '../helpers/card-state'
import { payLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'E091_PlowBuilder'
const JOINERY_SOURCE_PREFIX = 'Major_Joinery'

const HARVEST_ROUNDS = [4, 7, 9, 11, 13, 14]

const specialEffect = (params: Record<string, unknown>): ActionFlow => ({
  type: 'leaf',
  actionId: 'special-effect',
  sourceCard: CARD_ID,
  params,
})

/**
 * BGA isListeningTo: catches Exchange events; if `trade.sourceId` belongs to
 * the Joinery family, sets a per-harvest flag `usedJoinery=true`. Cleared at
 * EndHarvestFeedingPhase. We mirror this with a `trade-applied` listener
 * scoped to the card owner.
 */
const tradeAppliedListener: CardListenerRegistration = {
  id: 'E91-plow-builder-trade-applied',
  cardIds: [CARD_ID],
  actions: ['trade-applied'],
  phases: ['immediatelyAfter' as ActionHookPhase],
  scope: 'player',
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const sourceId = context.extraData?.sourceId
    if (typeof sourceId !== 'string') return
    if (!sourceId.startsWith(JOINERY_SOURCE_PREFIX)) return
    return {
      flow: specialEffect({ kind: 'set-extra-data', key: 'usedJoinery', value: true }),
      sourceCard: CARD_ID,
    }
  },
}

const anytimeListener: CardListenerRegistration = {
  id: 'E91-plow-builder-anytime',
  cardIds: [CARD_ID],
  phases: ['anytime' as ActionHookPhase],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (isCardFlagged(context.player, CARD_ID)) return
    if (!HARVEST_ROUNDS.includes(context.state.round)) return
    // BGA: anytime gate is `isFlagged('usedJoinery') && !isFlagged()`. The
    // `usedJoinery` flag is set by the trade-applied listener above.
    const usedJoinery = readCardExtraData<boolean>(context.player, CARD_ID, 'usedJoinery') === true
    if (!usedJoinery) return
    if (context.player.resources.food < 1) return
    return {
      flow: {
        type: 'seq',
        children: [
          payLeaf({ cardId: CARD_ID, cost: { food: 1 } }),
          { type: 'leaf', actionId: 'plow', sourceCard: CARD_ID },
          { type: 'leaf', actionId: 'special-effect', sourceCard: CARD_ID, params: { kind: 'set-flag', flag: true } },
        ],
      },
      sourceCard: CARD_ID,
      labelKey: 'cards.E091_PlowBuilder.anytime',
    }
  },
}

const cardImpl = {
  listeners: [tradeAppliedListener, anytimeListener],
  effect: {
    id: CARD_ID,
    /** Clear both the per-use flag (anytime gate) and the per-harvest
     *  `usedJoinery` flag at the end of the harvest. Mirrors BGA's
     *  EndHarvestFeedingPhase reset. */
    onAfterHarvest: (_state, player) => {
      setCardFlag(player, CARD_ID, false)
      writeCardExtraData(player, CARD_ID, 'usedJoinery', false)
    },
  },
  reaches: [] as readonly string[],
} satisfies CardImpl

export const E091_PlowBuilder = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: 'Plow Builder',
    deck: 'E',
    number: 91,
    desc: ['You can build the Joinery when taking a __Minor Improvement__ action. If you use the Joinery (or an upgrade thereof) during the harvest, you can pay 1 <FOOD> to plow 1 field.'],
    cost: {},
    players: '1+',
    category: 'FARMYARD_-_PLOWING',
  },
  impl: cardImpl,
})

export const E091_PlowBuilder_impl = E091_PlowBuilder.impl
