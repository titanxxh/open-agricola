import { defineOccupationCard } from '../card-source'
import { futureMeeplesNode } from '../../actions/effects/internal/future-meeples'
import { readCardExtraData, writeCardExtraData } from '../helpers/card-state'
import { getAvailableStableSupplyCount } from '../../domain/supply-tokens'
import type { ActionFlow } from '../../contract/types'
import type { CardImpl } from '../registry'

const CARD_ID = 'A89_StablePlanner'
const TARGET_ROUNDS_KEY = 'targetRounds'

const targetPrefixes = (round: number, reserve: number): number[][] => {
  const targets = [3, 6, 9]
    .map((offset) => round + offset)
    .filter((targetRound) => targetRound <= 14)
  const maxCount = Math.min(targets.length, reserve)
  return Array.from({ length: maxCount }, (_, index) => targets.slice(0, index + 1))
}

const selectTargetsFlow = (playerId: string, targets: number[]): ActionFlow => ({
  type: 'seq',
  choiceLabelKey: 'cards.A89_StablePlanner.name',
  children: [
    {
      type: 'leaf',
      actionId: 'special-effect',
      sourceCard: CARD_ID,
      params: { kind: 'set-extra-data', key: TARGET_ROUNDS_KEY, value: targets },
    },
    futureMeeplesNode({
      cardId: CARD_ID,
      playerId,
      entries: targets.map((round) => ({ round, resources: { stable: 1 } })),
    }),
  ],
})

const cardImpl = {
  effect: {
    id: CARD_ID,
    onBuy: (state, player) => {
      const choices = targetPrefixes(state.round, getAvailableStableSupplyCount(state, player))
      if (choices.length === 0) return
      return {
        type: 'xor',
        optional: true,
        children: choices.map((targets) => selectTargetsFlow(player.id, targets)),
      } as ActionFlow
    },
    onRoundStart: (state, player) => {
      const targets = readCardExtraData<number[]>(player, CARD_ID, TARGET_ROUNDS_KEY)
      if (!targets || !targets.includes(state.round)) return
      writeCardExtraData(player, CARD_ID, TARGET_ROUNDS_KEY, targets.filter((round) => round !== state.round))
      return {
        type: 'seq',
        optional: true,
        children: [
          {
            type: 'leaf',
            actionId: 'stables',
            sourceCard: CARD_ID,
            actionContext: { max: 1, exactCost: { max: 1 }, trueAction: false },
          },
        ],
      } as ActionFlow
    },
  },
  reaches: [] as readonly string[],
} satisfies CardImpl

export const A89_StablePlanner = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: 'Stable Planner',
    deck: 'A',
    number: 89,
    category: 'FARM_PLANNER',
    desc: ['Add 3, 6, and 9 to the current round. You can place 1 stable on each corresponding round space. At the start of these rounds (not earlier), you can build the stable at no cost.'],
    cost: {},
    players: '1+',
  },
  impl: cardImpl,
})

export const A89_StablePlanner_impl = A89_StablePlanner.impl
