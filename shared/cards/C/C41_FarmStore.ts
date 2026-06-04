import { defineMinorCard } from '../card-source'
import type { ActionFlow } from '../../contract/types'
import type { Resource } from '../../contract/types'
import type { CardImpl } from '../registry'

const CARD_ID = 'C41_FarmStore'
type ResourceMap = Partial<Resource>

export const REWARD_OPTIONS = [
  { vegetable: 1 },
  { wood: 1, clay: 1 },
  { wood: 1, stone: 1 },
  { wood: 1, reed: 1 },
  { clay: 1, stone: 1 },
  { clay: 1, reed: 1 },
  { stone: 1, reed: 1 },
] as const satisfies readonly ResourceMap[]

const payGainFlow = (reward: ResourceMap): ActionFlow => ({
  type: 'seq',
  children: [
    { type: 'leaf', actionId: 'pay', params: { food: 1 }, sourceCard: CARD_ID },
    { type: 'leaf', actionId: 'gain', params: reward, sourceCard: CARD_ID },
  ],
})

const cardImpl = {
  effect: {
    id: CARD_ID,
    onEndHarvestFeedingPhase: (_state, player) => {
      if (player.resources.food < 1) return

      return {
        type: 'xor',
        optional: true,
        children: REWARD_OPTIONS.map(payGainFlow),
      }
    },
  },
  reaches: [] as readonly string[],
} satisfies CardImpl

export const C41_FarmStore = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Farm Store",
    deck: "C",
    number: 41,
    category: "GOODS_PROVIDER",
    desc: ["After the feeding phase of each harvest, you can exchange exactly 1 <FOOD> for 2 different building resources of your choice or 1 <VEGETABLE>."],
    cost: { wood: 2, clay: 2 },
  },
  impl: cardImpl,
})

export const C41_FarmStore_impl = C41_FarmStore.impl
