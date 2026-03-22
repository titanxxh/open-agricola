import type { ActionDefinition } from '../../game/types'
import { writeCardInfobox } from '../../cards/helpers/card-state'

export const setCardInfoboxAction: ActionDefinition = {
  id: 'set-card-infobox',
  nameKey: 'actions.set-card-infobox.name',
  descriptionKey: 'actions.set-card-infobox.description',
  roundAvailable: 1,
  gainPerRound: {},
  canBeExecutedByPlayer: () => true,
  execute: ({ player, sourceCard, params }) => {
    const text = (params as { text?: string } | undefined)?.text
    if (!sourceCard || typeof text !== 'string') {
      return { type: 'fail', logKey: 'log.exchangeFail' }
    }
    writeCardInfobox(player, sourceCard, text)
    return { type: 'ok' }
  },
}
