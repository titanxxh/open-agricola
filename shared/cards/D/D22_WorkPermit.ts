import { MinorImprovement } from '../types'
import { queueFutureMeeplesFlow } from '../../actions/effects/future-meeples'
import {
  isCardFlagged,
  readCardExtraData,
  setCardFlag,
  writeCardExtraData,
  writeCardInfobox,
} from '../helpers/card-state'
import type { ActionFlow } from '../../game/types'
import type { CardImpl } from '../registry'

const CARD_ID = 'D22_WorkPermit'
const TARGET_ROUND_KEY = 'targetRound'

export const D22_WorkPermit = new MinorImprovement({
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
})

export const D22_WorkPermit_impl = {
  effect: {
  id: CARD_ID,
  onBuy: (state, player) => {
    const buildingResources =
      (player.resources.wood ?? 0) +
      (player.resources.clay ?? 0) +
      (player.resources.stone ?? 0) +
      (player.resources.reed ?? 0)
    if (buildingResources <= 0) return
    const targetRound = Math.min(14, state.round + buildingResources)
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
