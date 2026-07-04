import { defineOccupationCard } from '../card-source'
import type { CardListenerContext, CardListenerRegistration } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import type { DraftGameEvent, ResourceMovedEvent } from '../../contract/events'
import type { ActionFlow, Resource } from '../../contract/types'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'D180_PartTimeWorker'

const RESOURCE_KEYS = ['wood', 'clay', 'reed', 'stone', 'food', 'grain', 'vegetable', 'sheep', 'boar', 'cattle'] as const

const REWARD_BY_COLLECTED_TOTAL: Record<number, { leave: number; gain: Partial<Resource> }> = {
  2: { leave: 1, gain: { sheep: 1 } },
  4: { leave: 2, gain: { boar: 1 } },
  6: { leave: 3, gain: { cattle: 1 } },
}

type QueryableResourceMovedEvent = ResourceMovedEvent | DraftGameEvent<'resource.moved'>

const isResourceMovedEvent = (
  event: CardListenerContext['transactionEvents'][number],
): event is QueryableResourceMovedEvent =>
  event.type === 'resource.moved'

const isAccumulationSpace = (context: CardListenerContext, spaceId: string): boolean => {
  const space = context.state.actionSpaces.find((candidate) => candidate.id === spaceId)
  return Object.values(space?.gainPerRound ?? {}).some((amount) => (amount ?? 0) > 0)
}

const addResource = (resources: Partial<Resource>, resource: keyof Resource, amount: number) => {
  if (amount <= 0) return
  resources[resource] = (resources[resource] ?? 0) + amount
}

const collectSourceSpaceId = (context: CardListenerContext): string | undefined => {
  const playerId = (context.triggerPlayer ?? context.player).id
  for (const event of context.actionEvents ?? context.transactionEvents) {
    if (!isResourceMovedEvent(event)) continue
    if (event.reason !== 'collect') continue
    if (event.from.kind !== 'actionSpace') continue
    if (event.to.kind !== 'player' || event.to.playerId !== playerId) continue
    return event.from.spaceId
  }
}

const collectedFromSpace = (context: CardListenerContext, spaceId: string): Partial<Resource> => {
  const playerId = (context.triggerPlayer ?? context.player).id
  const out: Partial<Resource> = {}
  for (const event of context.actionEvents ?? context.transactionEvents) {
    if (!isResourceMovedEvent(event)) continue
    if (event.reason !== 'collect') continue
    if (event.from.kind !== 'actionSpace' || event.from.spaceId !== spaceId) continue
    if (event.to.kind !== 'player' || event.to.playerId !== playerId) continue
    for (const resource of RESOURCE_KEYS) {
      addResource(out, resource, event.resources[resource] ?? 0)
    }
  }
  return out
}

const totalResources = (resources: Partial<Resource>): number =>
  RESOURCE_KEYS.reduce((total, resource) => total + (resources[resource] ?? 0), 0)

const positiveResourceKeys = (resources: Partial<Resource>): (typeof RESOURCE_KEYS)[number][] =>
  RESOURCE_KEYS.filter((resource) => (resources[resource] ?? 0) > 0)

const enumerateReturnMaps = (
  resources: Partial<Resource>,
  amount: number,
): Partial<Resource>[] => {
  const keys = positiveResourceKeys(resources)
  const out: Partial<Resource>[] = []
  const walk = (index: number, remaining: number, current: Partial<Resource>) => {
    if (index === keys.length) {
      if (remaining === 0) out.push({ ...current })
      return
    }
    const key = keys[index]!
    const max = Math.min(resources[key] ?? 0, remaining)
    for (let count = 0; count <= max; count += 1) {
      if (count > 0) current[key] = count
      else delete current[key]
      walk(index + 1, remaining - count, current)
    }
    delete current[key]
  }
  walk(0, amount, {})
  return out
}

const returnThenGainActionFlow = (
  cost: Partial<Resource>,
  gain: Partial<Resource>,
  targetSpaceId: string,
): ActionFlow => ({
  type: 'seq',
  children: [
    {
      type: 'leaf',
      actionId: 'return-to-space',
      params: cost,
      sourceCard: CARD_ID,
      actionContext: { targetSpaceId },
    },
    gainLeaf(CARD_ID, gain),
  ],
})

const listener: CardListenerRegistration = {
  id: 'D180-part-time-worker-after-collect',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['collect'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const targetSpaceId = collectSourceSpaceId(context)
    if (!targetSpaceId) return
    if (!isAccumulationSpace(context, targetSpaceId)) return
    const collected = collectedFromSpace(context, targetSpaceId)
    const reward = REWARD_BY_COLLECTED_TOTAL[totalResources(collected)]
    if (!reward) return
    const returnMaps = enumerateReturnMaps(collected, reward.leave)
    if (returnMaps.length === 0) return
    if (returnMaps.length === 1) {
      return {
        flow: {
          ...returnThenGainActionFlow(returnMaps[0]!, reward.gain, targetSpaceId),
          optional: true,
        },
        sourceCard: CARD_ID,
      }
    }
    return {
      flow: {
        type: 'xor',
        optional: true,
        children: returnMaps.map((cost) => returnThenGainActionFlow(cost, reward.gain, targetSpaceId)),
      },
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
    desc: ['Each time you use an accumulation space with exactly 2/4/6 goods on it, you can leave 1/2/3 goods on the space. If you do, you get 1 <SHEEP>/<<PIG>>/<CATTLE>.'],
    cost: {},
    players: '5+',
  },
  impl: cardImpl,
})

export const D180_PartTimeWorker_impl = D180_PartTimeWorker.impl
