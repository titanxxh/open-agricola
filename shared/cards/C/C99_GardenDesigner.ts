import { Occupation } from '../types'
import { registerCardEffect } from '../card-effects'

const CARD_ID = 'C99_GardenDesigner'

registerCardEffect({
  id: CARD_ID,
  computeBonusScore: (_state, player, ctx) => {
    if (!player.occupationPlayed.includes(CARD_ID)) return 0
    const emptyFields = player.fields.filter(f => f.crop === null).length
    if (emptyFields === 0) return 0

    const alreadyReserved = ctx.reserved.food ?? 0
    let food = (player.resources.food ?? 0) - alreadyReserved
    let vp = 0
    for (let i = 0; i < emptyFields && food > 0; i++) {
      if (food >= 7) { food -= 7; vp += 3 }
      else if (food >= 4) { food -= 4; vp += 2 }
      else if (food >= 1) { food -= 1; vp += 1 }
    }
    const foodUsed = (player.resources.food ?? 0) - alreadyReserved - food
    if (foodUsed > 0) {
      ctx.reserved.food = alreadyReserved + foodUsed
    }
    return vp
  },
})

export const C99_GardenDesigner = new Occupation({
  id: "C99_GardenDesigner",
  name: "Garden Designer",
  deck: "C",
  number: 99,
  category: "POINTS_PROVIDER",
  desc: ["At the start of scoring, you can place <FOOD> in empty fields. You get 1/2/3 bonus <SCORE> for each field in which you place 1/4/7 <FOOD>."],
  cost: {},
  players: "1+",
})
