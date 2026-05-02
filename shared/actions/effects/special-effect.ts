import type { ActionDefinition, GameState, PlayerState, Resource } from '../../game/types'
import {
  setCardFlag,
  writeCardInfobox,
  readCardExtraData,
  writeCardExtraData,
} from '../../cards/helpers/card-state'
import { incCounter } from '../../cards/__stubs__/helpers'
import {
  fieldFindStackOfKind,
  fieldHasCrop,
  fieldPopIfDepleted,
} from '../../game/field'

export type SpecialEffectParams =
  | { kind: 'increment-extra-data'; key: string; amount: number }
  | { kind: 'set-extra-data'; key: string; value: unknown }
  | { kind: 'increment-counter'; key: string; amount: number }
  | { kind: 'set-flag'; flag: boolean }
  | { kind: 'set-infobox'; text: string }
  | { kind: 'remove-field-crop'; crop: 'grain' | 'vegetable'; minRemaining?: number }
  | { kind: 'consume-fence'; count?: number }
  | {
      kind: 'move-resource-between-spaces'
      fromSpaceId: string
      toSpaceId: string
      resource: keyof Resource
      amount: number
    }

const resolveTargetPlayer = (
  state: GameState | undefined,
  actor: PlayerState,
  actionContext: Record<string, unknown> | undefined,
): PlayerState => {
  const targetId = actionContext?.targetPlayerId
  if (typeof targetId !== 'string' || !targetId) return actor
  const target = state?.players?.find((p) => p.id === targetId)
  return target ?? actor
}

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
  execute: ({ state, player, sourceCard, params, actionContext }) => {
    if (!sourceCard) return { type: 'fail', logKey: 'log.specialEffectFail' }
    const p = params as SpecialEffectParams | undefined
    if (!p || typeof p !== 'object' || !('kind' in p)) {
      return { type: 'fail', logKey: 'log.specialEffectFail' }
    }
    const target = resolveTargetPlayer(state, player, actionContext)
    switch (p.kind) {
      case 'increment-extra-data': {
        const current = readCardExtraData<number>(target, sourceCard, p.key) ?? 0
        writeCardExtraData(target, sourceCard, p.key, current + p.amount)
        return { type: 'ok' }
      }
      case 'set-extra-data':
        writeCardExtraData(target, sourceCard, p.key, p.value)
        return { type: 'ok' }
      case 'increment-counter':
        incCounter(target, sourceCard, p.key, p.amount)
        return { type: 'ok' }
      case 'set-flag':
        setCardFlag(target, sourceCard, p.flag)
        return { type: 'ok' }
      case 'set-infobox':
        writeCardInfobox(target, sourceCard, p.text)
        return { type: 'ok' }
      case 'remove-field-crop': {
        // Used by C57 Crudite-style "discard 1 crop on top of another" effects.
        // Picks the FIRST player field that has the crop with at least
        // `minRemaining` left (default 2 — the BGA "stacked on another"
        // semantics) and decrements its top stack by 1. No-op if no field
        // qualifies.
        const minRem = p.minRemaining ?? 2
        const field = target.fields.find(
          (f) =>
            fieldHasCrop(f, p.crop) &&
            (fieldFindStackOfKind(f, p.crop)?.remaining ?? 0) >= minRem,
        )
        if (!field) return { type: 'ok' }
        const stack = fieldFindStackOfKind(field, p.crop)
        if (!stack) return { type: 'ok' }
        stack.remaining -= 1
        fieldPopIfDepleted(field)
        return { type: 'ok' }
      }
      case 'consume-fence': {
        const count = p.count ?? 1
        let removed = 0
        for (let i = target.fenceSegments.length - 1; i >= 0 && removed < count; i -= 1) {
          if (target.fenceSegments[i]!.type === 'fence') {
            target.fenceSegments.splice(i, 1)
            removed += 1
          }
        }
        if (removed < count) {
          return { type: 'fail', logKey: 'log.specialEffectFail' }
        }
        return { type: 'ok' }
      }
      case 'move-resource-between-spaces': {
        if (!state) return { type: 'fail', logKey: 'log.specialEffectFail' }
        const from = state.actionSpaces.find((s) => s.id === p.fromSpaceId)
        const to = state.actionSpaces.find((s) => s.id === p.toSpaceId)
        if (!from?.resources || !to?.resources) {
          return { type: 'fail', logKey: 'log.specialEffectFail' }
        }
        const have = (from.resources as Partial<Record<keyof Resource, number>>)[p.resource] ?? 0
        if (have < p.amount) {
          return { type: 'fail', logKey: 'log.specialEffectFail' }
        }
        ;(from.resources as Record<keyof Resource, number>)[p.resource] = have - p.amount
        const dest = (to.resources as Partial<Record<keyof Resource, number>>)[p.resource] ?? 0
        ;(to.resources as Record<keyof Resource, number>)[p.resource] = dest + p.amount
        return { type: 'ok' }
      }
    }
  },
}
