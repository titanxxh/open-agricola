import { Occupation } from '../types'
import type { ActionSpace } from '../../game/types'
import { registerCardListener } from '../card-listeners'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import { getRoundPlacementOrder } from '../helpers/round-placement'

const CARD_ID = 'A161_PatchCaretaker'

type ResourceType = 'wood' | 'clay' | 'stone' | 'food' | 'sheep' | 'boar' | 'cattle'
const RESOURCE_TYPES: ResourceType[] = ['wood', 'clay', 'stone', 'food', 'sheep', 'boar', 'cattle']

const getAccumulatedTypes = (space: ActionSpace): ResourceType[] =>
  RESOURCE_TYPES.filter((r) => (space.gainPerRound?.[r] ?? 0) > 0)

// A161 Patch Caretaker: Each time you use an accumulation space while already having
// used another accumulation space for the same type of good that work phase,
// you also get 1 VEGETABLE.
const listener: CardListenerRegistration = {
  id: 'A161-patch-caretaker-after-place-farmer',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['place-farmer'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!context.player.occupationPlayed.includes(CARD_ID)) return
    if (!context.space) return
    const currentTypes = getAccumulatedTypes(context.space)
    if (currentTypes.length === 0) return // Not an accumulation space
    // Get previously used spaces this round (exclude the current one)
    const placementHistory = getRoundPlacementOrder(context.player)
    const previousSpaceIds = placementHistory.slice(0, -1) // all but the last (current)
    if (previousSpaceIds.length === 0) return
    // Find any previous space that accumulates the same type
    for (const prevSpaceId of previousSpaceIds) {
      const prevSpace = context.state.actionSpaces.find((s) => s.id === prevSpaceId)
      if (!prevSpace) continue
      const prevTypes = getAccumulatedTypes(prevSpace)
      if (currentTypes.some((t) => prevTypes.includes(t))) {
        return { flow: gainLeaf(CARD_ID, { vegetable: 1 }), sourceCard: CARD_ID }
      }
    }
  },
}

registerCardListener(listener)

export const A161_PatchCaretaker = new Occupation({
  id: CARD_ID,
  name: 'Patch Caretaker',
  deck: 'A',
  number: 161,
  category: 'CROP_PROVIDER',
  desc: ['Each time you use an accumulation space while already having used another accumulation space for the same type of good that work phase, you also get 1 <VEGETABLE>.'],
  cost: {},
  players: '4+',
  newSet: true,
})
