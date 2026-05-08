import type { ActionDefinition, PlayerState, Resource } from '../../contract/types'
import { addCardResourceGained } from '../../cards/helpers/card-state'
import { gainConfigByActionId } from '../factories/gain'
import { trackWorkPhaseBuildingResources } from '../../session/work-phase-resources'
import {
  addResourcesFromBoard,
  addResourcesFromCards,
} from '../../session/stats'

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

export const gainAction: ActionDefinition = {
  id: 'gain',
  nameKey: 'actions.gain.name',
  descriptionKey: 'actions.gain.description',
  roundAvailable: 1,
  gainPerRound: {},
  canBeExecutedByPlayer: () => true,
  execute: ({ state, player, space, params, sourceCard }) => {
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
      const target = state.players.find((p) => p.id === recipientPlayerId)
      recipients = target ? [target] : []
    } else {
      recipients = [player]
    }

    if (payerId) {
      const payer = state.players.find((p) => p.id === payerId)
      if (payer) {
        Object.entries(gained).forEach(([key, amount]) => {
          const k = key as keyof Resource
          payer.resources[k] = Math.max(0, payer.resources[k] - amount)
        })
      }
    }

    for (const recipient of recipients) {
      gainResources(recipient, gain)
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

    if (sourceCard) {
      const logKey = recipientMode === 'others'
        ? 'log.cardEffectOtherPlayersGain'
        : 'log.cardEffectGain'
      return {
        type: 'ok' as const,
        resourcesGained: gained,
        logKey,
        logParams: { gain: gained, cardId: sourceCard },
      }
    }
    return { type: 'ok' as const, resourcesGained: gained }
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
  execute: ({ state, player }) => {
    gainResources(player, gain)
    trackWorkPhaseBuildingResources(state, player.id, gain)
    addResourcesFromBoard(player, gain)
    return { type: 'ok' }
  },
})

export const bonusWoodAction = createBonusAction('bonus-wood', { wood: 1 })
export const bonusFoodAction = createBonusAction('bonus-food', { food: 1 })
export const bonusGrainAction = createBonusAction('bonus-grain', { grain: 1 })
