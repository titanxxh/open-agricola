import { defineMinorCard } from '../card-source'
import { animalKeysForState, type AnimalKey } from '../../contract/animals'
import type { ActionFlow, GameState, PlayerState } from '../../contract/types'
import type { CardImpl } from '../registry'

const CARD_ID = 'M101_ButchersBlock'
const FORBIDDEN_ROUNDS = new Set([4, 7, 9, 11, 13, 14])
const FOOD_BY_ANIMAL: Record<AnimalKey, number> = {
  sheep: 1,
  boar: 2,
  cattle: 3,
  horse: 2,
}

const animalTradeFlow = (animal: AnimalKey): ActionFlow => ({
  type: 'leaf',
  actionId: 'exchange',
  sourceCard: CARD_ID,
  actionContext: {
    directTrade: {
      from: { [animal]: 1 },
      to: { food: FOOD_BY_ANIMAL[animal] },
      sourceId: CARD_ID,
    },
  },
  effectPreview: {
    kind: 'resourceExchange',
    resourcesPaid: { [animal]: 1 },
    resourcesGained: { food: FOOD_BY_ANIMAL[animal] },
  },
})

const conversionFlow = (
  state: GameState,
  player: PlayerState,
  optional: boolean,
): ActionFlow | undefined => {
  const children = animalKeysForState(state)
    .filter((animal) => (player.resources[animal] ?? 0) > 0)
    .map(animalTradeFlow)
  if (children.length === 0) return undefined
  return {
    type: 'xor',
    optional,
    promptKey: 'ui.interactionExchangeChoice',
    anytimeWindow: { allowed: true, blockedIds: ['exchange'] },
    sourceCard: CARD_ID,
    children,
  }
}

const cardImpl = {
  prerequisiteCheck: (_player, state) => !FORBIDDEN_ROUNDS.has(state?.round ?? 0),
  effect: {
    id: CARD_ID,
    onBuy: (state, player) => {
      const children: ActionFlow[] = []
      const ownerFlow = conversionFlow(state, player, true)
      if (ownerFlow) children.push(ownerFlow)

      const ownerIndex = state.players.findIndex((candidate) => candidate.id === player.id)
      if (ownerIndex >= 0) {
        for (let offset = 1; offset < state.players.length; offset++) {
          const target = state.players[(ownerIndex + offset) % state.players.length]
          if (!target) continue
          const targetFlow = conversionFlow(state, target, false)
          if (targetFlow) {
            children.push({
              ...targetFlow,
              targetPlayerId: target.id,
            })
          }
        }
      }

      if (children.length === 0) return
      return { type: 'seq', children }
    },
  },
  reaches: [] as readonly string[],
} satisfies CardImpl

export const M101_ButchersBlock = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Butcher's Block",
    deck: "M",
    number: 101,
    category: "FOOD_PROVIDER",
    desc: [
        "You cannot play this card in rounds 4, 7, 9, 11, 13, and 14. All other players must and you can turn any 1 animal into <FOOD>: <SHEEP> <ARROW> 1 <FOOD>, <PIG> <ARROW> 2 <FOOD>, <CATTLE> <ARROW> 3 <FOOD>, <HORSE> <ARROW> 2 <FOOD>."
    ],
    cost: {
        "wood": 1
    },
    vp: 1,
    prerequisite: "see below",
    implemented: true,
    requiresFarmersOfTheMoor: true,
  },
  impl: cardImpl,
})

export const M101_ButchersBlock_impl = M101_ButchersBlock.impl
