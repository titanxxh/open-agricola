import { defineMinorCard } from '../card-source'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import type { ActionFlow, Resource } from '../../contract/types'
import type { CardImpl } from '../registry'
import { createPartialTakeFromSpaceLeaf } from '../helpers/partial-take'

const CARD_ID = 'A082_WorkCertificate'
const BUILDING_RESOURCES: (keyof Resource)[] = ['wood', 'clay', 'reed', 'stone']

/**
 * A82 Work Certificate:
 * Each time after you use an action space, you can take 1 building resource from
 * a building resource accumulation space with at least 4 building resources on it.
 *
 * The reference `A082_WorkCertificate::onPlayerAfterPlaceFarmer` collects all building
 * resource accumulation spaces with >= 4 resources and presents an XOR. The
 * The reference pulls one off the chosen space (decrementing the space's
 * resource count) and gives it to the player. We use `collect` with
 * `actionContext: { spaceId, resource, amount: 1 }` (partial-take mode) so the
 * source space is properly decremented instead of just gaining a
 * resource from the supply.
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
      choices.push(createPartialTakeFromSpaceLeaf({
        sourceCard: CARD_ID,
        spaceId: space.id,
        spaceName: space.nameKey,
        resource: r,
      }))
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

const cardImpl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl

export const A082_WorkCertificate = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: 'Work Certificate',
    deck: 'A',
    number: 82,
    category: 'BUILDING_RESOURCE_PROVIDER',
    desc: ['Each time after you use an action space, you can take 1 building resource from a building resource accumulation space with at least 4 building resources on it.'],
    cost: { food: 1 },
    prerequisite: '3 Occupations',
    occupationPrerequisites: { min: 3 },
  },
  impl: cardImpl,
})

export const A082_WorkCertificate_impl = A082_WorkCertificate.impl
