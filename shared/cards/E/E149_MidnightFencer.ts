import { Occupation } from '../types'
// NOTE: E149 MidnightFencer effect requires stealing fences from opponents at round 14.
// This requires complex multi-player interaction (modifying opponent fences and triggering
// a special fence build). Not implemented — stub only.

export const E149_MidnightFencer = new Occupation({
  id: 'E149_MidnightFencer',
  name: "Midnight Fencer",
  deck: "E",
  number: 149,
  desc: ["At the start of the last harvest, you can take up to 2 of each other player's unbuilt fences and build them on your farm at no cost. (Your farm can then have over 15 fences.)"],
  cost: {},
  players: "4+",
})
