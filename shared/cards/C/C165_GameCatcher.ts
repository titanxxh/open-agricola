import { defineOccupationCard } from '../card-source'
import { payLeaf, gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'
import type { Resource } from '../../contract/types'
import { collectOccupationActionPaymentOptions } from '../../actions/effects/occupation'

const CARD_ID = 'C165_GameCatcher'
const harvestRounds = [4, 7, 9, 11, 13, 14]

const cardImpl = {
  listeners: [{
    id: 'C165-game-catcher-reserve-food',
    cardIds: [CARD_ID],
    zones: ['hand'],
    actions: ['occupation'],
    phases: ['isDoable'],
    handler: (context) => {
      if (context.choice !== CARD_ID) return
      const food = harvestRounds.filter((round) => round >= context.state.round).length
      const options = collectOccupationActionPaymentOptions(
        context.state,
        context.player,
        CARD_ID,
        (context.extraData?.occupationBaseCost ?? {}) as Partial<Resource>,
        context.actionCardId,
      )
      return options.some((option) => context.player.resources.food - (option.resourcesPaid.food ?? 0) >= food)
        ? { reserveResources: { food } }
        : { doable: false }
    },
  }],
  effect: {
  id: CARD_ID,
  onBuy: (state, _player) => {
    const remainingHarvests = harvestRounds.filter((r) => r >= state.round).length
    if (remainingHarvests === 0) {
      return gainLeaf(CARD_ID, { cattle: 1, boar: 1 })
    }
    return {
      type: 'seq' as const,
      children: [
        payLeaf({ cardId: CARD_ID, cost: { food: remainingHarvests } }),
        gainLeaf(CARD_ID, { cattle: 1, boar: 1 }),
      ],
    }
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl

export const C165_GameCatcher = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: "Game Catcher",
    deck: "C",
    number: 165,
    category: "LIVESTOCK_PROVIDER",
    desc: ["When you play this card, pay 1 <FOOD> for each remaining harvest to immediately get 1 <CATTLE> and 1 <PIG>."],
    players: "4+",
  },
  impl: cardImpl,
})

export const C165_GameCatcher_impl = C165_GameCatcher.impl
