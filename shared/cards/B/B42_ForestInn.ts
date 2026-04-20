import { PlayerActionCard } from '../types'
import { registerPlayerActionSpace, createPlayerActionSpaces } from '../player-action-space'
import type { CardImpl } from '../registry'

const CARD_ID = 'B42_ForestInn'

// All players can use it. Exchange wood for wood+food.
// Non-owners must pay 1 food to the owner first.
// Choices: 5W→8W+2F / 7W→8W+4F / 9W→8W+7F
registerPlayerActionSpace({
  cardId: CARD_ID,
  access: 'all',
  createDefinition: (ownerId) => ({
    id: CARD_ID,
    nameKey: 'cards.B42_ForestInn.name',
    descriptionKey: 'cards.B42_ForestInn.desc',
    canBeExecutedByPlayer: (_state, player) => {
      // Non-owner must have at least 1 food to pay
      if (player.id !== ownerId && player.resources.food < 1) return false
      // Must have at least 5 wood to exchange
      return player.resources.wood >= 5
    },
    execute: ({ state, player }) => {
      // Non-owner pays 1 food to the owner
      if (player.id !== ownerId) {
        player.resources.food -= 1
        const owner = state.players.find((p) => p.id === ownerId)
        if (owner) owner.resources.food += 1
      }
      // Build options based on available wood
      const options: { value: string; labelKey: string; sourceCard: string }[] = []
      if (player.resources.wood >= 5) options.push({ value: '5', labelKey: 'ui.interactionForestInn5', sourceCard: CARD_ID })
      if (player.resources.wood >= 7) options.push({ value: '7', labelKey: 'ui.interactionForestInn7', sourceCard: CARD_ID })
      if (player.resources.wood >= 9) options.push({ value: '9', labelKey: 'ui.interactionForestInn9', sourceCard: CARD_ID })
      if (options.length === 0) return { type: 'ok' }
      return {
        type: 'choice',
        promptKey: 'ui.interactionForestInn',
        options,
      }
    },
    resolveChoice: ({ player }, choice) => {
      const exchanges: Record<string, { woodCost: number; woodGain: number; foodGain: number }> = {
        '5': { woodCost: 5, woodGain: 8, foodGain: 2 },
        '7': { woodCost: 7, woodGain: 8, foodGain: 4 },
        '9': { woodCost: 9, woodGain: 8, foodGain: 7 },
      }
      const ex = exchanges[choice]
      if (!ex || player.resources.wood < ex.woodCost) return { type: 'ok' }
      player.resources.wood -= ex.woodCost
      player.resources.wood += ex.woodGain
      player.resources.food += ex.foodGain
      return {
        type: 'ok',
        resourcesGained: { wood: ex.woodGain, food: ex.foodGain },
      }
    },
  }),
})

export const B42_ForestInn = new PlayerActionCard({
  id: CARD_ID,
  name: "Forest Inn",
  deck: "B",
  number: 42,
  category: "GOODS_PROVIDER",
  desc: ["This is an action space for all. A player who uses it can exchange 5/7/9 <WOOD> for 8 <WOOD> and 2/4/7 <FOOD>. When another player uses it, they must first pay you 1 <FOOD>."],
  cost: {"clay":1,"reed":1},
  prerequisite: "Play in Round 6 or Before",
  newSet: true,
})

export const B42_ForestInn_impl = {
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
