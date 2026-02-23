import { MinorImprovement } from '../types'

export const E22_GuestRoom = new MinorImprovement({
  id: "E22_GuestRoom",
  name: "Guest Room",
  deck: "E",
  number: 22,
  desc: ["Immediately place any amount of <FOOD> from your supply on this card. Once per round, you can discard 1 <FOOD> from this card to place a person from your supply in that round."],
  cost: {"wood":4,"reed":1},
})
