import { createAccumulatingAction } from '../../factories/accumulate'

export const reedBank = createAccumulatingAction({
  id: 'reed-bank',
  nameKey: 'actions.reed-bank.name',
  descriptionKey: 'actions.reed-bank.description',
  roundAvailable: 1,
  gainPerRound: { reed: 1 },
})
