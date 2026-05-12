import { PlayerActionCard } from '../types'

export const A39_Chapel = new PlayerActionCard({
  id: "A39_Chapel",
  name: "Chapel",
  deck: "A",
  number: 39,
  category: "POINTS_PROVIDER",
  desc: ["This is an action space for all. A player who uses it gets 3 bonus <SCORE>. If another player uses it, they must first pay you 1 <GRAIN>."],
  cost: {"wood":3,"clay":2},
  prerequisite: "2 Occupations",
  occupationPrerequisites: {"min":2},
  extraVp: true,
  vp: 3,
})
