import { defineOccupationCard } from '../card-source'
import type { CardListenerContext, CardListenerRegistration } from '../card-listeners'
import type { ActionHookResult } from '../../actions/hooks'
import type { ActionFlow, Resource } from '../../contract/types'
import { gainLeaf } from '../helpers/pay-gain-node'
import { createPartialTakeFromSpaceLeaf, isPartialTake } from '../helpers/partial-take'
import type { CardImpl } from '../registry'

const CARD_ID = 'D180_PartTimeWorker'

const GOODS = ['wood', 'clay', 'reed', 'stone', 'food', 'grain', 'vegetable', 'sheep', 'boar', 'cattle'] as const
type Good = (typeof GOODS)[number]

const REWARD_BY_GOODS_ON_SPACE: Record<number, { leave: number; gain: Partial<Resource> }> = {
  2: { leave: 1, gain: { sheep: 1 } },
  4: { leave: 2, gain: { boar: 1 } },
  6: { leave: 3, gain: { cattle: 1 } },
}

/** Every way to leave exactly `amount` of the goods on the space. */
const enumerateLeaveMaps = (goods: Partial<Record<Good, number>>, amount: number): Partial<Record<Good, number>>[] => {
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

/** Take everything except the left goods, then get the animal. Left goods never move. */
const takeRestFlow = (
  context: CardListenerContext,
  goods: Partial<Record<Good, number>>,
  leave: Partial<Record<Good, number>>,
  gain: Partial<Resource>,
): ActionFlow => ({
  type: 'seq',
  children: [
    ...GOODS.flatMap(good => {
      const amount = (goods[good] ?? 0) - (leave[good] ?? 0)
      return amount > 0 ? [createPartialTakeFromSpaceLeaf({
        sourceCard: CARD_ID,
        spaceId: context.space.id,
        spaceName: context.space.nameKey,
        resource: good,
        amount,
        includeEffectPreview: true,
        targetSpaceId: context.space.id,
      })] : []
    }),
    gainLeaf(CARD_ID, gain),
  ],
})

const isAccumulationSpace = (context: CardListenerContext): boolean =>
  Object.values(context.space?.gainPerRound ?? {}).some(amount => (amount ?? 0) > 0)

// Each time you use an accumulation space with exactly 2/4/6 goods on it, you can
// leave 1/2/3 goods on it. Decided at the collect step, before anything is taken,
// as an alternative to the collect (D138 Pet Lover model).
const listener: CardListenerRegistration = {
  id: 'D180-part-time-worker-replace-collect',
  cardIds: [CARD_ID],
  phases: ['computeReplace'],
  actions: ['collect'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    // A card's partial take is not a use of the space.
    if (context.actionContext?.checkedReplaceAction || isPartialTake(context.actionContext)) return
    if (!context.space || !isAccumulationSpace(context)) return
    const goods: Partial<Record<Good, number>> = {}
    for (const good of GOODS) {
      const amount = context.space.resources[good] ?? 0
      if (amount > 0) goods[good] = amount
    }
    const reward = REWARD_BY_GOODS_ON_SPACE[Object.values(goods).reduce((total, amount) => total + amount, 0)]
    if (!reward) return
    const branches = enumerateLeaveMaps(goods, reward.leave).map(leave => takeRestFlow(context, goods, leave, reward.gain))
    return {
      decline: true,
      alternativeFlow: branches.length === 1
        ? branches[0]!
        : { type: 'xor', choiceLabelKey: `cards.${CARD_ID}.name`, children: branches },
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
