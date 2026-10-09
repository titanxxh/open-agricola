import type { ActionChoiceOption, FarmTilePosition } from '../../shared/contract/types'
import { positionKey } from '../../shared/domain/farm'

/** Bind server-declared targets; legality and opaque choice values stay server-owned. */
export const buildFarmTargetChoiceBindings = (options: readonly ActionChoiceOption[], playerId: string | undefined): Map<string, ActionChoiceOption[]> => {
  const bindings = new Map<string, ActionChoiceOption[]>()
  for (const option of options) {
    if (!playerId || option.disabled || option.target?.playerId !== playerId) continue
    for (const position of option.target.positions) {
      const key = positionKey(position)
      const choices = bindings.get(key) ?? []
      if (!choices.some((choice) => choice.value === option.value)) choices.push(option)
      bindings.set(key, choices)
    }
  }
  return bindings
}

export const getFarmTargetChoices = (bindings: ReadonlyMap<string, ActionChoiceOption[]>, tile: FarmTilePosition): ActionChoiceOption[] =>
  bindings.get(positionKey(tile)) ?? []
