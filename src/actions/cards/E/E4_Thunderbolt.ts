import { MinorImprovement } from '../types'

export const E4_Thunderbolt = new MinorImprovement({
  id: "E4_Thunderbolt",
  name: "Thunderbolt",
  deck: "E",
  number: 4,
  desc: ["Immediately remove all <GRAIN> from one of your fields to the general supply. Gain 2 <WOOD> for each <GRAIN> you just removed."],
  cost: {},
  prerequisite: "1 Grain Field",
  passing: true,
})
