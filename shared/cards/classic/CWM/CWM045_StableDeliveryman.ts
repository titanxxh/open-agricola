import { defineOccupationCard } from '../../card-source'
import type { CardImpl } from '../../registry'
import type { ActionFlow, GameState, PlayerState } from '../../../contract/types'
import { futureMeeplesNode } from '../../../actions/effects/internal/future-meeples'
import { getAvailableStableSupplyCount } from '../../../domain/supply-tokens'

const CARD_ID = 'CWM045_StableDeliveryman'

const OFFSETS = [3, 5, 7, 9]
const targetRounds = (state: GameState) =>
  OFFSETS.map((offset) => state.round + offset).filter((round) => round <= 14)
const scheduledRounds = (state: GameState, player: PlayerState) =>
  state.futureMeeples.filter((m) => m.cardId === CARD_ID && m.playerId === player.id).map((m) => m.round)
/** One optional pick per step: place a stable on any open target round, or stop. */
const nextPick = (state: GameState, exclude: readonly number[], supply: number): ActionFlow | undefined => {
  const open = targetRounds(state).filter((round) => !exclude.includes(round))
  if (!open.length || supply <= 0) return
  return {
    type: 'leaf',
    actionId: 'emit-choice',
    sourceCard: CARD_ID,
    params: {
      options: [
        ...open.map((round) => ({ value: 'stable:' + round, labelKey: 'ui.round', labelParams: { round } })),
        { value: 'stable:stop', labelKey: 'ui.interactionOptionalSkip' },
      ],
    },
  }
}

const cardImpl = {
  effect: {
    id: CARD_ID,
    onBuy: (state, player) =>
      nextPick(state, scheduledRounds(state, player), getAvailableStableSupplyCount(state, player)),
    resolveChoice: (state, player, choice) => {
      const round = Number(/^stable:(\d+)$/.exec(choice)?.[1])
      const done = scheduledRounds(state, player)
      if (!targetRounds(state).includes(round) || done.includes(round)) return
      const next = nextPick(state, [...done, round], getAvailableStableSupplyCount(state, player) - 1)
      return {
        type: 'seq',
        children: [
          {
            ...futureMeeplesNode({
              cardId: CARD_ID,
              playerId: player.id,
              entries: [{ round, resources: { stable: 1 }, actionContext: { exactCost: { wood: 1, max: 1 } } }],
            }),
            sourceCard: CARD_ID,
          },
          ...(next ? [next] : []),
        ],
      }
    },
  },
} satisfies CardImpl

export const CWM045_StableDeliveryman = defineOccupationCard({
  meta: {
    id: 'CWM045_StableDeliveryman',
    name: "Stable Deliveryman",
    deck: 'CWM',
    number: 45,
    desc: ["Add 3, 5, 7, and 9 to the current round. Place up to one <STABLE> from your supply on each corresponding round space. At the start of those rounds, you may pay 1 <WOOD> to build that <STABLE>, otherwise return it to your supply."],
    cost: {},
    vp: 0,
    prerequisite: "",
    players: '3+',
    passing: false,
    extraVp: false,
    implemented: true,
    artUrl: '/assets/classic/CWM/CWM045.png',
  },
  impl: cardImpl,
})

export const CWM045_StableDeliveryman_impl = CWM045_StableDeliveryman.impl
