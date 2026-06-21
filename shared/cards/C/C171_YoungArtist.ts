import { defineOccupationCard } from '../card-source'
import { improvementAction } from '../../actions/effects/improvement'
import { payLeaf } from '../helpers/pay-gain-node'
import type { ActionFlow } from '../../contract/types'
import type { CardImpl } from '../registry'

const CARD_ID = 'C171_YoungArtist'
const MINOR_ACTION_CONTEXT = { types: ['minor'], trueAction: false } as const

const minorImprovementBranch = (): ActionFlow => ({
  type: 'seq',
  choiceLabelKey: 'actions.improvement.name',
  children: [
    payLeaf({ cardId: CARD_ID, cost: { food: 1 } }),
    {
      type: 'leaf',
      actionId: 'improvement',
      sourceCard: CARD_ID,
      actionContext: MINOR_ACTION_CONTEXT,
    },
  ],
})

const drawMinorBranch = (): ActionFlow => ({
  type: 'seq',
  choiceLabelKey: 'actions.draw-ordinary-cards.name',
  children: [
    payLeaf({ cardId: CARD_ID, cost: { food: 1 } }),
    {
      type: 'leaf',
      actionId: 'draw-ordinary-cards',
      sourceCard: CARD_ID,
      params: { cardType: 'minor', count: 2 },
      actionContext: { cardType: 'minor', count: 2 },
    },
  ],
})

const cardImpl = {
  effect: {
    id: CARD_ID,
    onStartReturnHome: (state, player) => {
      if (player.resources.food < 1) return
      const children: ActionFlow[] = []
      if (improvementAction.canBeExecutedByPlayer(state, player, {
        sourceCard: CARD_ID,
        actionContext: MINOR_ACTION_CONTEXT,
      })) {
        children.push(minorImprovementBranch())
      }
      if (state.ordinaryCardDecks.minor.length > 0) {
        children.push(drawMinorBranch())
      }
      if (children.length === 0) return
      return {
        type: 'xor',
        optional: true,
        promptKey: 'ui.interactionFlowSelect',
        children,
      }
    },
  },
  reaches: [] as readonly string[],
} satisfies CardImpl

export const C171_YoungArtist = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: 'Young Artist',
    deck: 'C',
    number: 171,
    category: 'ACTIONS_BOOSTER',
    desc: ['In the returning home phase of each round, you can pay 1 food to either take a "Minor Improvement" action or to draw 2 new minor improvements.'],
    cost: {},
    players: '5+',
  },
  impl: cardImpl,
})

export const C171_YoungArtist_impl = C171_YoungArtist.impl
