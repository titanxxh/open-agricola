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
import { D22_WorkPermit } from '../../cards-display/D/D22_WorkPermit'

const CARD_ID = D22_WorkPermit.id

const TARGET_ROUND_KEY = 'targetRound'

export const D22_WorkPermit_impl = {
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
