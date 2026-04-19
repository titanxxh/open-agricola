import type { ActionDefinition, ActionSpace } from '../../game/types'
import { getRoundPlacementDetails } from '../../cards/helpers/round-placement'
import { removeWorkerRef, spaceHasPlayer } from '../../game/space'
import { holdWorkerOnCard } from '../../cards/helpers/card-held-workers'

type RecallPlacedWorkerParams = {
  excludeSpaceId?: string
  excludeMeetingPlace?: boolean
  forceFirst?: boolean
  targetCardHold?: string
}

/**
 * Generic "recall a worker I placed this round back home" helper.
 *
 * Added for D93_SheepInspector. The BGA server-side card takes a raw
 * `returnFarmer` SPECIAL_EFFECT with a dynamic `spaces` arg list; our engine
 * expresses the same thing via an ActionDefinition whose `execute` returns a
 * `choice` listing the player's currently-occupied action spaces and whose
 * `resolveChoice` unsets the chosen space's `takenBy` and increments
 * `workersAvailable`.
 *
 * Params:
 *   - excludeSpaceId?: string  — space to exclude (the one just placed)
 *   - excludeMeetingPlace?: boolean (default true) — matches BGA rule
 *   - forceFirst?: boolean — skip choice UI and recall the first placement of the round
 *   - targetCardHold?: string — card ID to hold the recalled worker on instead of returning it home
 *
 * This helper is narrow by design: it does not pay any cost, flag any card,
 * or interact with "fake" meeples. Wrap it in a SEQ with pay / flag leaves
 * when a card needs those.
 */

const MEETING_PLACE_PREFIXES = ['meeting-place']

const isMeetingPlace = (spaceId: string) =>
  MEETING_PLACE_PREFIXES.some((prefix) => spaceId.startsWith(prefix))

export const recallPlacedWorkerAction: ActionDefinition = {
  id: 'recall-placed-worker',
  nameKey: 'actions.recall-placed-worker.name',
  descriptionKey: 'actions.recall-placed-worker.description',
  roundAvailable: 1,
  gainPerRound: {},
  canBeExecutedByPlayer: () => true,
  execute: ({ state, player, params }) => {
    const p = params as RecallPlacedWorkerParams | undefined
    const excludeSpaceId = p?.excludeSpaceId
    const excludeMeetingPlace = p?.excludeMeetingPlace ?? true
    const forceFirst = p?.forceFirst === true
    const targetCardHold = p?.targetCardHold

    const applyRelocation = (space: ActionSpace, workerId: string | undefined) => {
      const removed = removeWorkerRef(space, player.id, workerId)
      if (removed && targetCardHold) {
        holdWorkerOnCard(player, targetCardHold, removed.workerId)
      }
    }

    if (forceFirst) {
      const placements = getRoundPlacementDetails(player)
      const first = placements[0]
      if (!first) return { type: 'fail', logKey: 'log.actionFail' }
      if (excludeMeetingPlace && isMeetingPlace(first.spaceId)) {
        return { type: 'fail', logKey: 'log.actionFail' }
      }
      if (excludeSpaceId && first.spaceId === excludeSpaceId) {
        return { type: 'fail', logKey: 'log.actionFail' }
      }
      const origin = state.actionSpaces.find((s) => s.id === first.spaceId)
      if (!origin) return { type: 'fail', logKey: 'log.actionFail' }
      if (!origin.takenBy.some((t) => t.playerId === player.id && t.workerId === first.workerId)) {
        return { type: 'fail', logKey: 'log.actionFail' }
      }
      applyRelocation(origin, first.workerId)
      return { type: 'ok', logKey: 'log.cardEffectTrigger' }
    }

    const candidates = state.actionSpaces.filter((space) => {
      if (!spaceHasPlayer(space, player.id)) return false
      if (excludeSpaceId && space.id === excludeSpaceId) return false
      if (excludeMeetingPlace && isMeetingPlace(space.id)) return false
      return true
    })

    if (candidates.length === 0) return { type: 'fail', logKey: 'log.actionFail' }

    if (candidates.length === 1) {
      const only = candidates[0]!
      const placements = getRoundPlacementDetails(player)
      const entry = placements.find(e => e.spaceId === only.id)
      applyRelocation(only, entry?.workerId)
      return { type: 'ok', logKey: 'log.cardEffectTrigger' }
    }

    return {
      type: 'choice',
      promptKey: 'ui.interactionRecallPlacedWorker',
      options: candidates.map((space) => ({
        value: space.id,
        labelKey: space.nameKey,
      })),
    }
  },
  resolveChoice: ({ state, player, params }, choice) => {
    const p = params as RecallPlacedWorkerParams | undefined
    const target = state.actionSpaces.find(
      (space) => space.id === choice && spaceHasPlayer(space, player.id),
    )
    if (!target) return { type: 'fail', logKey: 'log.actionFail' }
    const placements = getRoundPlacementDetails(player)
    const entry = placements.find(e => e.spaceId === target.id)
    const removed = removeWorkerRef(target, player.id, entry?.workerId)
    if (removed && p?.targetCardHold) {
      holdWorkerOnCard(player, p.targetCardHold, removed.workerId)
    }
    return { type: 'ok', logKey: 'log.cardEffectTrigger' }
  },
}
