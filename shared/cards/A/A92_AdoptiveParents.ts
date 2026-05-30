import type { ActionFlow, GameState, PlayerState } from '../../contract/types'
import { payLeaf } from '../helpers/pay-gain-node'
import { readCardExtraData, writeCardExtraData } from '../helpers/card-state'
import { newbornCount } from '../../domain/player'
import type { CardImpl } from '../registry'
import { A92_AdoptiveParents } from '../../cards-display/A/A92_AdoptiveParents'

const CARD_ID = A92_AdoptiveParents.id

const FORFEITED_KEY = 'forfeitedThisRound'

/**
 * A92 Adoptive Parents:
 * For 1 food, an offspring (Newborn) may take an action in the round it is born;
 * once it does, it no longer counts as "newborn".
 *
 * BGA aligns this as a pull / strict-alternation model. This slice implements
 * capability B (turn-rotation extra action) via the generic `contributeExtraTurn`
 * hook: when the rotation reaches a player who is out of ordinary workers but
 * still holds an activatable offspring, they are offered `XOR[use, forfeit]`.
 *  - use:     pay 1 food → promote the first newborn (child→adult, leaves any
 *             action space, becomes an available worker) → place that worker
 *             once, in the player's own turn (so alternation is preserved).
 *  - forfeit: mark the card forfeited for this round and rotate past — avoids an
 *             infinite loop. Cleared at round start so it is usable again next round.
 *
 * Availability (single source of truth, consumed by both the gating predicate
 * and the produced flow): holds offspring (`newbornCount > 0`), not forfeited
 * this round, and can afford the 1-food cost. When food is short there is no
 * affordable action, so we contribute nothing and the rotation skips the player
 * (matches "food insufficient → not triggered").
 *
 * Capability A (anytime grow-only) and removal of the per-round flag limit are
 * deferred to a later slice; this slice only removes the old push-model residue.
 */
const isForfeited = (player: PlayerState): boolean =>
  readCardExtraData<boolean>(player, CARD_ID, FORFEITED_KEY) === true

const adoptiveAvailable = (player: PlayerState): boolean =>
  newbornCount(player) > 0 && !isForfeited(player) && player.food >= 1

// XOR branches are addressed by index ('0' = use, '1' = forfeit). The engine
// derives the choice list from `children`; each branch carries its own
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
          params: { kind: 'set-extra-data', key: FORFEITED_KEY, value: true },
        },
      ],
    },
  ],
})

const effect = {
  id: CARD_ID,
  contributeExtraTurn: (_state: GameState, player: PlayerState): ActionFlow | void => {
    if (!adoptiveAvailable(player)) return
    return buildExtraTurnFlow()
  },
  onRoundStart: (_state: GameState, player: PlayerState): void => {
    if (isForfeited(player)) {
      writeCardExtraData(player, CARD_ID, FORFEITED_KEY, false)
    }
  },
}

export const A92_AdoptiveParents_impl = {
  effect,
  reaches: ['place-farmer'] as readonly string[],
} satisfies CardImpl
