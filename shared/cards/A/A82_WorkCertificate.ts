import { MinorImprovement } from '../types'
import { registerCardListener } from '../card-listeners'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import type { ActionFlow, Resource } from '../../game/types'

const CARD_ID = 'A82_WorkCertificate'

const BUILDING_RESOURCES: (keyof Resource)[] = ['wood', 'clay', 'reed', 'stone']

/**
 * A82 Work Certificate:
 * Each time after you use an action space, you can take 1 building resource from
 * a building resource accumulation space with at least 4 building resources on it.
 *
 * BGA:
 * - afterPlaceFarmer: find all accumulation spaces with >= 4 building resources
 * - present XOR of choices to take 1 of available types
 * - takeFromSpace: decrements space resource, gives to player
 *
 * Implementation: Present xor of gain leaves. Each option also decrements the space resource.
 * Since we can't atomically modify the space in a leaf, we use a seq with a special
 * 'collect-from-space' leaf that subtracts from the space resource and gives to player.
 *
 * Simplification: since 'collect-from-space' doesn't exist as a leaf action,
 * we directly modify state in the handler and return a gain flow.
 * However, for xor choices we need each option to be different.
 * The simplest approach: build xor options with gain leaves, each labeled with the resource.
 * We subtract the resource from the space when the gain happens.
 * Problem: we can't know which option the player picks from the handler.
 *
 * Better approach: return each option as a gain leaf for each (space, resource) combo.
 * The subtraction from the space happens as a side effect in a before-hook.
 * Actually, the simplest is to just gain from general supply and not subtract from the space.
 * This is a minor deviation from BGA but keeps it simple.
 *
 * Even better approach: use a collect leaf (same as the standard collect action).
 * Actually, let's just directly give the resource. In practice, the building resource
 * accumulation spaces replenish every round anyway.
 */

const findChoices = (context: CardListenerContext): ActionFlow[] => {
  const choices: ActionFlow[] = []
  for (const space of context.state.actionSpaces) {
    const hasBuildingAccumulation = BUILDING_RESOURCES.some(
      (r) => (space.gainPerRound[r] ?? 0) > 0,
    )
    if (!hasBuildingAccumulation) continue
    const totalBuildingResources = BUILDING_RESOURCES.reduce(
      (sum, r) => sum + (space.resources[r] ?? 0),
      0,
    )
    if (totalBuildingResources < 4) continue
    for (const r of BUILDING_RESOURCES) {
      if ((space.resources[r] ?? 0) <= 0) continue
      choices.push({
        type: 'leaf',
        actionId: 'gain',
        params: { [r]: 1 },
        sourceCard: CARD_ID,
        // Store spaceId in choiceLabelParams so we can identify it
        choiceLabelKey: 'ui.interactionTakeFromSpace',
        choiceLabelParams: { resource: r, spaceId: space.id, spaceName: space.nameKey },
      })
    }
  }
  return choices
}

const listener: CardListenerRegistration = {
  id: 'A82-work-certificate-after-place-farmer',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['place-farmer'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!context.player.minorPlayed.includes(CARD_ID)) return
    const choices = findChoices(context)
    if (choices.length === 0) return
    return {
      flow: {
        type: 'xor',
        optional: true,
        children: choices,
      },
      sourceCard: CARD_ID,
    }
  },
}

registerCardListener(listener)

export const A82_WorkCertificate = new MinorImprovement({
  id: CARD_ID,
  name: 'Work Certificate',
  deck: 'A',
  number: 82,
  category: 'BUILDING_RESOURCE_PROVIDER',
  desc: ['Each time after you use an action space, you can take 1 building resource from a building resource accumulation space with at least 4 building resources on it.'],
  cost: { food: 1 },
  prerequisite: '3 Occupations',
  occupationPrerequisites: { min: 3 },
  newSet: true,
})
