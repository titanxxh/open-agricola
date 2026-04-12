import { PlayerActionCard } from '../types'
import { registerCardEffect } from '../card-effects'

const CARD_ID = 'D51_Archway'

// BGA-aligned: onBeforeReturnHome gives each farmer on this card an optional
// archway-move-farmer action (choose unoccupied space → execute it).
// No workersAvailable manipulation — the farmer is "moved" from D51 to the target space.
//
// Limitation: PlayerActionCard action space infrastructure (creating the actual
// action space on the board so any player can use it for 1 FOOD) is not yet
// implemented. Currently only the onBeforeReturnHome effect works for the card owner.
registerCardEffect({
  id: CARD_ID,
  onBeforeReturnHome: (state, player) => {
    if (!player.minorPlayed.includes(CARD_ID)) return
    // Check if there are unoccupied action spaces the player can use
    const hasAvailable = state.actionSpaces.some(
      (s) => !s.takenBy && s.id !== CARD_ID && s.canBeExecutedByPlayer(state, player),
    )
    if (!hasAvailable) return
    return {
      type: 'leaf',
      actionId: 'archway-move-farmer',
      sourceCard: CARD_ID,
      optional: true,
    }
  },
})

export const D51_Archway = new PlayerActionCard({
  id: CARD_ID,
  name: "Archway",
  deck: "D",
  number: 51,
  category: "FOOD_PROVIDER",
  desc: ["This card is an action space for all. A player who uses it immediately gets 1 <FOOD>. Immediately before the returning home phase, they can use an unoccupied action space with the person from this card."],
  cost: {"clay":2},
  vp: 4,
  prerequisite: "No Occupations",
  occupationPrerequisites: {"max":0},
})
