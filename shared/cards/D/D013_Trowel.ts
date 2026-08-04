import { defineMinorCard } from '../card-source'
import type { CardListenerContext, CardListenerRegistration } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import type { CardImpl } from '../registry'
import { sourcedMandatoryBonus } from '../helpers/renovation-cost'

const CARD_ID = 'D013_Trowel'
/**
 * D13 Trowel — MinorImprovement (cost: 1 wood).
 * At any time, you can renovate your house to stone in a single step:
 *  - From a wooden house: 1 stone + 1 reed + 1 food per room.
 *  - From a clay house:   1 stone per room (reed waived).
 *
 * BGA (D013_Trowel.php):
 *  - isListeningTo → anytime, onPlayerAtAnytime returns RENOVATION with
 *    `toStone: true` and `actionCardId: D013_Trowel`.
 *  - onPlayerComputeCostsRenovation injects the wood→stone trade pattern
 *    (stone:1/food:1 per room) and the reed fee (rooms reeds from wood,
 *    0 from clay).
 *
 * Local implementation strategy:
 *  - `anytime` listener returns a renovate-house leaf with
 *    `sourceCard: D013_Trowel` and `params.selectedOption: 'stone'` so the
 *    engine's renovation `planForContext` resolves directly to
 *    `buildRenovationPlan(player, 'stone')` (base cost {stone: rooms, reed: 1}).
 *  - `computeChoiceCandidates` listener (sourceCard scoped) injects the
 *    `stone` candidate when the owner is on a wooden house — base options
 *    for wood-house only include `clay`.
 *  - `computeCosts` listener (sourceCard scoped) adds the BGA wood→stone
 *    food/reed delta on the stone path. The wood→clay sibling option still
 *    surfaces during the affordability probe; we publish a prohibitive
 *    cost on the `clay` probe so the engine filters it out and `stone`
 *    remains the sole affordable target (single-option auto-resolve).
 */

const anytimeListener: CardListenerRegistration = {
  id: 'D13-trowel-anytime',
  cardIds: [CARD_ID],
  phases: ['anytime' as ActionHookPhase],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.player.houseType === 'stone') return
    return {
      flow: {
        type: 'leaf',
        actionId: 'renovate-house',
        sourceCard: CARD_ID,
        params: { selectedOption: 'stone' },
        choiceLabelKey: 'cards.D013_Trowel.anytime',
      },
      sourceCard: CARD_ID,
      labelKey: 'cards.D013_Trowel.anytime',
    }
  },
}

const choiceCandidateListener: CardListenerRegistration = {
  id: 'D13-trowel-add-stone-renovation-target',
  cardIds: [CARD_ID],
  phases: ['computeChoiceCandidates' as ActionHookPhase],
  actions: ['renovate-house'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.sourceCard !== CARD_ID) return
    if (context.player.houseType !== 'wood') return
    return {
      extraOptions: [
        { value: 'stone', labelKey: 'cards.D013_Trowel.optionStone', sourceCard: CARD_ID },
      ],
      sourceCard: CARD_ID,
    }
  },
}

const computeCostsListener: CardListenerRegistration = {
  id: 'D13-trowel-compute-costs-renovation',
  cardIds: [CARD_ID],
  phases: ['computeCosts' as ActionHookPhase],
  actions: ['renovate-house'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.sourceCard !== CARD_ID) return
    const selected = (context.params as { selectedOption?: unknown } | undefined)?.selectedOption
    const houseType = context.player.houseType
    const rooms = context.player.rooms
    if (selected === 'clay') {
      // Trowel never resolves via wood→clay; publish a prohibitive delta so
      // the affordability probe drops this option and leaves `stone` alone.
      return {
        costs: { clay: 999, reed: 999 },
        costAttribution: [],
        sourceCard: CARD_ID,
      }
    }
    if (selected === 'stone' && houseType === 'wood') {
      // base plan {stone: rooms, reed: 1} → target {stone: rooms, reed: rooms, food: rooms}
      return {
        bonuses: [sourcedMandatoryBonus(CARD_ID, { food: -rooms, reed: -(rooms - 1) })],
        sourceCard: CARD_ID,
      }
    }
    if (selected === 'stone' && houseType === 'clay') {
      // base plan {stone: rooms, reed: 1} → target {stone: rooms} (waive reed)
      return {
        bonuses: [sourcedMandatoryBonus(CARD_ID, { reed: 1 })],
        sourceCard: CARD_ID,
      }
    }
  },
}

const cardImpl = {
  listeners: [anytimeListener, choiceCandidateListener, computeCostsListener],
  reaches: [] as readonly string[],
} satisfies CardImpl

export const D013_Trowel = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: 'Trowel',
    deck: 'D',
    number: 13,
    category: 'FARM_PLANNER',
    desc: [
        'At any time, you can renovate your house to <STONE>. From a wooden house, this costs 1 <STONE>, 1 <REED>, and 1 <FOOD> per room. From a clay house, this costs 1 <STONE> per room.',
      ],
    cost: { wood: 1 },
  },
  impl: cardImpl,
})

export const D013_Trowel_impl = D013_Trowel.impl
