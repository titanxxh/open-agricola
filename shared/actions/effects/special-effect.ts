import type { ActionDefinition, GameState, PlayerState } from '../../game/types'
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
      case 'set-flag':
        setCardFlag(target, sourceCard, p.flag)
        return { type: 'ok' }
      case 'set-infobox':
        writeCardInfobox(target, sourceCard, p.text)
        return { type: 'ok' }
    }
  },
}
