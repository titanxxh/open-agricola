import { defineMajorCard } from '../card-source'
import type { CardSourceMetaInput } from '../card-source'
import type { CardImpl } from '../registry'

const CARD_ID = 'Major_Moor_ForestersLodge'

const cardImpl = {
  effect: {
    id: CARD_ID,
    computeBonusScore: (_state, player) =>
      (player.farmTerrain ?? []).filter((tile) => tile.kind === 'forest').length,
  },
  reaches: [] as readonly string[],
} satisfies CardImpl

export const Major_Moor_ForestersLodge = defineMajorCard({
  meta: {
    id: CARD_ID,
    name: "Forester's Lodge",
    deck: 'major',
    number: 106,
    cost: { wood: 1, clay: 2 },
    vp: 1,
    extraVp: true,
    requiresFarmersOfTheMoor: true,
    moorSpecialActionBonuses: [
      { actionId: 'fell-trees', resource: 'wood', amount: 1, horseAmount: 2 },
    ],
    desc: [
      '[Special action: Fell Trees]',
      'Gain 1 extra wood, or 2 extra wood if you have at least 1 horse.',
      '[Scoring]',
      'Gain 1 bonus point for each forest in your farmyard.',
    ],
  } satisfies CardSourceMetaInput,
  impl: cardImpl,
})
