import { defineOccupationCard } from '../card-source'
import { getLogicalFields } from '../helpers/card-field'
import type { CardImpl } from '../registry'
import type { ActionChoiceOption, PlayerState } from '../../contract/types'
import { sumSelectedScoringReserve } from '../../domain/scoring-reserve'
import { payGainActionFlow } from '../helpers/pay-gain-node'

const CARD_ID = 'C099_GardenDesigner'

const scoringOptions = (player: PlayerState): ActionChoiceOption[] => {
  const emptyFields = getLogicalFields(player).filter((field) => field.stacks.length === 0).length
  const food = player.resources.food - (sumSelectedScoringReserve(player).food ?? 0)
  const options = new Map<string, ActionChoiceOption>()
  for (let n7 = 0; n7 <= emptyFields; n7++) {
    for (let n4 = 0; n4 + n7 <= emptyFields; n4++) {
      for (let n1 = 0; n1 + n4 + n7 <= emptyFields; n1++) {
        const cost = 7 * n7 + 4 * n4 + n1
        if (cost > food) continue
        const score = 3 * n7 + 2 * n4 + n1
        const value = `${CARD_ID}:food:${cost}:score:${score}`
        options.set(value, {
          value,
          labelKey: 'ui.cards.C099_GardenDesigner.invest',
          labelParams: { food: cost, score },
          sourceCard: CARD_ID,
          effectPreview: { kind: 'resourceExchange', resourcesPaid: { food: cost }, bonusVp: score },
        })
      }
    }
  }
  return [...options.values()]
}

const cardImpl = {
  effect: {
    id: CARD_ID,
    beforeEndGameMandatory: true,
    onBeforeEndGame: (_state, player) => {
      const options = scoringOptions(player)
      if (options.length <= 1) return
      return {
        type: 'leaf',
        actionId: 'emit-choice',
        sourceCard: CARD_ID,
        targetPlayerId: player.id,
        params: { promptKey: 'ui.interactionExchangeChoice', options },
      }
    },
    resolveChoice: (_state, player, choice) => {
      const option = scoringOptions(player).find((candidate) => candidate.value === choice)
      const preview = option?.effectPreview
      if (preview?.kind !== 'resourceExchange') return
      const food = preview.resourcesPaid?.food ?? 0
      if (food <= 0) return
      return payGainActionFlow({
        cardId: CARD_ID,
        cost: { food },
        gain: { score: preview.bonusVp ?? 0 },
      })
    },
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
