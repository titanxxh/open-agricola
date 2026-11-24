import { defineOccupationCard } from '../card-source'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { readImprovementTypes } from '../../actions/effects/improvement'
import type { ActionChoiceOption, ActionFlow } from '../../contract/types'
import { readCardExtraData } from '../helpers/card-state'
import { getCardDefinitionById } from '../helpers/card-type'
import { payLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'
import { getAvailableMajorImprovementIds } from '../major/supply'

const CARD_ID = 'E091_PlowBuilder'

/** The Harvest, by its round, in which the owner used the Joinery, and the one in which they plowed. */
const USED_JOINERY_ROUND = 'usedJoineryRound'
const PLOWED_ROUND = 'plowedRound'

const markRound = (key: string, round: number): ActionFlow => ({
  type: 'leaf',
  actionId: 'special-effect',
  sourceCard: CARD_ID,
  params: { kind: 'set-extra-data', key, value: round },
})

/**
 * The reference isListeningTo: catches Exchange events; if `trade.sourceId` has
 * Joinery identity, marks this Harvest as one in which the Joinery was used.
 * The mark carries the Harvest's round, so the next Harvest starts unmarked.
 */
const tradeAppliedListener: CardListenerRegistration = {
  id: 'E91-plow-builder-trade-applied',
  cardIds: [CARD_ID],
  actions: ['trade-applied'],
  phases: ['immediatelyAfter' as ActionHookPhase],
  scope: 'player',
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.state.roundPhase !== 'harvest' && context.state.roundPhase !== 'feeding') return
    const sourceId = context.extraData?.sourceId
    if (typeof sourceId !== 'string') return
    if (getCardDefinitionById(sourceId)?.joineryIdentity !== true) return
    return { flow: markRound(USED_JOINERY_ROUND, context.state.round), sourceCard: CARD_ID }
  },
}

const choiceCandidateListener: CardListenerRegistration = {
  id: 'E91-plow-builder-compute-choice-candidates',
  cardIds: [CARD_ID],
  actions: ['improvement'],
  phases: ['computeChoiceCandidates' as ActionHookPhase],
  handler: (context) => {
    const types = readImprovementTypes(context)
    if (types.length !== 1 || types[0] !== 'minor') return
    if (context.actionContext?.trueAction === false) return
    if (context.sourceCard) return
    if (!context.player.occupationPlayed.includes(CARD_ID)) return
    const extraOptions: ActionChoiceOption[] = getAvailableMajorImprovementIds(context.state)
      .filter((id) => getCardDefinitionById(id)?.joineryIdentity === true)
      .map((id) => ({
        value: id,
        labelKey: `improvements.${id}.name`,
        sourceCard: CARD_ID,
      }))
    if (extraOptions.length === 0) return
    return { extraOptions, sourceCard: CARD_ID }
  },
}

const anytimeListener: CardListenerRegistration = {
  id: 'E91-plow-builder-anytime',
  cardIds: [CARD_ID],
  actions: ['anytime'],
  phases: ['anytime' as ActionHookPhase],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.state.roundPhase !== 'harvest' && context.state.roundPhase !== 'feeding') return
    // Once per Harvest in which the owner used the Joinery.
    const round = context.state.round
    if (readCardExtraData<number>(context.player, CARD_ID, USED_JOINERY_ROUND) !== round) return
    if (readCardExtraData<number>(context.player, CARD_ID, PLOWED_ROUND) === round) return
    if (context.player.resources.food < 1) return
    return {
      flow: {
        type: 'seq',
        children: [
          payLeaf({ cardId: CARD_ID, cost: { food: 1 } }),
          { type: 'leaf', actionId: 'plow', sourceCard: CARD_ID },
          markRound(PLOWED_ROUND, round),
        ],
      },
      sourceCard: CARD_ID,
    }
  },
}

const cardImpl = {
  listeners: [choiceCandidateListener, tradeAppliedListener, anytimeListener],
  effect: {
    id: CARD_ID,
  },
  reaches: [] as readonly string[],
} satisfies CardImpl

export const E091_PlowBuilder = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: 'Plow Builder',
    deck: 'E',
    number: 91,
    desc: ['You can build the Joinery when taking a __Minor Improvement__ action. If you use the Joinery (or an upgrade thereof) during the harvest, you can pay 1 <FOOD> to plow 1 <FIELD>.'],
    cost: {},
    players: '1+',
    category: 'FARMYARD_-_PLOWING',
  },
  impl: cardImpl,
})

export const E091_PlowBuilder_impl = E091_PlowBuilder.impl
