import type { ActionDefinition, PlayerState, Resource } from '../../game/types'
import { gainConfigByActionId } from '../factories/gain'

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
  execute: ({ player, space, params, sourceCard }) => {
    const gain = params ?? gainConfigByActionId.get(space.id)
    const gained: Record<string, number> = {}
    if (gain) {
      Object.keys(gain).forEach((key) => {
        const amount = gain[key as keyof typeof gain] ?? 0
        if (amount > 0) {
          gained[key] = amount
        }
      })
      gainResources(player, gain)
    }
    if (sourceCard) {
      return {
        type: 'ok' as const,
        resourcesGained: gained,
        logKey: 'log.cardEffectGain',
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
  execute: ({ player }) => {
    gainResources(player, gain)
    return { type: 'ok' }
  },
})

export const bonusWoodAction = createBonusAction('bonus-wood', { wood: 1 })
export const bonusFoodAction = createBonusAction('bonus-food', { food: 1 })
export const bonusGrainAction = createBonusAction('bonus-grain', { grain: 1 })
