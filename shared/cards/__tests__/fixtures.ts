/**
 * Test fixture factories for common types that tests construct as partials.
 *
 * Each factory fills in the required-but-irrelevant fields so tests only
 * have to specify what they actually care about. Using these removes the
 * `{ id: 'foo' } as any` / `{} as any` pattern that litters test files.
 */
import type { ActionSpace } from '../../contract/types'

/**
 * Minimal `ActionSpace` stub keyed by id — nameKey/descriptionKey mirror the
 * id, all optional fields default to no-ops, and resources/takenBy start empty.
 * Callers can override any field via the `partial` argument.
 */
export function mkActionSpace(partial: { id: string } & Partial<ActionSpace>): ActionSpace {
  return {
    id: partial.id,
    nameKey: partial.id,
    descriptionKey: partial.id,
    roundAvailable: 1,
    gainPerRound: {},
    canBeExecutedByPlayer: () => true,
    execute: () => ({ type: 'ok' }),
    resources: {},
    takenBy: [],
    ...partial,
  }
}
