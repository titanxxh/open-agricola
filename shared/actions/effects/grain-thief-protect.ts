import type { ActionDefinition } from '../../game/types'
import { fieldTopStack } from '../../game/field'
import { readCardExtraData, writeCardExtraData } from '../../cards/helpers/card-state'

const SOURCE_CARD = 'E112_GrainThief'
const PROTECTED_KEY = 'protectedFields'

/**
 * Protect a grain field from reap — remove the top grain stack (so reap skips it)
 * and take 1 grain from supply. After the harvest phase, E112 restores the stack.
 * Requires the TOP stack of the field to be grain.
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
    if (!field) return { type: 'fail', logKey: 'log.actionFail' }
    const top = fieldTopStack(field)
    if (!top || top.kind !== 'grain' || top.remaining <= 0) {
      return { type: 'fail', logKey: 'log.actionFail' }
    }

    // Save original remaining for post-reap restoration (E112 reinserts the stack)
    const protected_ = readCardExtraData<{ index: number; remaining: number }[]>(
      player, SOURCE_CARD, PROTECTED_KEY,
    ) ?? []
    protected_.push({ index: fieldIndex, remaining: top.remaining })
    writeCardExtraData(player, SOURCE_CARD, PROTECTED_KEY, protected_)

    // Pop the top grain stack so reap() skips it
    field.stacks.pop()

    // Give 1 grain from supply
    player.resources.grain += 1

    return {
      type: 'ok',
      resourcesGained: { grain: 1 },
    }
  },
}
