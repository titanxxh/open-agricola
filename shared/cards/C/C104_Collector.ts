import { definePlayerActionCard } from '../card-source'
import { registerPlayerActionSpace, createPlayerActionSpaces, definePlayerActionSpaceFlow } from '../player-action-space'
import { registerAdHocAction } from '../../actions/helpers/ad-hoc-action-registry'
import { canUseResourceSetSelection, createResourceSetSelectionAction, type ResourceSetSelectionPlan } from '../../actions/plans/resource-set-selection'
import type { CardImpl } from '../registry'

const CARD_ID = 'C104_Collector'

const SELECT_ACTION = `card_${CARD_ID}_select`
const selectionPlan = {
  choices: ['wood', 'clay', 'reed', 'stone', 'food', 'grain', 'vegetable', 'sheep', 'boar', 'cattle'],
  countsByUse: [6, 7, 8, 9], resourcesPerChoice: 1, extraGain: { begging: 1 },
  usageFact: 'used', promptKey: 'ui.interactionCollectorSelect',
} satisfies ResourceSetSelectionPlan
registerAdHocAction(createResourceSetSelectionAction(CARD_ID, SELECT_ACTION, selectionPlan))
registerPlayerActionSpace({
  cardId: CARD_ID, access: 'owner',
  createDefinition: ownerId => definePlayerActionSpaceFlow({
    id: CARD_ID, nameKey: 'cards.C104_Collector.name', descriptionKey: 'cards.C104_Collector.desc',
    canBeExecutedByPlayer: (_state, player) => player.id === ownerId && canUseResourceSetSelection(player, CARD_ID, selectionPlan),
    flowFactory: () => ({ type: 'leaf', actionId: SELECT_ACTION, sourceCard: CARD_ID }),
  }),
})

const cardImpl = {
  effect: {
  id: CARD_ID,
  onBuy: (state, _player) => {
    const newSpaces = createPlayerActionSpaces(state)
    for (const space of newSpaces) {
      if (!state.actionSpaces.some((s) => s.id === space.id)) {
        state.actionSpaces.push(space)
      }
    }
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl

export const C104_Collector = definePlayerActionCard({
  meta: {
    id: "C104_Collector",
    name: "Collector",
    deck: "C",
    number: 104,
    playerActionCardType: 'occupation',
    category: "GOODS_PROVIDER",
    desc: ["This card is an action space for you only. When you use it for the 1st/2nd/3rd/4th time, you get 1 <BEGGING> marker and 6/7/8/9 different goods of your choice."],
    cost: {},
    players: "1+",
  },
  impl: cardImpl,
})

export const C104_Collector_impl = C104_Collector.impl
