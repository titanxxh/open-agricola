import type { ActionDefinition } from '../../game/types'
import {
  setCardFlag,
  writeCardInfobox,
  readCardExtraData,
  writeCardExtraData,
} from '../../cards/helpers/card-state'

export type SpecialEffectParams =
  | { kind: 'increment-extra-data'; key: string; amount: number }
  | { kind: 'set-extra-data'; key: string; value: unknown }
  | { kind: 'set-flag'; flag: boolean }
  | { kind: 'set-infobox'; text: string }

/**
 * Sprint 6a: `special-effect` is the canonical engine-mediated mutation
 * dispatcher. Cards that need to mutate `cardStates` from inside an action
 * flow should emit a SEQ child with `actionId: 'special-effect'` and the
 * appropriate params. Routing through this leaf — rather than direct
 * `writeCardExtraData(...)` inside listener handlers / execute callbacks —
 * keeps the engine in control of replay, snapshotting, and SEQ-optional
 * accept/decline semantics.
 */
export const specialEffectAction: ActionDefinition = {
  id: 'special-effect',
  nameKey: 'actions.special-effect.name',
  descriptionKey: 'actions.special-effect.description',
  roundAvailable: 1,
  gainPerRound: {},
  canBeExecutedByPlayer: () => true,
  execute: ({ player, sourceCard, params }) => {
    if (!sourceCard) return { type: 'fail', logKey: 'log.specialEffectFail' }
    const p = params as SpecialEffectParams | undefined
    if (!p || typeof p !== 'object' || !('kind' in p)) {
      return { type: 'fail', logKey: 'log.specialEffectFail' }
    }
    switch (p.kind) {
      case 'increment-extra-data': {
        const current = readCardExtraData<number>(player, sourceCard, p.key) ?? 0
        writeCardExtraData(player, sourceCard, p.key, current + p.amount)
        return { type: 'ok' }
      }
      case 'set-extra-data':
        writeCardExtraData(player, sourceCard, p.key, p.value)
        return { type: 'ok' }
      case 'set-flag':
        setCardFlag(player, sourceCard, p.flag)
        return { type: 'ok' }
      case 'set-infobox':
        writeCardInfobox(player, sourceCard, p.text)
        return { type: 'ok' }
    }
  },
}

// Legacy re-export: previously exported as `specialEffect` (no-op stub) and
// referenced in tests. Keep the function-shaped alias in case external
// callers still import it; new code should use `specialEffectAction`.
export const specialEffect = () => ({ type: 'ok' as const })
