import type { ActionDefinition, PlayerState, Resource } from '../../contract/types'
import type { EventSink, ResourceLocation } from '../../contract/events'
import { addCardResourceGained } from '../../cards/helpers/card-state'
import { gainConfigByActionId } from '../factories/gain'
import { trackWorkPhaseBuildingResources } from '../../session/work-phase-resources'
import {
  addResourcesFromBoard,
  addResourcesFromCards,
} from '../../session/stats'
import { findPlayerById } from '../../domain/player'

export const gainResources = (
  player: PlayerState,
  resources: Partial<Resource>,
) => {
  Object.keys(resources).forEach((key) => {
    const resourceKey = key as keyof Resource
    const amount = resources[resourceKey] ?? 0
    if (amount > 0) {
      player.resources[resourceKey] += amount
    }
  })
}

const positiveResources = (resources: Partial<Resource>): Partial<Resource> => {
  const out: Partial<Resource> = {}
  Object.entries(resources).forEach(([key, value]) => {
    if (typeof value !== 'number' || value <= 0) return
    out[key as keyof Resource] = value
  })
  return out
}

const emitGainEvent = (
  eventSink: EventSink | undefined,
  recipient: PlayerState,
  resources: Partial<Resource>,
  sourceCard?: string,
  actorPlayerId?: string,
  payer?: { playerId: string; resources: Partial<Resource> },
  sourceLocation?: ResourceLocation,
) => {
  const gained = positiveResources(resources)
  const paid = payer ? positiveResources(payer.resources) : {}
  const usePayer = payer !== undefined && Object.keys(paid).length > 0
  const eventResources = usePayer ? paid : gained
  if (Object.keys(eventResources).length === 0) return
  eventSink?.emit<'resource.moved'>({
    type: 'resource.moved',
    resources: eventResources,
    from: usePayer
      ? { kind: 'player', playerId: payer.playerId }
      : sourceLocation
      ? sourceLocation
      : sourceCard
      ? { kind: 'card', playerId: actorPlayerId, cardId: sourceCard }
      : { kind: 'supply' },
    to: { kind: 'player', playerId: recipient.id },
    reason: sourceCard ? 'cardEffect' : 'gain',
    ...(sourceCard ? { sourceCardId: sourceCard } : {}),
  })
}

export const gainAction: ActionDefinition = {
  id: 'gain',
  nameKey: 'actions.gain.name',
  descriptionKey: 'actions.gain.description',
  roundAvailable: 1,
  gainPerRound: {},
  canBeExecutedByPlayer: () => true,
  execute: ({ state, player, space, params, sourceCard, actionContext, eventSink }) => {
    const {
      recipientPlayerId,
      recipientMode,
      payerId,
      ...rawGain
    } = (params ?? {}) as {
      recipientPlayerId?: string
      recipientMode?: 'self' | 'others'
      payerId?: string
    } & Partial<Resource>

    const gain = (Object.keys(rawGain).length > 0
      ? rawGain
      : gainConfigByActionId.get(space.id)) as Partial<Resource> | undefined
    if (!gain) {
      return { type: 'ok' as const, resourcesGained: {} }
    }

    const gained: Record<string, number> = {}
    Object.keys(gain).forEach((key) => {
      const amount = gain[key as keyof typeof gain] ?? 0
      if (amount > 0) {
        gained[key] = amount
      }
    })

    let recipients: PlayerState[]
    if (recipientMode === 'others') {
      recipients = state.players.filter((entry) => entry.id !== player.id)
    } else if (recipientPlayerId) {
      const target = findPlayerById(state, recipientPlayerId)
      recipients = target ? [target] : []
    } else {
      recipients = [player]
    }

    const paid: Partial<Resource> = {}
    if (payerId) {
      const payer = findPlayerById(state, payerId)
      if (payer) {
        Object.entries(gained).forEach(([key, amount]) => {
          const k = key as keyof Resource
          const before = payer.resources[k] ?? 0
          const paidAmount = Math.min(before, amount)
          if (paidAmount > 0) {
            paid[k] = (paid[k] ?? 0) + paidAmount
          }
          payer.resources[k] = Math.max(0, before - amount)
        })
      }
    }

    for (const recipient of recipients) {
      gainResources(recipient, gain)
      emitGainEvent(
        eventSink,
        recipient,
        gained,
        sourceCard,
        player.id,
        payerId ? { playerId: payerId, resources: paid } : undefined,
        actionContext?.sourceLocation as ResourceLocation | undefined,
      )
      if (recipient.id === player.id) {
        trackWorkPhaseBuildingResources(state, recipient.id, gained)
      }
      if (sourceCard) {
        addResourcesFromCards(recipient, gained)
      } else if (recipient.id === player.id) {
        addResourcesFromBoard(recipient, gained)
      }
    }

    if (sourceCard && recipients.length > 0) {
      const totalGain = Object.fromEntries(
        Object.entries(gained).map(([k, v]) => [k, v * recipients.length]),
      ) as Partial<Resource>
      addCardResourceGained(player, sourceCard, totalGain)
    }

    const extraData: Record<string, unknown> = {}
    if (payerId && Object.values(paid).some((amount) => (amount ?? 0) > 0)) {
      extraData.actionDetailDeltas = [{ playerId: payerId, costs: paid }]
    }

    return {
      type: 'ok' as const,
      resourcesGained: gained,
      ...(Object.keys(extraData).length > 0 ? { extraData } : {}),
    }
  },
}

const createBonusAction = (
  id: string,
  gain: { wood?: number; food?: number; grain?: number },
): ActionDefinition => ({
  id,
  nameKey: `actions.${id}.name`,
  descriptionKey: `actions.${id}.description`,
  roundAvailable: 1,
  gainPerRound: {},
  canBeExecutedByPlayer: () => true,
  execute: ({ state, player, eventSink }) => {
    gainResources(player, gain)
    trackWorkPhaseBuildingResources(state, player.id, gain)
    addResourcesFromBoard(player, gain)
    emitGainEvent(eventSink, player, gain)
    return { type: 'ok', resourcesGained: gain }
  },
})

export const bonusWoodAction = createBonusAction('bonus-wood', { wood: 1 })
export const bonusFoodAction = createBonusAction('bonus-food', { food: 1 })
export const bonusGrainAction = createBonusAction('bonus-grain', { grain: 1 })
