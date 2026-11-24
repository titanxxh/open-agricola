import { harvestRounds } from '../../../contract/state-constants'
import { defineMinorCard } from '../../card-source'
import { makeCardFieldImpl } from '../../helpers/card-field'
import { gainLeaf } from '../../helpers/pay-gain-node'
import type { ActionFlow } from '../../../contract/types'

const CARD_ID = 'CFL006_EndiveField'
const field = makeCardFieldImpl(CARD_ID, { allowedCrops: ['vegetable'], capacity: 1 })
const openForSowing = (round: number): ActionFlow => ({
  type: 'leaf', actionId: 'special-effect', sourceCard: CARD_ID,
  params: { kind: 'set-flag', flag: harvestRounds.includes(round) },
})

export const CFL006_EndiveField = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: 'Endive Field',
    deck: 'CFL',
    number: 6,
    cost: { food: 2 },
    occupationPrerequisites: { min: 2 },
    prerequisite: '2 Occupations',
    desc: ['When you play this card, you get 1 <VEGETABLE>. In rounds that end with a harvest, you may __Sow__ <VEGETABLE> on this card as if it were 1 <FIELD>. It counts as a <FIELD> except during scoring.'],
    implemented: true,
    artUrl: 'assets/classic/CFL/CFL006.png',
    cardField: { allowedCrops: ['vegetable'], capacity: 1 },
    isField: true,
  },
  presentation: { cardFields: true },
  impl: {
    effect: {
      ...field.effect,
      id: CARD_ID,
      onBuy: state => ({ type: 'seq', children: [gainLeaf(CARD_ID, { vegetable: 1 }), openForSowing(state.round)] }),
      stageEligibility: {
        onBeforeStartOfTurn: (_state, player, ctx) => ctx.roundPreparation?.kind === 'before-reveal'
          && !!player.cardStates[CARD_ID]?.flagged !== harvestRounds.includes(ctx.roundPreparation.nextRound),
      },
      onBeforeStartOfTurn: (_state, _player, ctx) => ctx?.roundPreparation?.kind === 'before-reveal'
        ? openForSowing(ctx.roundPreparation.nextRound) : undefined,
      onComputeSowableFields: player => player.cardStates[CARD_ID]?.flagged
        ? field.effect?.onComputeSowableFields?.(player) ?? [] : [],
    },
  },
})
