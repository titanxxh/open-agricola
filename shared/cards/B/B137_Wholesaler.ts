import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import type { ActionFlow } from '../../contract/types'
import { readCardExtraData, writeCardExtraData } from '../helpers/card-state'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'
import { B137_Wholesaler } from '../../cards-display/B/B137_Wholesaler'

const CARD_ID = B137_Wholesaler.id

type WholesalerData = {
  vegetableTaken: boolean
  boarTaken: boolean
  stoneTaken: boolean
  cattleTaken: boolean
}

type WholesalerReward = {
  listenerId: string
  spaceId: string
  takenKey: keyof WholesalerData
  reward: Parameters<typeof gainLeaf>[1]
}

const INITIAL_DATA: WholesalerData = {
  vegetableTaken: false,
  boarTaken: false,
  stoneTaken: false,
  cattleTaken: false,
}

const getData = (context: CardListenerContext): WholesalerData =>
  readCardExtraData<WholesalerData>(context.player, CARD_ID, 'wholesaler') ?? { ...INITIAL_DATA }

const setWholesalerDataLeaf = (value: WholesalerData): ActionFlow => ({
  type: 'leaf',
  actionId: 'special-effect',
  sourceCard: CARD_ID,
  params: { kind: 'set-extra-data', key: 'wholesaler', value },
})

const takeRewardFlow = (value: WholesalerData, reward: Parameters<typeof gainLeaf>[1]): ActionFlow => ({
  type: 'seq',
  children: [
    setWholesalerDataLeaf(value),
    gainLeaf(CARD_ID, reward),
  ],
})

export const SPACE_REWARDS = [
  { listenerId: 'B137-wholesaler-after-vegetable-seeds', spaceId: 'vegetable-seeds', takenKey: 'vegetableTaken', reward: { vegetable: 1 } },
  { listenerId: 'B137-wholesaler-after-pig-market', spaceId: 'pig-market', takenKey: 'boarTaken', reward: { boar: 1 } },
  { listenerId: 'B137-wholesaler-after-eastern-quarry', spaceId: 'eastern-quarry', takenKey: 'stoneTaken', reward: { stone: 1 } },
  { listenerId: 'B137-wholesaler-after-cattle-market', spaceId: 'cattle-market', takenKey: 'cattleTaken', reward: { cattle: 1 } },
] as const satisfies readonly WholesalerReward[]

const createSpaceRewardListener = (
  { listenerId, spaceId, takenKey, reward }: WholesalerReward,
): CardListenerRegistration => ({
  id: listenerId,
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['place-farmer'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.space?.id !== spaceId) return
    const data = getData(context)
    if (data[takenKey]) return
    const nextData: WholesalerData = { ...data, [takenKey]: true }
    return {
      flow: takeRewardFlow(nextData, reward),
      sourceCard: CARD_ID,
    }
  },
})

export const B137_Wholesaler_impl = {
  listeners: SPACE_REWARDS.map(createSpaceRewardListener),
  effect: {
    id: CARD_ID,
    onBuy: (_state, player) => {
      writeCardExtraData(player, CARD_ID, 'wholesaler', { ...INITIAL_DATA })
    },
  },
  reaches: [] as readonly string[],
} satisfies CardImpl
