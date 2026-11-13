import type { ActionDefinition, ActionFlow, Resource } from '../../contract/types'
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
  const gainFlow = (sourceCard?: string): ActionFlow => ({
    type: 'seq',
    children: [{ type: 'leaf', actionId: 'gain', sourceCard, params: { ...config.gain } }],
  })
  return {
    id: config.id,
    nameKey: config.nameKey,
    descriptionKey: config.descriptionKey,
    roundAvailable: config.roundAvailable,
    gainPerRound: {},
    players: config.players,
    canBeExecutedByPlayer: deriveCanBeExecutedByFlow(),
    // A granted named action may run inside a different space; do not infer its gain from that space.
    execute: ({ sourceCard }) => ({ type: 'flow', flow: gainFlow(sourceCard) }),
    // Full-space expansion keeps the configured-base shape used by replacement listeners.
    flow: { type: 'seq', children: [{ type: 'leaf', actionId: 'gain' }] },
  }
}
