import { defineOccupationCard } from '../card-source'
import type { CardImpl } from '../registry'

const CARD_ID = 'B104_SheepWalker'

const cardImpl = {
  effect: {
    id: CARD_ID,
    // Mirrors the reference `B104_SheepWalker::enforceReorganizeOnLastHarvest`. Forces
    // a reorg interaction (request.kind === 'animal-reorg') on the round-14
    // harvest when at least one sheep is anywhere on the farm so the player
    // has a final chance to evict / accommodate sheep before scoring (the
    // desc-rule "must be accommodated before being exchanged" implication).
    enforceReorganizeOnLastHarvest: (_state, player) => player.resources.sheep > 0,
  },
} satisfies CardImpl

export const B104_SheepWalker = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: 'Sheep Walker',
    deck: 'B',
    number: 104,
    category: 'GOODS_PROVIDER',
    desc: [
        'At any time, you can exchange 1 <SHEEP> on your farmyard for either 1 <PIG>, 1 <VEGETABLE>, or 1 <STONE>.',
      ],
    cost: {},
    players: '1+',
    exchanges: [
        { from: { sheep: 1 }, to: { boar: 1 }, triggers: ['anytime'] },
        { from: { sheep: 1 }, to: { vegetable: 1 }, triggers: ['anytime'] },
        { from: { sheep: 1 }, to: { stone: 1 }, triggers: ['anytime'] },
      ],
  },
  impl: cardImpl,
})

export const B104_SheepWalker_impl = B104_SheepWalker.impl
