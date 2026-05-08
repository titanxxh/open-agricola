import { MinorImprovement } from '../types'

const CARD_ID = 'B29_CookeryLesson'

export const B29_CookeryLesson = new MinorImprovement({
  id: CARD_ID,
  name: 'Cookery Lesson',
  deck: 'B',
  number: 29,
  category: 'POINTS_PROVIDER',
  desc: [
    'Each time you use a __Lessons__ action space and a cooking improvement on the same turn, you get 1 bonus <SCORE>.',
  ],
  cost: { food: 2 },
  extraVp: true,
  evenMoreSet: true,
  implemented: true,
})
