import type { ActionDefinition, ActionSpace } from '../../../contract/types'
import { getRoundPlacementDetails } from '../../../cards/helpers/round-placement'
import { clearLinkedSpaceBlocksForWorker, findActionSpaceById, removeWorkerRef, spaceHasPlayer } from '../../../domain/space'
import { holdWorkerOnCard } from '../../../cards/helpers/card-held-workers'
import { recallWorkerById } from '../../../cards/helpers/recall-worker'
import { setCardFlag } from '../../../cards/helpers/card-state'

type RecallPlacedWorkerParams = {
  /**
   * Direct mode — recall this specific worker. Caller is responsible for
   * computing the workerId (e.g. via `getRoundPlacementDetails(player)[0]`)
   * since a single space may host more than one of the player's workers.
   * Skips the choice prompt and the candidate-space scan entirely.
   */
  workerId?: string
  /**
   * Direct-mode tolerance — if the named worker is no longer placed (already
   * recalled by another effect, race etc.), return `ok` rather than `fail`.
   * Decorations (flagSourceCard / logCardTrigger) still execute.
   */
  noOpIfMissing?: boolean

  /** Choice-mode filters (only used when `workerId` is omitted). */
  excludeSpaceId?: string
  excludeMeetingPlace?: boolean

  /** Decorations applied after a successful recall (or after a no-op). */
  targetCardHold?: string
  flagSourceCard?: boolean
  logCardTrigger?: boolean
}

/**
 * Generic "recall a placed worker back home" helper.
 *
 * Two modes:
 *  - **Direct** — caller passes `workerId`; the action finds the space hosting
 *    that worker and recalls it. Card listeners typically compute the workerId
 *    via `getRoundPlacementDetails(player)` and pass it in. Pair with
 *    `noOpIfMissing: true` for "fire-and-forget" semantics where the recall
 *    becomes a no-op when the targeted worker is gone.
 *  - **Choice** — caller omits `workerId`; the action lists the player's
 *    occupied spaces (filtered by `excludeSpaceId` / `excludeMeetingPlace`)
 *    as a choice and recalls the chosen one.
 *
 * `workerId` is preferred over a space id because a single space can host
 * more than one of the player's workers; identifying by space alone is
 * ambiguous.
 *
 * Decoration params apply uniformly: `targetCardHold` parks the recalled
 * worker on a card instead of returning it home; `flagSourceCard` flips the
 * source card's flag to true; `logCardTrigger` emits a `log.cardEffectTrigger`
 * with the source card id.
 *
 * The helper does not pay any cost — wrap in a SEQ when a card needs payment.
 */

const MEETING_PLACE_PREFIXES = ['meeting-place']

const isMeetingPlace = (spaceId: string) =>
  MEETING_PLACE_PREFIXES.some((prefix) => spaceId.startsWith(prefix))

const finishOk = (
  player: import('../../../contract/types').PlayerState,
  sourceCard: string | undefined,
  p: RecallPlacedWorkerParams,
) => {
  if (sourceCard && p.flagSourceCard) setCardFlag(player, sourceCard, true)
  void p.logCardTrigger
  return { type: 'ok' as const }
}

export const recallPlacedWorkerAction: ActionDefinition = {
  id: 'recall-placed-worker',
  nameKey: 'actions.recall-placed-worker.name',
  descriptionKey: 'actions.recall-placed-worker.description',
  roundAvailable: 1,
  gainPerRound: {},
  canBeExecutedByPlayer: () => true,
  execute: ({ state, player, params, sourceCard }) => {
    const p = (params as RecallPlacedWorkerParams | undefined) ?? {}
    const targetCardHold = p.targetCardHold

    const applyRelocation = (space: ActionSpace, workerId: string | undefined) => {
      const removed = removeWorkerRef(space, player.id, workerId)
      if (removed) {
        clearLinkedSpaceBlocksForWorker(state, player.id, removed.workerId)
      }
      if (removed && targetCardHold) {
        holdWorkerOnCard(player, targetCardHold, removed.workerId)
      }
    }

    // ── Direct mode ────────────────────────────────────────────────
    if (p.workerId !== undefined) {
      const ok = recallWorkerById(state, player, p.workerId, { targetCardHold })
      if (!ok && !p.noOpIfMissing) return { type: 'fail', errorKey: 'log.actionFail' }
      return finishOk(player, sourceCard, p)
    }

    // ── Choice mode ────────────────────────────────────────────────
    const excludeSpaceId = p.excludeSpaceId
    const excludeMeetingPlace = p.excludeMeetingPlace ?? true

    const candidates = state.actionSpaces.filter((space) => {
      if (!spaceHasPlayer(space, player.id)) return false
      if (excludeSpaceId && space.id === excludeSpaceId) return false
      if (excludeMeetingPlace && isMeetingPlace(space.id)) return false
      return true
    })

    if (candidates.length === 0) return { type: 'fail', errorKey: 'log.actionFail' }

    if (candidates.length === 1) {
      const only = candidates[0]!
      const placements = getRoundPlacementDetails(player)
      const entry = placements.find((e) => e.spaceId === only.id)
      applyRelocation(only, entry?.workerId)
      return finishOk(player, sourceCard, p)
    }

    return {
      type: 'request',
      request: {
        kind: 'choice',
        options: candidates.map((space) => ({
          value: space.id,
          labelKey: space.nameKey,
        })),
      },
      promptKey: 'ui.interactionRecallPlacedWorker',
    }
  },
  resolveChoice: ({ state, player, params, sourceCard }, choice) => {
    const p = (params as RecallPlacedWorkerParams | undefined) ?? {}
    const target = findActionSpaceById(state, choice)
    if (target && !spaceHasPlayer(target, player.id)) return { type: 'fail', errorKey: 'log.actionFail' }
    if (!target) return { type: 'fail', errorKey: 'log.actionFail' }
    const placements = getRoundPlacementDetails(player)
    const entry = placements.find((e) => e.spaceId === target.id)
    const removed = removeWorkerRef(target, player.id, entry?.workerId)
    if (removed) {
      clearLinkedSpaceBlocksForWorker(state, player.id, removed.workerId)
    }
    if (removed && p.targetCardHold) {
      holdWorkerOnCard(player, p.targetCardHold, removed.workerId)
    }
    return finishOk(player, sourceCard, p)
  },
}
