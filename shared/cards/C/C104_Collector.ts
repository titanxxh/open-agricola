import { PlayerActionCard } from '../types'
import { registerCardEffect } from '../card-effects'
import { registerPlayerActionSpace, createPlayerActionSpaces } from '../player-action-space'
import { readCardExtraData, writeCardExtraData } from '../helpers/card-state'

const CARD_ID = 'C104_Collector'

// Most valuable resources first for auto-selection
const RESOURCE_TYPES = [
  'cattle', 'boar', 'sheep', 'stone', 'reed', 'vegetable', 'grain', 'clay', 'wood', 'food',
] as const

const USES_TO_RESOURCES: Record<number, number> = { 1: 6, 2: 7, 3: 8, 4: 9 }

registerPlayerActionSpace({
  cardId: CARD_ID,
  access: 'owner',
  createDefinition: (ownerId) => ({
    id: CARD_ID,
    nameKey: 'cards.C104_Collector.name',
    descriptionKey: 'cards.C104_Collector.desc',
    canBeExecutedByPlayer: (_state, player) => {
      if (player.id !== ownerId) return false
      return (readCardExtraData<number>(player, CARD_ID, 'used') ?? 0) < 4
    },
    execute: ({ player }) => {
      const useCount = (readCardExtraData<number>(player, CARD_ID, 'used') ?? 0) + 1
      writeCardExtraData(player, CARD_ID, 'used', useCount)
      // Gain 1 begging marker
      player.resources.begging += 1
      // Auto-select N most valuable different resource types
      const n = USES_TO_RESOURCES[useCount] ?? 6
      const gained: Partial<Record<string, number>> = {}
      for (let i = 0; i < Math.min(n, RESOURCE_TYPES.length); i++) {
        const res = RESOURCE_TYPES[i]
        player.resources[res as keyof typeof player.resources] += 1
        gained[res] = 1
      }
      return { type: 'ok' as const, resourcesGained: gained }
    },
  }),
})

registerCardEffect({
  id: CARD_ID,
  onBuy: (state, _player) => {
    const newSpaces = createPlayerActionSpaces(state)
    for (const space of newSpaces) {
      if (!state.actionSpaces.some((s) => s.id === space.id)) {
        state.actionSpaces.push(space)
      }
    }
  },
})

export const C104_Collector = new PlayerActionCard({
  id: "C104_Collector",
  name: "Collector",
  deck: "C",
  number: 104,
  category: "GOODS_PROVIDER",
  desc: ["This card is an action space for you only. When you use it for the 1st/2nd/3rd/4th time, you get 1 <BEGGING> marker and 6/7/8/9 different good of your choice."],
  cost: {},
  players: "1+",
})
