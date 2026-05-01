import { Occupation } from '../types'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import type { PlayerState } from '../../game/types'
import {
  isCardFlagged,
  readCardExtraData,
  setCardFlag,
  writeCardExtraData,
} from '../helpers/card-state'
import { payLeaf } from '../helpers/pay-gain-node'
import { OCCUPIED_SPACE_CHOICE_PREFIX } from '../../actions/helpers/placement-constants'
import type { CardImpl } from '../registry'

const CARD_ID = 'C150_ParrotBreeder'
const RIGHT_KEY = 'right'

/**
 * C150 Parrot Breeder (Occupation, 4+ players).
 *
 * BGA: on your turn, pay 1 <GRAIN> to use the same action space the player
 * to your right just used (not retroactive; not Meeting Place).
 *
 * State (`cardStates.C150_ParrotBreeder`):
 *   - `flags.flagged` — grain paid, waiting for the next place-farmer to
 *     consume the "copy right-neighbour" option.
 *   - `extraData.right: string | null` — the space id the right-neighbour
 *     used on their most recent place-farmer.
 *
 * Four listeners — all card-local, no engine changes:
 *   1. `after:place-farmer` scope `player`  — owner placed → clear tracker + flag.
 *   2. `after:place-farmer` scope `opponent` — any opponent placed → update tracker
 *      (record if they are the right-neighbour, else clear) + unflag.
 *   3. `anytime` scope `player` — during work phase, unflagged, grain≥1: offer
 *      `pay 1 grain + flag`.
 *   4. `computeArgs:place-farmer` scope `player` — while flagged with a tracked
 *      non-MeetingPlace right space, inject an `OCCUPIED_SPACE_CHOICE_PREFIX`
 *      extra option so the owner can place on the tracked space even when it
 *      is still occupied by the right-neighbour.
 *
 * Seat order: `state.players` array order is our seat order (same assumption
 * used by other cross-player cards). Right-neighbour is `(i − 1 + n) mod n`.
 */

const rightNeighbourIndex = (state: { players: PlayerState[] }, ownerId: string): number => {
  const n = state.players.length
  const ownerIdx = state.players.findIndex((p) => p.id === ownerId)
  if (ownerIdx < 0) return -1
  return (ownerIdx - 1 + n) % n
}

const clearTracker = (owner: PlayerState) => {
  writeCardExtraData(owner, CARD_ID, RIGHT_KEY, null)
  setCardFlag(owner, CARD_ID, false)
}

const afterPlaceFarmerSelfListener: CardListenerRegistration = {
  id: 'C150-parrot-breeder-after-self-place',
  cardIds: [CARD_ID],
  actions: ['place-farmer'],
  phases: ['after' as ActionHookPhase],
  scope: 'player',
  handler: (context: CardListenerContext): ActionHookResult | void => {
    // Owner just placed; consume the flag/tracker pairing.
    clearTracker(context.player)
  },
}

const afterPlaceFarmerOpponentListener: CardListenerRegistration = {
  id: 'C150-parrot-breeder-after-opponent-place',
  cardIds: [CARD_ID],
  actions: ['place-farmer'],
  phases: ['after' as ActionHookPhase],
  scope: 'opponent',
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const owner = context.ownerPlayer
    if (!owner) return
    const placer = context.player
    const rightIdx = rightNeighbourIndex(context.state, owner.id)
    const rightId = rightIdx >= 0 ? context.state.players[rightIdx]?.id : undefined
    if (placer.id === rightId && context.space?.id) {
      writeCardExtraData(owner, CARD_ID, RIGHT_KEY, context.space.id)
    } else {
      writeCardExtraData(owner, CARD_ID, RIGHT_KEY, null)
    }
    setCardFlag(owner, CARD_ID, false)
  },
}

const anytimeListener: CardListenerRegistration = {
  id: 'C150-parrot-breeder-anytime',
  cardIds: [CARD_ID],
  phases: ['anytime' as ActionHookPhase],
  scope: 'player',
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (isCardFlagged(context.player, CARD_ID)) return
    if ((context.player.resources.grain ?? 0) < 1) return
    if (context.state.roundPhase !== 'work') return
    return {
      flow: {
        type: 'seq',
        children: [
          payLeaf({ cardId: CARD_ID, cost: { grain: 1 } }),
          { type: 'leaf', actionId: 'special-effect', sourceCard: CARD_ID, params: { kind: 'set-flag', flag: true } },
        ],
      },
      sourceCard: CARD_ID,
      labelKey: 'cards.C150_ParrotBreeder.anytime',
    }
  },
}

const computeArgsListener: CardListenerRegistration = {
  id: 'C150-parrot-breeder-compute-args-place-farmer',
  cardIds: [CARD_ID],
  actions: ['place-farmer'],
  phases: ['computeArgs' as ActionHookPhase],
  scope: 'player',
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!isCardFlagged(context.player, CARD_ID)) return
    const right = readCardExtraData<string | null>(context.player, CARD_ID, RIGHT_KEY)
    if (typeof right !== 'string' || right.length === 0) return
    if (right === 'meeting-place') return
    const space = context.state.actionSpaces.find((s) => s.id === right)
    if (!space) return
    return {
      extraOptions: [
        {
          value: `${OCCUPIED_SPACE_CHOICE_PREFIX}${right}`,
          labelKey: space.nameKey,
          sourceCard: CARD_ID,
        },
      ],
    }
  },
}

export const C150_ParrotBreeder = new Occupation({
  id: CARD_ID,
  name: 'Parrot Breeder',
  deck: 'C',
  number: 150,
  category: 'ACTIONS_BOOSTER',
  desc: [
    'On your turn, if you pay 1 <GRAIN> to the general supply, you can use the same action space (unless it is the __Meeting Place__ action space) that the player to your right has just used on their turn (not retroactive).',
  ],
  cost: {},
  players: '4+',
  evenMoreSet: true,
})

export const C150_ParrotBreeder_impl = {
  listeners: [
    afterPlaceFarmerSelfListener,
    afterPlaceFarmerOpponentListener,
    anytimeListener,
    computeArgsListener,
  ],
  effect: {
    id: CARD_ID,
    // Defensive clear at round start so a dropped after-place hook can never
    // leak state across rounds.
    onBeforeStartOfTurn: (_state, player) => clearTracker(player),
  },
  reaches: [] as readonly string[],
} satisfies CardImpl
