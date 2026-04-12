import type { ActionDefinition } from '../../game/types'
import { readCardExtraData, writeCardExtraData } from '../../cards/helpers/card-state'

const SOURCE_CARD = 'E112_GrainThief'
const PROTECTED_KEY = 'protectedFields'

/**
 * Protect a grain field from reap — leave grain on field, take 1 grain from supply.
 * Used by E112_GrainThief. Takes { fieldIndex } in params.
 */
export const grainThiefProtectAction: ActionDefinition = {
  id: 'grain-thief-protect',
  nameKey: 'actions.grain-thief-protect.name',
  descriptionKey: 'actions.grain-thief-protect.description',
  roundAvailable: 1,
  gainPerRound: {},
  canBeExecutedByPlayer: () => true,
  execute: ({ player, params }) => {
    const fieldIndex = params?.fieldIndex as number | undefined
    if (fieldIndex === undefined) return { type: 'fail', logKey: 'log.actionFail' }
    const field = player.fields[fieldIndex]
    if (!field || field.crop !== 'grain' || field.remaining <= 0) {
      return { type: 'fail', logKey: 'log.actionFail' }
    }

    // Save original state for post-reap restoration
    const protected_ = readCardExtraData<{ index: number; remaining: number }[]>(
      player, SOURCE_CARD, PROTECTED_KEY,
    ) ?? []
    protected_.push({ index: fieldIndex, remaining: field.remaining })
    writeCardExtraData(player, SOURCE_CARD, PROTECTED_KEY, protected_)

    // Zero out field so reap() skips it
    field.remaining = 0
    field.crop = null

    // Give 1 grain from supply
    player.resources.grain += 1

    return {
      type: 'ok',
      resourcesGained: { grain: 1 },
    }
  },
}
