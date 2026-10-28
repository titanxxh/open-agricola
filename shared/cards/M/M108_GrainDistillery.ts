import { defineMinorCard } from '../card-source'
import type { CardImpl } from '../registry'
import type { PlayerState } from '../../contract/types'
import { scoringOfferChoice, type ScoringOffer } from '../../actions/plans/scoring-offer'

const CARD_ID = 'M108_GrainDistillery'
const maxPairs = (player: PlayerState) => Math.max(0, Math.min(player.resources.fuel ?? 0, player.resources.grain))
const scoringChoice = scoringOfferChoice(CARD_ID, player => Array.from(
  { length: maxPairs(player) + 1 },
  (_, pairs): ScoringOffer => ({
    value: `${CARD_ID}:pairs:${pairs}`,
    kind: 'pay',
    resources: pairs === 0 ? {} : { grain: pairs, fuel: pairs },
    score: pairs,
  }),
))

const cardImpl = {
  listeners: [{
    id: `${CARD_ID}:scoring`,
    cardIds: [CARD_ID],
    actions: ['anytime'],
    phases: ['anytime'],
    preScoring: 'only',
    handler: ({ player }) => maxPairs(player) > 0 ? {
      sourceCard: CARD_ID,
      flow: scoringChoice.promptLeaf(player, 'ui.interactionResourceExchange'),
    } : undefined,
  }],
  effect: {
    id: CARD_ID,
    resolveChoice: scoringChoice.resolveChoice,
  },
  reaches: [] as readonly string[],
} satisfies CardImpl

export const M108_GrainDistillery = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Grain Distillery",
    deck: "M",
    number: 108,
    category: "FOOD_PROVIDER",
    desc: [
        "Harvest: once, you can turn 1 <FUEL> and 1 <GRAIN> into 5 <FOOD>. Any number of times during scoring: 1 <FUEL> and 1 <GRAIN> <ARROW> 1 bonus <SCORE>."
    ],
    cost: {
        "stone": 2,
        "sheep": 1
    },
    vp: 1,
    extraVp: true,
    exchanges: [
        { from: { fuel: 1, grain: 1 }, to: { food: 5 }, max: 1, sourceId: CARD_ID, triggers: ['harvest'] },
      ],
    implemented: true,
    requiresFarmersOfTheMoor: true,
  },
  impl: cardImpl,
})

export const M108_GrainDistillery_impl = M108_GrainDistillery.impl
