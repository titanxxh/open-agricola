import { InvalidActionContextError } from './action-context-error.ts'
import type { ActionChoiceOption } from './types.ts'

/** A public choice is identified only by its value, including after merging. */
export function assertDistinctChoiceOptionValues(options: readonly Pick<ActionChoiceOption, 'value'>[]): void {
  const values = new Set<string>()
  for (const option of options) {
    if (values.has(option.value)) throw new InvalidActionContextError('Choice option values must be distinct')
    values.add(option.value)
  }
}
