import { defineOccupationCard } from '../card-source'
import { getLogicalFields } from '../helpers/card-field'
import type { CardImpl } from '../registry'
import type { PlayerState } from '../../contract/types'
import { sumSelectedScoringReserve } from '../../domain/scoring-reserve'
import { scoringOfferChoice, type ScoringOffer } from '../../actions/plans/scoring-offer'

const CARD_ID = 'C099_GardenDesigner'

const scoringOffers = (player: PlayerState): ScoringOffer[] => {
  const emptyFields = getLogicalFields(player).filter((field) => field.stacks.length === 0).length
  const food = player.resources.food - (sumSelectedScoringReserve(player).food ?? 0)
  const options = new Map<string, ScoringOffer>()
  for (let n7 = 0; n7 <= emptyFields; n7++) {
    for (let n4 = 0; n4 + n7 <= emptyFields; n4++) {
      for (let n1 = 0; n1 + n4 + n7 <= emptyFields; n1++) {
        const cost = 7 * n7 + 4 * n4 + n1
        if (cost > food) continue
        const score = 3 * n7 + 2 * n4 + n1
        const value = `${CARD_ID}:food:${cost}:score:${score}`
        options.set(value, { value, kind: 'pay', resources: { food: cost }, score })
      }
    }
  }
  return [...options.values()]
}
const scoringChoice = scoringOfferChoice(CARD_ID, scoringOffers)

const cardImpl = {
  effect: {
    id: CARD_ID,
    projectInteractionRequest: (_state, player, request, actionId) => {
      if (actionId !== 'emit-choice' || request.kind !== 'choice') return request
      return { ...request, options: scoringChoice.options(player) }
    },
    beforeEndGameMandatory: true,
    onBeforeEndGame: (_state, player) => {
      if (scoringOffers(player).length <= 1) return
      return scoringChoice.promptLeaf(player, 'ui.interactionExchangeChoice', { anytimeWindow: { allowed: true, blockedIds: ['exchange'] } })
    },
    resolveChoice: scoringChoice.resolveChoice,
  },
  reaches: [] as readonly string[],
} satisfies CardImpl

export const C099_GardenDesigner = defineOccupationCard({
  meta: {
    id: "C099_GardenDesigner",
    name: "Garden Designer",
    deck: "C",
    number: 99,
    category: "POINTS_PROVIDER",
    desc: ["At the start of scoring, you can place <FOOD> in empty <FIELD>. You get 1/2/3 bonus <SCORE> for each <FIELD> in which you place 1/4/7 <FOOD>."],
    cost: {},
    players: "1+",
    extraVp: true,
  },
  impl: cardImpl,
})

export const C099_GardenDesigner_impl = C099_GardenDesigner.impl
