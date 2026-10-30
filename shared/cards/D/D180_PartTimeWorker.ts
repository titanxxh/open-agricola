import { defineOccupationCard } from '../card-source'
import type { CardListenerContext, CardListenerRegistration } from '../card-listeners'
import type { ActionHookResult } from '../../actions/hooks'
import type { ActionFlow, Resource } from '../../contract/types'
import { gainLeaf } from '../helpers/pay-gain-node'
import { isPartialTake } from '../helpers/partial-take'
import { sumActionSpaceMovedToTriggerPlayerFromSpace } from '../helpers/event-provenance'
import type { CardImpl } from '../registry'

const CARD_ID = 'D180_PartTimeWorker'

const GOODS = ['wood', 'clay', 'reed', 'stone', 'food', 'grain', 'vegetable', 'sheep', 'boar', 'cattle'] as const
type Good = (typeof GOODS)[number]

const REWARD_BY_COLLECTED_TOTAL: Record<number, { leave: number; gain: Partial<Resource> }> = {
  2: { leave: 1, gain: { sheep: 1 } },
  4: { leave: 2, gain: { boar: 1 } },
  6: { leave: 3, gain: { cattle: 1 } },
}

const enumerateReturnMaps = (goods: Partial<Record<Good, number>>, amount: number): Partial<Record<Good, number>>[] => {
  const keys = GOODS.filter(good => (goods[good] ?? 0) > 0)
  const out: Partial<Record<Good, number>>[] = []
  const walk = (index: number, remaining: number, current: Partial<Record<Good, number>>) => {
    if (index === keys.length) {
      if (remaining === 0) out.push({ ...current })
      return
    }
    const key = keys[index]!
    for (let count = 0; count <= Math.min(goods[key] ?? 0, remaining); count += 1) {
      walk(index + 1, remaining - count, count > 0 ? { ...current, [key]: count } : current)
    }
  }
  walk(0, amount, {})
  return out
}

const returnThenGainFlow = (
  spaceId: string,
  returned: Partial<Resource>,
  gain: Partial<Resource>,
): ActionFlow => ({
  type: 'seq',
  children: [
    {
      type: 'leaf',
      actionId: 'return-to-space',
      params: returned,
      actionContext: { targetSpaceId: spaceId },
      sourceCard: CARD_ID,
    },
    gainLeaf(CARD_ID, gain),
  ],
})

const isAccumulationSpace = (context: CardListenerContext): boolean =>
  Object.values(context.space?.gainPerRound ?? {}).some(amount => (amount ?? 0) > 0)

const listener: CardListenerRegistration = {
  id: 'D180-part-time-worker-after-collect',
  cardIds: [CARD_ID],
  phases: ['after'],
  actions: ['collect'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (isPartialTake(context.actionContext)) return
    if (!context.space || !isAccumulationSpace(context)) return
    const goods: Partial<Record<Good, number>> = {}
    for (const good of GOODS) {
      const amount = sumActionSpaceMovedToTriggerPlayerFromSpace(context, good)
      if (amount > 0) goods[good] = amount
    }
    const reward = REWARD_BY_COLLECTED_TOTAL[Object.values(goods).reduce((total, amount) => total + amount, 0)]
    if (!reward) return
    const returnable: Partial<Record<Good, number>> = {}
    for (const good of GOODS) returnable[good] = Math.min(goods[good] ?? 0, context.player.resources[good] ?? 0)
    const branches = enumerateReturnMaps(returnable, reward.leave)
      .map(returned => returnThenGainFlow(context.space.id, returned, reward.gain))
    if (branches.length === 0) return
    return {
      flow: branches.length === 1
        ? { ...branches[0]!, optional: true }
        : { type: 'xor', optional: true, choiceLabelKey: `cards.${CARD_ID}.name`, children: branches },
      sourceCard: CARD_ID,
    }
  },
}

const cardImpl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl

export const D180_PartTimeWorker = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: 'Part-Time Worker',
    deck: 'D',
    number: 180,
    category: 'LIVESTOCK_PROVIDER',
    desc: ['Each time you use an accumulation space with exactly 2/4/6 goods on it, you can leave 1/2/3 goods on the space. If you do, you get 1 <SHEEP>/<PIG>/<CATTLE>.'],
    cost: {},
    players: '5+',
  },
  impl: cardImpl,
})

export const D180_PartTimeWorker_impl = D180_PartTimeWorker.impl
