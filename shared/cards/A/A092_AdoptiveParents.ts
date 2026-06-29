import { defineOccupationCard } from '../card-source'
import type { ActionFlow, GameState, PlayerState } from '../../contract/types'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookResult } from '../../actions/hooks'
import { payLeaf } from '../helpers/pay-gain-node'
import { readCardExtraData, writeCardExtraData } from '../helpers/card-state'
import { newbornCount } from '../../domain/player'
import type { CardImpl } from '../registry'

const CARD_ID = 'A092_AdoptiveParents'
const FORFEITED_KEY = 'forfeitedThisRound'

/**
 * A92 Adoptive Parents:
 * For 1 food, an offspring (Newborn) may take an action in the round it is born;
 * once it does, it no longer counts as "newborn".
 *
 * BGA models this as a pull / strict-alternation effect with two entry points,
 * both gated by the same `adoptiveAvailable` predicate:
 *
 *  - Capability A (anytime grow-only): in any interactive window the player may
 *    pay 1 food to promote the first newborn (child→adult, leaves any action
 *    space, becomes an available worker). It does NOT place immediately — the
 *    promoted worker waits in `home` and is placed via the normal rotation, so
 *    alternation with the opponent is preserved (this is the fix for the old
 *    push model's "place two workers in a row" bug). Template: E22 GuestRoom.
 *
 *  - Capability B (turn-rotation extra action): when the rotation reaches a
 *    player who is out of ordinary workers but still holds an activatable
 *    offspring, they are offered `XOR[use, forfeit]` via the generic
 *    `contributeExtraTurn` hook.
 *      use:     pay 1 food → promote the first newborn → place that worker once,
 *               in the player's own turn (so alternation is preserved).
 *      forfeit: mark the card forfeited for this round and rotate past — avoids
 *               an infinite loop. Cleared at round start so it is usable again.
 *
 * Availability (single source of truth, mirrors BGA `hasAdoptiveAvailable`):
 * holds offspring (`newbornCount > 0`), not forfeited this round, and can afford
 * the 1-food cost. There is no per-round limit: promoting decrements
 * `newbornCount`, so N offspring grant N activations (each paying 1 food). When
 * food is short there is no affordable action, so nothing is contributed and the
 * option is hidden.
 *
 * "Does not count as newborn" is satisfied naturally by `promote-first-newborn`
 * setting `isNewborn = false`, so feeding / scoring downstream need no changes.
 */
const isForfeited = (player: PlayerState): boolean =>
  readCardExtraData<boolean>(player, CARD_ID, FORFEITED_KEY) === true

const adoptiveAvailable = (player: PlayerState): boolean =>
  newbornCount(player) > 0 && !isForfeited(player) && player.resources.food >= 1

// Capability A: anytime grow-only. `seq[pay 1 food, promote]` — no place-farmer;
// the promoted worker is placed via the normal rotation to keep alternation.
const anytimeGrowListener: CardListenerRegistration = {
  id: 'A92-adoptive-parents-anytime-grow',
  cardIds: [CARD_ID],
  phases: ['anytime'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    // Suppress this anytime grow while the player is inside A92's own
    // extra-turn decision (the XOR[use, forfeit] frame). Otherwise the player
    // could promote+park an offspring via the anytime grow AND then forfeit the
    // extra turn, double-dipping a placement and bypassing the use/forfeit XOR.
    if (context.pendingSourceCard === CARD_ID) return
    if (!adoptiveAvailable(context.player)) return
    return {
      sourceCard: CARD_ID,
      labelKey: 'ui.interactionUseGrowOffspring',
      flow: {
        type: 'seq',
        children: [
          payLeaf({ cardId: CARD_ID, cost: { food: 1 } }),
          {
            type: 'leaf',
            actionId: 'special-effect',
            sourceCard: CARD_ID,
            params: { kind: 'promote-first-newborn' },
          },
        ],
      },
    }
  },
}

// Capability B: XOR branches addressed by index ('0' = use, '1' = forfeit). The
// engine derives the choice list from `children`; each branch carries its own
// `choiceLabelKey`.
const buildExtraTurnFlow = (): ActionFlow => ({
  type: 'xor',
  promptKey: 'ui.interactionFlowSelect',
  children: [
    {
      type: 'seq',
      choiceLabelKey: 'ui.interactionUseAbility',
      children: [
        payLeaf({ cardId: CARD_ID, cost: { food: 1 } }),
        {
          type: 'leaf',
          actionId: 'special-effect',
          sourceCard: CARD_ID,
          params: { kind: 'promote-first-newborn' },
        },
        {
          type: 'leaf',
          actionId: 'place-farmer',
          sourceCard: CARD_ID,
          actionContext: { trueAction: false },
        },
      ],
    },
    {
      type: 'seq',
      choiceLabelKey: 'ui.interactionDecline',
      children: [
        {
          type: 'leaf',
          actionId: 'special-effect',
          sourceCard: CARD_ID,
          params: { kind: 'emit-card-triggered', accepted: false, optional: true },
        },
        {
          type: 'leaf',
          actionId: 'special-effect',
          sourceCard: CARD_ID,
          params: { kind: 'set-extra-data', key: FORFEITED_KEY, value: true },
        },
      ],
    },
  ],
})

const cardImpl = {
  listeners: [anytimeGrowListener],
  effect: {
    id: CARD_ID,
    contributeExtraTurn: (_state: GameState, player: PlayerState): ActionFlow | void => {
      if (!adoptiveAvailable(player)) return
      return buildExtraTurnFlow()
    },
    countExtraTurns: (_state: GameState, player: PlayerState): number => {
      if (!adoptiveAvailable(player)) return 0
      return Math.min(newbornCount(player), player.resources.food)
    },
    onRoundStart: (_state: GameState, player: PlayerState): void => {
      if (isForfeited(player)) {
        writeCardExtraData(player, CARD_ID, FORFEITED_KEY, false)
      }
    },
  },
  reaches: ['place-farmer'] as readonly string[],
} satisfies CardImpl

export const A092_AdoptiveParents = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: 'Adoptive Parents',
    deck: 'A',
    number: 92,
    category: 'ACTIONS_BOOSTER',
    desc: ['For 1 <FOOD>, you can take an action with offspring in the same round you get it. If you do, the offspring does not count as "newborn".'],
    cost: {},
    players: '1+',
  },
  impl: cardImpl,
})

export const A092_AdoptiveParents_impl = A092_AdoptiveParents.impl
