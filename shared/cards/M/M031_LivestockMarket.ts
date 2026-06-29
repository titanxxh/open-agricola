import { defineMinorCard } from '../card-source'
import { canAccommodateAnimalTotals } from '../../domain/animal-zones'
import { getAssignedAnimalsByType } from '../../domain/animals'
import { ALL_ANIMAL_KEYS, type AnimalKey } from '../../contract/animals'
import type { ActionFlow, GameState, PlayerState, Resource, Trade } from '../../contract/types'
import type { CardImpl } from '../registry'

const CARD_ID = 'M031_LivestockMarket'
const MUD_WALLOWER_ID = 'C148_MudWallower'

const EXCHANGE_ANIMALS = ['sheep', 'boar', 'cattle'] as const
type ExchangeAnimal = typeof EXCHANGE_ANIMALS[number]

const NEXT_ANIMAL: Record<ExchangeAnimal, AnimalKey> = {
  sheep: 'boar',
  boar: 'cattle',
  cattle: 'horse',
}

const animalCount = (player: PlayerState, type: AnimalKey) =>
  Math.max(0, Math.floor(player.resources[type] ?? 0))

const totalAnimalCount = (player: PlayerState) =>
  ALL_ANIMAL_KEYS.reduce((sum, type) => sum + animalCount(player, type), 0)

const compactResourceMap = (counts: Partial<Record<AnimalKey, number>>): Partial<Resource> => {
  const result: Partial<Resource> = {}
  for (const type of ALL_ANIMAL_KEYS) {
    const amount = counts[type] ?? 0
    if (amount > 0) result[type] = amount
  }
  return result
}

const buildTrade = (counts: Record<ExchangeAnimal, number>): Trade => {
  const from: Partial<Record<AnimalKey, number>> = {}
  const to: Partial<Record<AnimalKey, number>> = {}
  for (const type of EXCHANGE_ANIMALS) {
    const amount = counts[type]
    if (amount <= 0) continue
    from[type] = (from[type] ?? 0) + amount
    const next = NEXT_ANIMAL[type]
    to[next] = (to[next] ?? 0) + amount
  }
  return {
    from: compactResourceMap(from),
    to: compactResourceMap(to),
    sourceId: CARD_ID,
  }
}

const targetCountsAfterTrade = (
  player: PlayerState,
  trade: Trade,
): Partial<Record<AnimalKey, number>> => {
  const target: Partial<Record<AnimalKey, number>> = {}
  for (const type of ALL_ANIMAL_KEYS) target[type] = animalCount(player, type)
  for (const type of ALL_ANIMAL_KEYS) target[type] = (target[type] ?? 0) - (trade.from[type] ?? 0)
  for (const type of ALL_ANIMAL_KEYS) target[type] = (target[type] ?? 0) + (trade.to[type] ?? 0)
  return target
}

const mudWallowerBoarPaid = (player: PlayerState, trade: Trade): number => {
  const boarPaid = trade.from.boar ?? 0
  if (boarPaid <= 0) return 0
  const assignedBoars = getAssignedAnimalsByType(player).boar ?? 0
  const mudWallowerBoars = Math.min(
    player.cardStates?.[MUD_WALLOWER_ID]?.counters?.held ?? 0,
    Math.max(0, animalCount(player, 'boar') - assignedBoars),
  )
  return Math.min(Math.max(0, boarPaid - assignedBoars), mudWallowerBoars)
}

const withMudWallowerPaymentCapacity = (player: PlayerState, boarPaid: number): PlayerState => {
  if (boarPaid <= 0) return player
  const cardState = player.cardStates?.[MUD_WALLOWER_ID]
  if (!cardState?.counters) return player
  return {
    ...player,
    cardStates: {
      ...player.cardStates,
      [MUD_WALLOWER_ID]: {
        ...cardState,
        counters: {
          ...cardState.counters,
          held: Math.max(0, (cardState.counters.held ?? 0) - boarPaid),
        },
      },
    },
  }
}

type LivestockMarketTrade = {
  trade: Trade
  mudWallowerBoarPaid: number
}

const livestockMarketTrades = (state: GameState, player: PlayerState): LivestockMarketTrade[] => {
  const trades: LivestockMarketTrade[] = []
  for (let sheep = 0; sheep <= Math.min(3, animalCount(player, 'sheep')); sheep += 1) {
    for (let boar = 0; boar <= Math.min(3 - sheep, animalCount(player, 'boar')); boar += 1) {
      for (let cattle = 0; cattle <= Math.min(3 - sheep - boar, animalCount(player, 'cattle')); cattle += 1) {
        const total = sheep + boar + cattle
        if (total <= 0 || total > 3) continue
        const trade = buildTrade({ sheep, boar, cattle })
        const mudWallowerPaid = mudWallowerBoarPaid(player, trade)
        const accommodationPlayer = withMudWallowerPaymentCapacity(player, mudWallowerPaid)
        if (canAccommodateAnimalTotals(state, accommodationPlayer, targetCountsAfterTrade(player, trade))) {
          trades.push({ trade, mudWallowerBoarPaid: mudWallowerPaid })
        }
      }
    }
  }
  return trades
}

const exchangeLeaf = (trade: Trade, mudWallowerBoarPaid: number): ActionFlow => ({
  type: 'leaf',
  actionId: 'exchange',
  sourceCard: CARD_ID,
  actionContext: {
    directTrade: trade,
    ...(mudWallowerBoarPaid > 0
      ? {
        animalPaymentPreference: {
          animal: 'boar',
          avoid: [{ kind: 'cardCounter', cardId: MUD_WALLOWER_ID, counterKey: 'held' }],
        },
      }
      : {}),
  },
  choiceLabelKey: 'ui.interactionResourceExchange',
  choiceLabelParams: {
    resourcesPaid: trade.from,
    resourcesGained: trade.to,
  },
  effectPreview: {
    kind: 'resourceExchange',
    resourcesPaid: trade.from,
    resourcesGained: trade.to,
  },
})

const cardImpl = {
  prerequisiteCheck: (player) => totalAnimalCount(player) >= 5,
  effect: {
    id: CARD_ID,
    onBuy: (state, player) => {
      const children = livestockMarketTrades(state, player)
        .map(({ trade, mudWallowerBoarPaid }) => exchangeLeaf(trade, mudWallowerBoarPaid))
      if (children.length === 0) return undefined
      return {
        type: 'xor' as const,
        optional: true,
        children,
      }
    },
  },
  reaches: [] as readonly string[],
} satisfies CardImpl

export const M031_LivestockMarket = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Livestock Market",
    deck: "M",
    number: 31,
    category: "LIVESTOCK_PROVIDER",
    desc: [
        "You can immediately exchange up to 3 animals of any type at the same time, if you can accommodate them: <SHEEP> <ARROW> <PIG> <ARROW> <CATTLE> <ARROW> <HORSE>."
    ],
    cost: {},
    prerequisite: "5 Animals",
    passing: true,
    implemented: true,
    requiresFarmersOfTheMoor: true,
  },
  impl: cardImpl,
})

export const M031_LivestockMarket_impl = M031_LivestockMarket.impl
