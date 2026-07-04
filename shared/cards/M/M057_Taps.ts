import { defineMinorCard } from '../card-source'
import type { ActionFlow, GameState, PlayerState } from '../../contract/types'
import { MOOR_SPECIAL_ACTION_CHOICE_ACTION_ID, hasMoorSpecialActionChoice } from '../../moor/special-action-flow'
import { workersAvailable } from '../../domain/player'
import { readCardExtraData, writeCardExtraData } from '../helpers/card-state'
import type { CardImpl } from '../registry'

const CARD_ID = 'M057_Taps'
const USED_KEY = 'usedThisRound'
const ACTION_CONTEXT = { mode: 'take-card-action' }

const isUsed = (player: PlayerState): boolean =>
  readCardExtraData<boolean>(player, CARD_ID, USED_KEY) === true

const tapsAvailable = (state: GameState, player: PlayerState): boolean =>
  state.enableFarmersOfTheMoor === true &&
  state.roundPhase === 'work' &&
  workersAvailable(state, player) <= 0 &&
  !isUsed(player) &&
  hasMoorSpecialActionChoice(state, player, ACTION_CONTEXT)

const buildExtraTurnFlow = (): ActionFlow => ({
  type: 'seq',
  children: [
    {
      type: 'leaf',
      actionId: MOOR_SPECIAL_ACTION_CHOICE_ACTION_ID,
      sourceCard: CARD_ID,
      actionContext: ACTION_CONTEXT,
    },
    {
      type: 'leaf',
      actionId: 'special-effect',
      sourceCard: CARD_ID,
      params: { kind: 'set-extra-data', key: USED_KEY, value: true },
    },
  ],
})

const cardImpl = {
  effect: {
    id: CARD_ID,
    contributeExtraTurn: (state: GameState, player: PlayerState): ActionFlow | void => {
      if (!tapsAvailable(state, player)) return
      return buildExtraTurnFlow()
    },
    countExtraTurns: (state: GameState, player: PlayerState): number =>
      tapsAvailable(state, player) ? 1 : 0,
    onRoundStart: (_state: GameState, player: PlayerState): void => {
      if (isUsed(player)) writeCardExtraData(player, CARD_ID, USED_KEY, false)
    },
  },
  reaches: [] as readonly string[],
} satisfies CardImpl

export const M057_Taps = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Taps",
    deck: "M",
    number: 57,
    category: "ACTIONS_BOOSTER",
    desc: [
        "In each work phase, after you have placed all of your people, when it would be your turn again, you get exactly one more turn in which you can take a face-up special action card. The special action card costs 0 or 2 <FOOD>, as usual."
    ],
    cost: {},
    prerequisite: "2 Improvements",
    implemented: true,
    requiresFarmersOfTheMoor: true,
  },
  impl: cardImpl,
})

export const M057_Taps_impl = M057_Taps.impl
