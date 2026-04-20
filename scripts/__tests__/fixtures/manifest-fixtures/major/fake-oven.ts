import type { MajorCardEffect } from '../../../../../shared/cards/major/types'

export const fakeOven1: MajorCardEffect = {
  id: 'Major_FakeOven1',
  cost: { clay: 2 },
  vp: 1,
  extraVp: false,
  isBaking: true,
  description: [
    '[Baking action:]',
    '<GRAIN> <ARROW> 2<FOOD>',
  ],
}

export const fakeOven2: MajorCardEffect = {
  ...fakeOven1,
  id: 'Major_FakeOven2',
  cost: { clay: 3 },
  vp: 2,
}
