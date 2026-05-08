import { MinorImprovement } from '../types'

const CARD_ID = 'E53_BoarSpear'

export const E53_BoarSpear = new MinorImprovement({
  id: CARD_ID,
  name: 'Boar Spear',
  deck: 'E',
  number: 53,
  category: 'FOOD',
  desc: ['Each time you get at least 1 <PIG> outside of the breeding phase of a harvest, you can immediately turn them into 4 <FOOD> each.'],
  vp: 1,
  cost: { wood: 1, stone: 1 },
  exchanges: [
    // Sprint 6b: Aligned to BGA — listener-only. The trade is invocable only
    // via the `obtainListener` SEQ above (which dispatches `exchange` with
    // `tradeIds: ['E53_BoarSpear']`); it is intentionally NOT surfaced in the
    // anytime cookery window (`triggers: []`).
    { from: { boar: 1 }, to: { food: 4 }, sourceId: CARD_ID, triggers: [] },
  ],
})
