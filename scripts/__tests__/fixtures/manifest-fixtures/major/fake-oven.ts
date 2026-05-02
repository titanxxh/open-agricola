import type { MajorCardData } from '../../../../../shared/cards/major/types'

export const fakeOven1: MajorCardData = {
  id: 'Major_FakeOven1',
  name: 'Fake Oven',
  deck: 'major',
  number: 1,
  cost: { clay: 2 },
  vp: 1,
  extraVp: false,
  isBaking: true,
  desc: [
    '[Baking action:]',
    '<GRAIN> <ARROW> 2<FOOD>',
  ],
}

export const fakeOven2: MajorCardData = {
  ...fakeOven1,
  id: 'Major_FakeOven2',
  number: 2,
  cost: { clay: 3 },
  vp: 2,
}
