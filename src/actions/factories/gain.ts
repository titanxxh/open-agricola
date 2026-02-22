import { gainResources } from '../effects/gain'
import type { ActionDefinition, Resource } from '../../game/types'

type GainActionConfig = {
  id: string
  nameKey: string
  descriptionKey: string
  roundAvailable: number
  gain: Partial<Resource>
  players?: number[]
}

export const createGainAction = (
  config: GainActionConfig,
): ActionDefinition => ({
  id: config.id,
  nameKey: config.nameKey,
  descriptionKey: config.descriptionKey,
  roundAvailable: config.roundAvailable,
  gainPerRound: {},
  players: config.players,
  canBeExecutedByPlayer: () => true,
  execute: ({ player }) => {
    gainResources(player, config.gain)
    return { type: 'ok' }
  },
})
