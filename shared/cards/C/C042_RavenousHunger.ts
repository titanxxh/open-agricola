import { defineMinorCard } from '../card-source'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { computeAllowedPlacementSpaces } from '../../actions/helpers/placement-availability'
import { gainLeaf } from '../helpers/pay-gain-node'
import { isCardFlagged } from '../helpers/card-state'
import type { ActionFlow, ActionSpace, Resource } from '../../contract/types'
import { workersAvailable } from '../../domain/player'
import type { CardImpl } from '../registry'

const CARD_ID = 'C042_RavenousHunger'
const accumulationSpaceIds = (context: CardListenerContext) =>
  computeAllowedPlacementSpaces(context.state, context.player, { sourceCard: CARD_ID })
    .map((placement) => context.state.actionSpaces.find((space) => space.id === placement.spaceId))
    .filter((space): space is ActionSpace =>
      !!space && Object.values(space.gainPerRound).some((amount) => (amount ?? 0) > 0),
    )
    .map((space) => space.id)

const collectedSpaceId = (context: CardListenerContext) => {
  const events = [...(context.actionEvents ?? []), ...(context.transactionEvents ?? [])]
  for (const event of events) {
    const entry = event as { type?: string; reason?: string; from?: { kind?: string; spaceId?: string } }
    if (entry.type === 'resource.moved' && entry.reason === 'collect' && entry.from?.kind === 'actionSpace') {
      return entry.from.spaceId
    }
  }
  return undefined
}

const afterPlaceFarmerListener: CardListenerRegistration = {
  id: 'C42-ravenous-hunger-after-place-farmer',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['place-farmer'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.space?.id !== 'vegetable-seeds') return
    if (workersAvailable(context.state, context.player) <= 0) return
    const constraints = accumulationSpaceIds(context)
    if (constraints.length === 0) return

    return {
      flow: {
        type: 'seq',
        optional: true,
        children: [
          { type: 'leaf', actionId: 'special-effect', sourceCard: CARD_ID, params: { kind: 'set-flag', flag: true } },
          {
            type: 'leaf',
            actionId: 'place-farmer',
            sourceCard: CARD_ID,
            actionContext: { constraints },
          },
        ],
      } as ActionFlow,
      sourceCard: CARD_ID,
    }
  },
}

const afterCollectListener: CardListenerRegistration = {
  id: 'C42-ravenous-hunger-after-collect',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['collect'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!isCardFlagged(context.player, CARD_ID)) return

    const targetSpaceId = context.actionContext?.targetSpaceId as string | undefined
    const spaceId = targetSpaceId ?? collectedSpaceId(context)
    const targetSpace = spaceId
      ? context.state.actionSpaces.find((space) => space.id === spaceId)
      : undefined
    const gainPerRound = (targetSpace ?? context.space)?.gainPerRound
    if (!gainPerRound) return

    const gain: Partial<Resource> = {}
    for (const [key, value] of Object.entries(gainPerRound)) {
      if ((value ?? 0) > 0) {
        gain[key as keyof Resource] = 1
      }
    }
    const unflag: Extract<ActionFlow, { type: 'leaf' }> = {
      type: 'leaf',
      actionId: 'special-effect',
      sourceCard: CARD_ID,
      params: { kind: 'set-flag', flag: false },
    }
    if (Object.keys(gain).length === 0) return { flow: unflag, sourceCard: CARD_ID }
    return {
      flow: {
        type: 'seq',
        children: [gainLeaf(CARD_ID, gain), unflag],
      },
      sourceCard: CARD_ID,
    }
  },
}

const cardImpl = {
  listeners: [afterPlaceFarmerListener, afterCollectListener],
  reaches: [] as readonly string[],
} satisfies CardImpl

export const C042_RavenousHunger = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: 'Ravenous Hunger',
    deck: 'C',
    number: 42,
    category: 'GOODS_PROVIDER',
    desc: [
        'Immediately after each time you use the __Vegetable Seeds__ action space, you can place another person on an accumulation space and get 1 additional good of the accumulating type.',
      ],
    cost: { grain: 1 },
    players: '1+',
  },
  impl: cardImpl,
})

export const C042_RavenousHunger_impl = C042_RavenousHunger.impl
