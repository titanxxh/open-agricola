import { MinorImprovement } from '../types'
import { registerCardListener } from '../card-listeners'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import type { CostModifier } from '../../game/types'

const CARD_ID = 'D82_HuntingTrophy'
const FARM_REDEV = 'farm-redevelopment'

/**
 * D82 Hunting Trophy (MinorImprovement)
 *
 * BGA behavior:
 *   1. Improvements built on HouseRedevelopment cost 1 building resource of
 *      player's choice less.
 *   2. Fences built on FarmRedevelopment cost 3 wood less total.
 *
 * Implementation status:
 *   - Effect 2 (fence discount on farm-redevelopment): implemented via a
 *     before/after listener pair that temporarily adds a BonusModifier to
 *     player.activeModifiers while the farm-redevelopment action is executing.
 *     The fencing cost path (payTypedFlatCost with costType='fencing') applies
 *     activeModifiers, so this works end-to-end.
 *   - Effect 1 (improvement discount on house-redevelopment): NOT wired.
 *     TODO: BGA's -1 building resource discount for improvements on
 *     HouseRedevelopment requires engine changes to route activeModifiers
 *     through improvement cost resolution (getMajorImprovementPreviewCost /
 *     getMinorImprovementPreviewCost currently do not consult activeModifiers).
 *     Currently not wired; tracked as a follow-up.
 */

const isFarmRedev = (context: CardListenerContext): boolean =>
  context.space?.id === FARM_REDEV

const beforeFarmRedev: CardListenerRegistration = {
  id: 'D82-hunting-trophy-before-farm-redevelopment',
  cardIds: [CARD_ID],
  phases: ['before' as ActionHookPhase],
  actions: ['place-farmer'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!context.player.minorPlayed.includes(CARD_ID)) return
    if (!isFarmRedev(context)) return
    const mod: CostModifier = {
      type: 'bonus',
      cardId: CARD_ID,
      appliesTo: ['fencing'],
      discount: { wood: 3 },
      optional: false,
    }
    if (!context.player.activeModifiers) {
      ;(context.player as unknown as { activeModifiers: CostModifier[] }).activeModifiers = []
    }
    // Avoid duplicate registration on re-entry
    const existing = context.player.activeModifiers!.some(
      (m) => m.cardId === CARD_ID,
    )
    if (!existing) context.player.activeModifiers!.push(mod)
  },
}

const afterFarmRedev: CardListenerRegistration = {
  id: 'D82-hunting-trophy-after-farm-redevelopment',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['place-farmer'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!context.player.minorPlayed.includes(CARD_ID)) return
    if (!isFarmRedev(context)) return
    if (!context.player.activeModifiers) return
    context.player.activeModifiers = context.player.activeModifiers.filter(
      (m) => m.cardId !== CARD_ID,
    )
  },
}

registerCardListener(beforeFarmRedev)
registerCardListener(afterFarmRedev)

export const D82_HuntingTrophy = new MinorImprovement({
  id: CARD_ID,
  name: 'Hunting Trophy',
  deck: 'D',
  number: 82,
  category: 'BUILDING_RESOURCE_PROVIDER',
  desc: [
    'Improvements built on __House Redevelopment__ cost you 1 building resource of your choice less. Fences built on __Farm Redevelopment__ cost you a total of 3 <WOOD> less.',
  ],
  cost: { boar: 1 },
  vp: 1,
})
