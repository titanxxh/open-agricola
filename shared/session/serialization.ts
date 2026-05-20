import type { ActionSpace, GameState } from '../contract/types'
import type { EngineStack, EngineStackCursor } from '../engine'
import { createActionSpaces } from '../actions'
import { normalizeState } from '../session/state-bootstrap'
import { getCardModifiers } from '../cards/card-modifiers'
import { createPlayerActionSpaces } from '../cards/player-action-space'
import { normalizeTakenBy } from '../domain/space'

export type SerializedActionSpace = Omit<
  ActionSpace,
  'canBeExecutedByPlayer' | 'execute' | 'resolveChoice' | 'flow'
>

export type SerializedGameState = Omit<
  GameState,
  'actionSpaces' | 'roundStartSnapshot'
> & {
  actionSpaces: SerializedActionSpace[]
  roundStartSnapshot: null
  engineStack: EngineStackCursor
}

export type SerializeStateContext = {
  engineStack: EngineStack
}

export const serializeState = (
  state: GameState,
  ctx: SerializeStateContext,
): SerializedGameState => {
  const { actionSpaces, ...rest } = state
  return {
    ...rest,
    roundStartSnapshot: null,
    actionSpaces: actionSpaces.map(
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      ({ canBeExecutedByPlayer, execute, resolveChoice, flow, ...s }) => s,
    ),
    engineStack: ctx.engineStack.toCursor(),
  }
}

/**
 * Per-viewer snapshot. Identical to `serializeState` except that secret
 * information belonging to non-viewer players is replaced with same-length
 * arrays of '?' placeholders so the shape stays stable for the client.
 *
 * Currently filters:
 *   - `players[i].occupationHand` and `players[i].minorHand` for every
 *     player other than the viewer.
 *   - `draft.pools[pid].occ`, `draft.pools[pid].minor`, and
 *     `draft.pendingPicks[pid]` for every player other than the viewer
 *     (public data like `draft.kept`, `draft.round`, `draft.seatOrder`
 *     is preserved verbatim).
 *
 * Pass `viewerPlayerId = null` (or an unknown id) to produce a spectator
 * view where every player's hand and pool is masked.
 */
export const serializeStateForPlayer = (
  state: GameState,
  viewerPlayerId: string | null,
  ctx: SerializeStateContext,
): SerializedGameState => {
  const base = serializeState(state, ctx)
  const filteredPlayers = base.players.map((p) =>
    p.id === viewerPlayerId
      ? p
      : {
          ...p,
          occupationHand: Array(p.occupationHand.length).fill('?'),
          minorHand: Array(p.minorHand.length).fill('?'),
        },
  )
  const filteredDraft = !base.draft
    ? base.draft
    : {
        ...base.draft,
        pools: Object.fromEntries(
          Object.entries(base.draft.pools).map(([pid, pool]) =>
            pid === viewerPlayerId
              ? [pid, pool]
              : [
                  pid,
                  {
                    occ: Array(pool.occ.length).fill('?'),
                    minor: Array(pool.minor.length).fill('?'),
                  },
                ],
          ),
        ),
        pendingPicks: Object.fromEntries(
          Object.entries(base.draft.pendingPicks).map(([pid, pick]) =>
            pid === viewerPlayerId
              ? [pid, pick]
              : [
                  pid,
                  {
                    occ: pick.occ === null ? null : '?',
                    minor: pick.minor === null ? null : '?',
                  },
                ],
          ),
        ),
      }
  return {
    ...base,
    players: filteredPlayers,
    draft: filteredDraft,
  }
}

export const rebuildActiveModifiers = (state: GameState): GameState => {
  state.players.forEach((player) => {
    const existing = player.activeModifiers ?? []
    const next = [...existing]
    const playedCardIds = [...(player.minorPlayed ?? []), ...(player.occupationPlayed ?? [])]
    playedCardIds.forEach((cardId) => {
      const modifiers = getCardModifiers(cardId)
      modifiers.forEach((modifier) => {
        if (!next.some((entry) => JSON.stringify(entry) === JSON.stringify(modifier))) {
          next.push(modifier)
        }
      })
    })
    player.activeModifiers = next
    // Ensure extraOccupationsFromCards is initialized
    if (!player.extraOccupationsFromCards) {
      player.extraOccupationsFromCards = []
    }
  })
  return state
}

export type RehydratedState = {
  state: GameState
  engineStackCursor: EngineStackCursor
}

export const rehydrateState = (raw: SerializedGameState): RehydratedState => {
  const templates = createActionSpaces(raw.players?.length)
  const { engineStack, ...rawWithoutCursor } = raw
  const restored = rebuildActiveModifiers(normalizeState(rawWithoutCursor as unknown as GameState))
  restored.actionSpaces = templates.map((template) => {
    const saved = raw.actionSpaces?.find((s) => s.id === template.id)
    return {
      ...template,
      resources: saved?.resources ?? template.resources,
      takenBy: normalizeTakenBy(saved?.takenBy),
      exclusiveUse: saved?.exclusiveUse,
    }
  })
  // Append PlayerActionCard dynamic spaces
  const playerActionSpaces = createPlayerActionSpaces(restored)
  for (const pas of playerActionSpaces) {
    const saved = raw.actionSpaces?.find((s) => s.id === pas.id)
    if (saved) {
      pas.resources = saved.resources ?? pas.resources
      pas.takenBy = normalizeTakenBy(saved.takenBy)
      pas.exclusiveUse = saved.exclusiveUse
    }
    restored.actionSpaces.push(pas)
  }
  return {
    state: restored,
    engineStackCursor: engineStack ?? { frames: [] },
  }
}
