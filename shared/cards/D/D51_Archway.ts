import { PlayerActionCard } from '../types'
import { registerCardEffect } from '../card-effects'
import { readCardExtraData, writeCardExtraData } from '../helpers/card-state'

const CARD_ID = 'D51_Archway'

export const D51_Archway = new PlayerActionCard({
  id: CARD_ID,
  name: "Archway",
  deck: "D",
  number: 51,
  category: "FOOD_PROVIDER",
  desc: ["This card is an action space for all. A player who uses it immediately gets 1 <FOOD>. Immediately before the returning home phase, they can use an unoccupied action space with the person from this card."],
  cost: {"clay":2},
  prerequisite: "No Occupations",
  occupationPrerequisites: {"max":0},
})

registerCardEffect({
  id: CARD_ID,
  onBeforeReturnHome: (state, player) => {
    // D51 is a PlayerActionCard (registered as minor improvement) — check minorPlayed
    if (!player.minorPlayed.includes(CARD_ID)) return
    // Check if there are unoccupied action spaces available
    const available = state.actionSpaces.filter(
      (s) => !s.takenBy && s.canBeExecutedByPlayer(state, player),
    )
    if (available.length === 0) return
    // Grant temporary worker for the extra placement (idempotent via flag)
    // The handler may be called twice: once by runBeforeReturnHomeHooks (imperative scan)
    // and once by continueStageHook (flow scan). Use a flag to avoid double-granting.
    if (!readCardExtraData<boolean>(player, CARD_ID, 'workerGranted')) {
      player.workersAvailable += 1
      writeCardExtraData(player, CARD_ID, 'workerGranted', true)
    }
    return {
      type: 'leaf',
      actionId: 'place-farmer',
      sourceCard: CARD_ID,
      optional: true,
    }
  },
  onReturnHome: (_state, player) => {
    // Clear the workerGranted flag at the end of the returning home phase
    if (!player.minorPlayed.includes(CARD_ID)) return
    writeCardExtraData(player, CARD_ID, 'workerGranted', false)
  },
})
