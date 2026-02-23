import { PlayerActionCard } from '../types'

export const C104_Collector = new PlayerActionCard({
  id: "C104_Collector",
  name: "Collector",
  deck: "C",
  number: 104,
  category: "GOODS_PROVIDER",
  desc: ["This card is an action space for you only. When you use it for the 1st/2nd/3rd/4th time, you get 1 <BEGGING> marker and 6/7/8/9 different good of your choice."],
  cost: {},
  players: "1+",
})
