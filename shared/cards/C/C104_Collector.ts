import { PlayerActionCard } from '../types'
import { registerCardEffect } from '../card-effects'
import { registerPlayerActionSpace, createPlayerActionSpaces } from '../player-action-space'
import { readCardExtraData, writeCardExtraData } from '../helpers/card-state'

const CARD_ID = 'C104_Collector'

const RESOURCE_TYPES = ['wood', 'clay', 'reed', 'stone', 'food', 'grain', 'vegetable', 'sheep', 'boar', 'cattle'] as const

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
      writeCardExtraData(player, CARD_ID, 'pendingSelections', [])
      player.resources.begging += 1
      return {
        type: 'choice' as const,
        promptKey: 'ui.interactionCollectorSelect',
        options: RESOURCE_TYPES.map((r) => ({
          value: r,
          labelKey: `resources.${r}`,
        })),
      }
    },
    resolveChoice: ({ player }, choice) => {
      const selections = readCardExtraData<string[]>(player, CARD_ID, 'pendingSelections') ?? []
      if (selections.includes(choice)) {
        // Already selected this type — ignore, re-present same options
        const remaining = RESOURCE_TYPES.filter((r) => !selections.includes(r))
        return {
          type: 'choice' as const,
          promptKey: 'ui.interactionCollectorSelect',
          options: remaining.map((r) => ({ value: r, labelKey: `resources.${r}` })),
        }
      }
      selections.push(choice)
      writeCardExtraData(player, CARD_ID, 'pendingSelections', selections)
      const useCount = readCardExtraData<number>(player, CARD_ID, 'used') ?? 1
      const needed = USES_TO_RESOURCES[useCount] ?? 6
      if (selections.length < needed) {
        // More selections needed — present remaining types
        const remaining = RESOURCE_TYPES.filter((r) => !selections.includes(r))
        return {
          type: 'choice' as const,
          promptKey: 'ui.interactionCollectorSelect',
          options: remaining.map((r) => ({ value: r, labelKey: `resources.${r}` })),
        }
      }
      // All selections made — give 1 of each selected resource
      const gained: Record<string, number> = {}
      for (const res of selections) {
        (player.resources as Record<string, number>)[res] = ((player.resources as Record<string, number>)[res] ?? 0) + 1
        gained[res] = 1
      }
      writeCardExtraData(player, CARD_ID, 'pendingSelections', null)
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
