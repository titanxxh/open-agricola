import { defineMinorCard } from '../../card-source'
import type { CardImpl } from '../../registry'
import { makeCardFieldImpl, getLogicalFields, mutateLogicalFields } from '../../helpers/card-field'
import { gainLeaf, payGainFlow } from '../../helpers/pay-gain-node'
import { registerAdHocAction } from '../../../actions/helpers/ad-hoc-action-registry'
import { harvestRounds } from '../../../contract/state-constants'

const CARD_ID = 'CFL006_EndiveField'

const fieldImpl = makeCardFieldImpl(CARD_ID, { allowedCrops: ['vegetable'], capacity: 1 })
const PLANT_ACTION = 'card_CFL006_EndiveField_plant'
registerAdHocAction({
  id: PLANT_ACTION,
  nameKey: 'actions.sow.name',
  descriptionKey: 'actions.sow.description',
  roundAvailable: 1,
  gainPerRound: {},
  canBeExecutedByPlayer: (_state, player) =>
    getLogicalFields(player).some(
      (field) => field.sourceCard === CARD_ID && field.stacks.length === 0,
    ),
  execute: ({ state, player, eventSink }) => {
    const result = mutateLogicalFields(state, player, { sourceCard: CARD_ID, eventSink }).place(
      { fieldId: `card:${CARD_ID}`, slot: 0 },
      'vegetable',
      2,
    )
    return result.ok ? { type: 'ok' } : { type: 'fail', errorKey: 'log.actionFail' }
  },
})

const cardImpl = {
  ...fieldImpl,
  effect: {
    ...fieldImpl.effect,
    id: CARD_ID,
    // This card is planted only by its own end-of-round action, never ordinary Sow.
    onComputeSowableFields: () => [],
    onSowExtraField: () => false,
    onBuy: () => gainLeaf(CARD_ID, { vegetable: 1 }),
    onAfterRoundEnd: (state, player) => {
      if (
        !harvestRounds.includes(state.round) ||
        getLogicalFields(player).find((field) => field.sourceCard === CARD_ID)?.stacks.length
      )
        return
      return payGainFlow({
        cardId: CARD_ID,
        cost: { vegetable: 1 },
        followUp: [{ type: 'leaf', actionId: PLANT_ACTION, sourceCard: CARD_ID }],
      })
    },
  },
  listeners: [],
} satisfies CardImpl

export const CFL006_EndiveField = defineMinorCard({
  meta: {
    id: 'CFL006_EndiveField',
    name: 'Endive Field',
    deck: 'CFL',
    number: 6,
    cost: {
      food: 2,
    },
    occupationPrerequisites: {
      min: 2,
    },
    desc: [
      'You immediately get 1 <VEGETABLE>. At the end of each round that ends with a harvest, you may plant 1 <VEGETABLE> on this card as on a field.',
    ],
    implemented: true,
    artUrl: 'assets/classic/CFL/CFL006.png',
    cardField: {
      allowedCrops: ['vegetable'],
      capacity: 1,
    },
    isField: true,
  },
  presentation: { cardFields: true },
  impl: cardImpl,
})
