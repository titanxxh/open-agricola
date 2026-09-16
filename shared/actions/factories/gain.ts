import { gainResources } from '../effects/gain'
import type { ActionDefinition, Resource } from '../../contract/types'
import { deriveCanBeExecutedByFlow } from '../flow'

type GainActionConfig = {
  id: string
  nameKey: string
  descriptionKey: string
  roundAvailable: number
  gain: Partial<Resource>
  players?: number[]
}

import { gainConfigByActionId } from '../gain-config'

export const createGainAction = (config: GainActionConfig): ActionDefinition => {
  gainConfigByActionId.set(config.id, config.gain)
  return {
    id: config.id,
    nameKey: config.nameKey,
    descriptionKey: config.descriptionKey,
    roundAvailable: config.roundAvailable,
    gainPerRound: {},
    players: config.players,
    canBeExecutedByPlayer: deriveCanBeExecutedByFlow(),
    execute: ({ player }) => {
      gainResources(player, config.gain)
      return { type: 'ok' }
    },
    flow: {
      type: 'seq',
      children: [{ type: 'leaf', actionId: 'gain' }],
    },
  }
}
