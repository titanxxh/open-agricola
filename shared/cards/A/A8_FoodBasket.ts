import { MinorImprovement } from '../types'

export const A8_FoodBasket = new MinorImprovement({
  id: "A8_FoodBasket",
  name: "Food Basket",
  deck: "A",
  number: 8,
  category: "COOKING",
  desc: ["You immediately get 1 <GRAIN> and 1 <VEGETABLE>."],
  cost: {},
  passing: true,
  implemented: false,
})
