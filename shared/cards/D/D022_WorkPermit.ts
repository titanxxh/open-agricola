import { defineMinorCard } from '../card-source'
import { queueFutureMeeplesFlow } from '../../actions/effects/internal/future-meeples'
import {
  isCardFlagged,
  readCardExtraData,
  setCardFlag,
  writeCardExtraData,
  writeCardInfobox,
} from '../helpers/card-state'
import { workersAvailable } from '../../domain/player'
import type { ActionFlow } from '../../contract/types'
import type { CardImpl } from '../registry'

const CARD_ID = 'D022_WorkPermit'
const TARGET_ROUND_KEY = 'targetRound'

const cardImpl = {
  prerequisiteCheck: (player, state) => {
    const totalBuildRes =
      (player.resources.wood ?? 0)
      + (player.resources.stone ?? 0)
      + (player.resources.clay ?? 0)
      + (player.resources.reed ?? 0)
    if (totalBuildRes === 0) return false
    if (!state) return true
    return workersAvailable(state, player) > 0
  },
  effect: {
  id: CARD_ID,
  onBuy: (state, player) => {
    const buildingResources =
      (player.resources.wood ?? 0) +
      (player.resources.clay ?? 0) +
      (player.resources.stone ?? 0) +
      (player.resources.reed ?? 0)
    if (buildingResources <= 0) return
    const targetRound = state.round + buildingResources
    writeCardExtraData(player, CARD_ID, TARGET_ROUND_KEY, targetRound)
    writeCardInfobox(player, CARD_ID, `Round ${targetRound}`)
    return queueFutureMeeplesFlow(state, {
      cardId: CARD_ID,
      playerId: player.id,
      entries: [{ round: targetRound, resources: {} }],
    })
  },
  onRoundStart: (state, player) => {
    const targetRound = readCardExtraData<number>(
      player,
      CARD_ID,
      TARGET_ROUND_KEY,
    )
    if (targetRound !== state.round) return
    if (isCardFlagged(player, CARD_ID)) return
    setCardFlag(player, CARD_ID, true)
    return {
      type: 'seq',
      optional: true,
      children: [
        {
          type: 'leaf',
          actionId: 'place-farmer',
          sourceCard: CARD_ID,
          actionContext: { trueAction: false, extraPlacement: true },
        },
      ],
    } as ActionFlow
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl

export const D022_WorkPermit = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: 'Work Permit',
    deck: 'D',
    number: 22,
    category: 'ACTIONS_BOOSTER',
    desc: [
        'Add 1 to the current round for each building resource you have and place 1 person from your supply on the corresponding round space. In that round, you can use the person.',
      ],
    cost: { food: 1 },
    prerequisite: 'At Least 1 Building Resource',
    evenMoreSet: true,
  },
  impl: cardImpl,
})

export const D022_WorkPermit_impl = D022_WorkPermit.impl
