import type { ActionDefinition } from '../../game/types'
import { ensureCardState } from '../../cards/helpers/card-state'

export const writeCardExtraDataAction: ActionDefinition = {
  id: 'write-card-extra-data',
  nameKey: 'actions.write-card-extra-data.name',
  descriptionKey: 'actions.write-card-extra-data.description',
  roundAvailable: 1,
  gainPerRound: {},
  canBeExecutedByPlayer: () => true,
  execute: ({ player, sourceCard, params }) => {
    if (!sourceCard) {
      return { type: 'fail', logKey: 'log.actionFail' }
    }
    const data = (params as { data?: Record<string, unknown> } | undefined)?.data
    if (!data || typeof data !== 'object') {
      return { type: 'fail', logKey: 'log.actionFail' }
    }
    const state = ensureCardState(player, sourceCard)
    state.extraData = { ...(state.extraData ?? {}), ...data }
    return { type: 'ok' }
  },
}
