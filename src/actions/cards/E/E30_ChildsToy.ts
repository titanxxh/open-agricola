import { MinorImprovement } from '../types'

export const E30_ChildsToy = new MinorImprovement({
  id: "E30_ChildsToy",
  name: "Child's Toy",
  deck: "E",
  number: 30,
  desc: ["During the feeding phase of each harvest, your newborns require 2 <FOOD> (instead of 1)."],
  cost: {},
  prerequisite: "Exactly 2 Adults",
})
