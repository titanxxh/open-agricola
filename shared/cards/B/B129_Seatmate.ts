import { defineOccupationCard } from '../card-source'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import type { ActionChoiceOption } from '../../contract/types'
import { OCCUPIED_SPACE_CHOICE_PREFIX } from '../../actions/helpers/placement-constants'
import { isSpaceOccupied, spaceHasPlayer } from '../../domain/space'
import type { CardImpl } from '../registry'

const CARD_ID = 'B129_Seatmate'
/**
 * B129 Seatmate — "You can use the action space on round space 13 even if it
 * is occupied by one or more people of the players to your immediate left and
 * right."
 *
 * 3-player branch: every non-owner is a left/right neighbour, so any
 * non-owner occupant on r13 enables the inject as long as owner is not already
 * on r13.
 *
 * 4-player branch: opposite seat is `(ownerIdx + 2) % 4`. Inject only when
 * neighbour(s) occupy r13 AND opposite seat is free. Aligns with BGA
 * `B129_Seatmate.php` (Stats::getPosition; opposite blocks injection).
 *
 * Seat order: `state.players` array index === opening seat order (same
 * assumption used by `C150_ParrotBreeder`). The listener does not need a
 * persistent `Stats.position` field because no code path reorders the array
 * after `createInitialPlayers`. Any future PR that reorders `state.players`
 * (e.g. unshift / splice / sort / reverse) MUST audit B129 and C150.
 *
 * Generalized opposite formula `(ownerIdx + Math.floor(n / 2)) % n` covers
 * future 5/6-player expansion (n=5 → +2 quasi-opposite; n=6 → +3 true
 * opposite); OA bootstrap currently caps at 4
 * (`shared/session/state-bootstrap.ts:416`), so n != 3, 4 paths are dead
 * code today but defined for safety.
 */
const computeArgsListener: CardListenerRegistration = {
  id: 'B129-seatmate-compute-args',
  cardIds: [CARD_ID],
  phases: ['computeArgs' as ActionHookPhase],
  actions: ['place-farmer'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.state.round < 13) return

    const r13Id = context.state.roundActionOrder[12]
    if (!r13Id) return
    const round13Space = context.state.actionSpaces.find((s) => s.id === r13Id)
    if (!round13Space) return

    if (!isSpaceOccupied(round13Space)) return

    if (spaceHasPlayer(round13Space, context.player.id)) return

    const n = context.state.players.length
    if (n === 3) {
      // 3p 中所有非 owner 都是邻座（卡牌文本 "left and right" 与 BGA 3p 分支自然吻合）。
      return {
        extraOptions: buildExtraOptions(round13Space),
        sourceCard: CARD_ID,
      }
    }

    if (n === 4) {
      const ownerIdx = context.state.players.findIndex((p) => p.id === context.player.id)
      // 理论不可达：listener 触发玩家是 owner 自身，必在 state.players 中。
      // 保留防御性 return 满足 TS narrowing。
      if (ownerIdx < 0) return
      const oppositeIdx = (ownerIdx + Math.floor(n / 2)) % n
      const oppositeId = context.state.players[oppositeIdx]?.id
      if (oppositeId && spaceHasPlayer(round13Space, oppositeId)) return
      return {
        extraOptions: buildExtraOptions(round13Space),
        sourceCard: CARD_ID,
      }
    }

    // 其他人数（OA 当前 bootstrap 不可达；2 人局正常发不到 B129）：不注入。
    return
  },
}

const buildExtraOptions = (round13Space: { id: string; nameKey: string }): ActionChoiceOption[] => [
  {
    value: `${OCCUPIED_SPACE_CHOICE_PREFIX}${round13Space.id}`,
    labelKey: round13Space.nameKey,
    sourceCard: CARD_ID,
  },
]

const cardImpl = {
  listeners: [computeArgsListener],
  reaches: [] as readonly string[],
} satisfies CardImpl

export const B129_Seatmate = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: 'Seatmate',
    deck: 'B',
    number: 129,
    category: 'ACTIONS_BOOSTER',
    desc: ['You can use the action space on round space 13 even if it is occupied by one or more people of the players to your immediate left and right.'],
    cost: {},
    players: '3+',
  },
  impl: cardImpl,
})

export const B129_Seatmate_impl = B129_Seatmate.impl
