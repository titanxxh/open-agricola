import { Occupation } from '../types'
import { registerCardListener } from '../card-listeners'
import type { CardListenerRegistration } from '../card-listeners'
import type { ActionHookPhase } from '../../actions/hooks'
import { buildRenovationPlan, canRenovate } from '../../actions/effects/renovation'

const CARD_ID = 'A87_Conservator'

/**
 * A87 Conservator — Occupation.
 *
 * BGA effect: when you take a Renovation action, you may renovate your wooden
 * house directly into a stone house, paying the stone-tier cost (1 stone + 1
 * reed per room) and skipping the clay tier entirely. Otherwise the action
 * resolves as a normal renovation.
 *
 * Implementation strategy (engine "computeChoiceCandidates" opt-in flow):
 *
 *  - The renovate-house action declares `getBaseChoiceOptions` so the engine
 *    enumerates renovation targets ({wood→clay} or {clay→stone} by default).
 *  - This card registers a `computeChoiceCandidates` listener that injects an
 *    extra "stone" target when the owner is on a wooden house. The engine
 *    merges base + extra options, filters by per-option affordability, and:
 *      · 1 affordable → auto-resolves silently (no choice presented).
 *      · ≥2 affordable → presents the choice with the wood→stone option
 *        labelled as "Renovate directly to stone (Conservator)".
 *  - The `isDoable` listener rescues entry visibility for the case where a
 *    wood-house owner cannot afford the standard clay tier but CAN afford
 *    the wood→stone direct path; without it the action would be greyed out
 *    by the default cost preview affordability check.
 */

const choiceCandidateListener: CardListenerRegistration = {
  id: 'A87-conservator-add-stone-renovation-target',
  cardIds: [CARD_ID],
  phases: ['computeChoiceCandidates' as ActionHookPhase],
  actions: ['renovate-house'],
  handler: (context) => {
    if (!context.player.occupationPlayed.includes(CARD_ID)) return
    if (context.player.houseType !== 'wood') return
    return {
      extraOptions: [
        { value: 'stone', labelKey: 'ui.interactionConservatorDirectStone', sourceCard: CARD_ID },
      ],
      sourceCard: CARD_ID,
    }
  },
}

const isDoableListener: CardListenerRegistration = {
  id: 'A87-conservator-isDoable-renovate-house',
  cardIds: [CARD_ID],
  phases: ['isDoable' as ActionHookPhase],
  actions: ['renovate-house'],
  handler: (context) => {
    if (!context.player.occupationPlayed.includes(CARD_ID)) return
    if (context.player.houseType !== 'wood') return
    if (context.doable) return
    const stonePlan = buildRenovationPlan(context.player, 'stone')
    if (!canRenovate(context.player, undefined, stonePlan)) return
    return { doable: true }
  },
}

registerCardListener(choiceCandidateListener)
registerCardListener(isDoableListener)

export const A87_Conservator = new Occupation({
  id: CARD_ID,
  name: 'Conservator',
  deck: 'A',
  number: 87,
  category: 'FARMYARD_-_HOUSE_BUILDING_OR_RENOVATION',
  desc: [
    'When you renovate your home, you can renovate from wood directly into stone.',
  ],
  cost: {},
  players: '1+',
})
