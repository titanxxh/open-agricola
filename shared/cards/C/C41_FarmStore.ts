import type { ActionFlow } from '../../contract/types'
import type { Resource } from '../../contract/types'
import type { CardImpl } from '../registry'
import { C41_FarmStore } from '../../cards-display/C/C41_FarmStore'

const CARD_ID = C41_FarmStore.id

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

export const C41_FarmStore_impl = {
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
