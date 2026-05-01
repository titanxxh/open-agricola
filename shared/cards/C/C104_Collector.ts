import { PlayerActionCard } from '../types'
import { registerPlayerActionSpace, createPlayerActionSpaces } from '../player-action-space'
import { readCardExtraData } from '../helpers/card-state'
import type { ActionFlow } from '../../game/types'
import type { CardImpl } from '../registry'

const CARD_ID = 'C104_Collector'

const RESOURCE_TYPES = ['wood', 'clay', 'reed', 'stone', 'food', 'grain', 'vegetable', 'sheep', 'boar', 'cattle'] as const

const USES_TO_RESOURCES: Record<number, number> = { 1: 6, 2: 7, 3: 8, 4: 9 }

const buildSelectionChoice = (needed: number) => ({
  type: 'choice' as const,
  promptKey: 'ui.interactionCollectorSelect',
  promptParams: { needed },
  options: RESOURCE_TYPES.map((r) => ({
    value: r,
    labelKey: `resources.${r}`,
    sourceCard: CARD_ID,
  })),
})

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
    // Read-only: peek at the next useCount to compute `needed`. Mutation
    // (used += 1, begging += 1, resource gains) is deferred to resolveChoice
    // so the engine drives all state changes via leaves.
    execute: ({ player }) => {
      const useCount = (readCardExtraData<number>(player, CARD_ID, 'used') ?? 0) + 1
      const needed = USES_TO_RESOURCES[useCount] ?? 6
      return buildSelectionChoice(needed)
    },
    resolveChoice: ({ player }, choice) => {
      const selections = choice.split(',').filter((s) =>
        RESOURCE_TYPES.includes(s as typeof RESOURCE_TYPES[number]),
      )
      const unique = [...new Set(selections)]
      // execute() did not yet bump `used`, so the live counter still reflects
      // prior uses. Compute the next needed count the same way execute did.
      const useCount = (readCardExtraData<number>(player, CARD_ID, 'used') ?? 0) + 1
      const needed = USES_TO_RESOURCES[useCount] ?? 6
      if (unique.length !== needed) {
        return buildSelectionChoice(needed)
      }
      const gainParams: Record<string, number> = { begging: 1 }
      for (const res of unique) gainParams[res] = 1
      const flow: ActionFlow = {
        type: 'seq',
        children: [
          {
            type: 'leaf',
            actionId: 'special-effect',
            sourceCard: CARD_ID,
            params: { kind: 'increment-extra-data', key: 'used', amount: 1 },
          },
          {
            type: 'leaf',
            actionId: 'gain',
            sourceCard: CARD_ID,
            params: gainParams,
          },
        ],
      }
      return { type: 'flow', flow }
    },
  }),
})

export const C104_Collector = new PlayerActionCard({
  id: "C104_Collector",
  name: "Collector",
  deck: "C",
  number: 104,
  category: "GOODS_PROVIDER",
  desc: ["This card is an action space for you only. When you use it for the 1st/2nd/3rd/4th time, you get 1 <BEGGING> marker and 6/7/8/9 different goods of your choice."],
  cost: {},
  players: "1+",
})

export const C104_Collector_impl = {
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
