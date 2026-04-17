import type { ActionDefinition } from '../../game/types'
import { getRoundPlacementDetails } from '../../cards/helpers/round-placement'
import { removeWorkerRef, spaceHasPlayer } from '../../game/space'

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
    const excludeSpaceId = (params as { excludeSpaceId?: string } | undefined)?.excludeSpaceId
    const excludeMeetingPlace =
      (params as { excludeMeetingPlace?: boolean } | undefined)?.excludeMeetingPlace ?? true

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
      removeWorkerRef(only, player.id, entry?.workerId)
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
  resolveChoice: ({ state, player }, choice) => {
    const target = state.actionSpaces.find(
      (space) => space.id === choice && spaceHasPlayer(space, player.id),
    )
    if (!target) return { type: 'fail', logKey: 'log.actionFail' }
    const placements = getRoundPlacementDetails(player)
    const entry = placements.find(e => e.spaceId === target.id)
    removeWorkerRef(target, player.id, entry?.workerId)
    return { type: 'ok', logKey: 'log.cardEffectTrigger' }
  },
}
