import { MinorImprovement } from '../types'

const CARD_ID = 'B32_Kettle'

/**
 * BGA: 3-grain trade gives +1 bonus VP, 5-grain trade gives +2 bonus VP.
 * Implemented via per-trade `sideEffect: { type: 'bonusVp', amount: N }` —
 * the engine accumulates amount × times into
 * `cardStates[B32_Kettle].extraData.bonusVpEarned` and `computeBonusScore`
 * reads it for the final score (mirrors E153 StoneSculptor pattern).
 */
export const B32_Kettle = new MinorImprovement({
  id: CARD_ID,
  name: 'Kettle',
  deck: 'B',
  number: 32,
  category: 'POINTS_PROVIDER',
  desc: ['At any time, you can exchange 1/3/5 <GRAIN> for 3/4/5 <FOOD> and 0/1/2 bonus <SCORE>.'],
  cost: { clay: 1 },
  prerequisite: '1 Grain Field',
  extraVp: true,
  exchanges: [
    { from: { grain: 1 }, to: { food: 3 }, triggers: ['anytime'], sourceId: CARD_ID },
    {
      from: { grain: 3 },
      to: { food: 4 },
      triggers: ['anytime'],
      sourceId: CARD_ID,
      sideEffect: { type: 'bonusVp', amount: 1 },
    },
    {
      from: { grain: 5 },
      to: { food: 5 },
      triggers: ['anytime'],
      sourceId: CARD_ID,
      sideEffect: { type: 'bonusVp', amount: 2 },
    },
  ],
})
