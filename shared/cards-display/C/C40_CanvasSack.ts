import { MinorImprovement } from '../types'

const CARD_ID = 'C40_CanvasSack'

export const C40_CanvasSack = new MinorImprovement({
  id: CARD_ID,
  name: "Canvas Sack",
  deck: "C",
  number: 40,
  category: "GOODS_PROVIDER",
  desc: ["When you play this card paying <GRAIN>/<REED> for it, you immediately get 1 <VEGETABLE>/4 <WOOD>."],
  altCosts: [{ grain: 1 }, { reed: 1 }],
  vp: 1,
  prerequisite: "No Occupations",
  occupationPrerequisites: { max: 0 },
})
