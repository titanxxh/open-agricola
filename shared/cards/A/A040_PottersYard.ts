import { defineMinorCard } from '../card-source'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf, payLeaf } from '../helpers/pay-gain-node'
import { writeCardExtraData, readCardExtraData } from '../helpers/card-state'
import { countUnusedFarmyardSpaces } from '../../domain/farm'
import type { ActionFlow } from '../../contract/types'
import type { CardImpl } from '../registry'
import { getActionNewlyUsedTiles } from '../helpers/farmyard-events'

const CARD_ID = 'A040_PottersYard'
const getClayRemaining = (player: CardListenerContext['player']): number =>
  readCardExtraData<number>(player, CARD_ID, 'clayRemaining') ?? 0

const setClayRemaining = (player: CardListenerContext['player'], count: number) =>
  writeCardExtraData(player, CARD_ID, 'clayRemaining', Math.max(0, count))

const setExtraDataLeaf = (key: string, value: unknown): ActionFlow => ({
  type: 'leaf',
  actionId: 'special-effect',
  sourceCard: CARD_ID,
  params: { kind: 'set-extra-data', key, value },
})

const buildClayCollectFlow = (clayCollected: number): ActionFlow | undefined => {
  if (clayCollected <= 0) return
  const children: ActionFlow[] = [
    gainLeaf(CARD_ID, { clay: clayCollected }),
  ]
  // Offer exchange: clay → 2 food per clay
  // The reference offers XOR of (exchange i clay for 2i food) for i from clayCollected down to 1
  const exchangeChoices: ActionFlow[] = []
  for (let i = clayCollected; i > 0; i--) {
    exchangeChoices.push({
      type: 'seq',
      children: [
        payLeaf({ cardId: CARD_ID, cost: { clay: i } }),
        gainLeaf(CARD_ID, { food: 2 * i }),
      ],
    })
  }
  children.push({
    type: 'xor',
    optional: true,
    children: exchangeChoices,
  })
  return { type: 'seq', children }
}

const createAfterHandler = (actionName: string): CardListenerRegistration => ({
  id: `A40-potters-yard-after-${actionName}`,
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: [actionName],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const clayRemaining = getClayRemaining(context.player)
    if (clayRemaining <= 0) return
    const newlyUsed = getActionNewlyUsedTiles(context).length
    if (newlyUsed <= 0) return
    const clayCollected = Math.min(newlyUsed, clayRemaining)
    const collect = buildClayCollectFlow(clayCollected)
    if (!collect) return
    return {
      flow: {
        type: 'seq',
        children: [
          setExtraDataLeaf('clayRemaining', clayRemaining - clayCollected),
          collect,
        ],
      },
      sourceCard: CARD_ID,
    }
  },
})

const cardImpl = {
  listeners: [createAfterHandler('plow'), createAfterHandler('construct'), createAfterHandler('fence'), createAfterHandler('stables')],
  effect: {
    id: CARD_ID,
    onBuy: (_state, player) => {
      const freeCount = countUnusedFarmyardSpaces(player)
      setClayRemaining(player, freeCount)
    },
  },
  prerequisiteCheck: (player) => countUnusedFarmyardSpaces(player) <= 7,
  reaches: [] as readonly string[],
} satisfies CardImpl

export const A040_PottersYard = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Potter's Yard",
    deck: 'A',
    number: 40,
    category: 'GOODS_PROVIDER',
    desc: ["Immediately place 1 <CLAY> on each unused space in your farmyard. Each time you turn a space into a used space, you get the <CLAY> and you can immediately exchange it for 2 <FOOD>."],
    cost: { wood: 1, reed: 1 },
    prerequisite: 'At Most 7 Unused Farmyard Spaces',
    evenMoreSet: true,
    waresSalesmanGains: [{ clay: 1, reed: 1 }],
  },
  impl: cardImpl,
})

export const A040_PottersYard_impl = A040_PottersYard.impl
