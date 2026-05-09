import type { MajorCardDisplay } from '../../cards/major/types'

export const well: MajorCardDisplay = {
  id: 'Major_Well',
  name: 'Well',
  deck: 'major',
  number: 7,
  cost: { wood: 1, stone: 3 },
  vp: 4,
  extraVp: false,
  desc: ['[Put 1 <FOOD> on the 5 next turns. At the start of each turn, collect the <FOOD>]'],
}
