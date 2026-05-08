import { MinorImprovement } from '../types'

const CARD_ID = 'D76_SocialBenefits'

export const D76_SocialBenefits = new MinorImprovement({
  id: CARD_ID,
  name: "Social Benefits",
  deck: "D",
  number: 76,
  category: "BUILDING_RESOURCE_PROVIDER",
  desc: ["Immediately after the feeding phase of each harvest, if you have no <FOOD> left, you get 1 <WOOD> and 1 <CLAY>."],
  cost: { reed: 1 },
  prerequisite: "At Most 1 Occupation",
  occupationPrerequisites: { max: 1 },
})
