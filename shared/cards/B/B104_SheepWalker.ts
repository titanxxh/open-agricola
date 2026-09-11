import { defineOccupationCard } from '../card-source'

const CARD_ID = 'B104_SheepWalker'

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
        { from: { sheep: 1 }, to: { boar: 1 }, fromFarmyard: true, triggers: ['anytime', 'harvest'], blockedAnytimeInteractionKinds: ['animal-reorg'] },
        { from: { sheep: 1 }, to: { vegetable: 1 }, fromFarmyard: true, triggers: ['anytime', 'harvest'], blockedAnytimeInteractionKinds: ['animal-reorg'] },
        { from: { sheep: 1 }, to: { stone: 1 }, fromFarmyard: true, triggers: ['anytime', 'harvest'], blockedAnytimeInteractionKinds: ['animal-reorg'] },
      ],
  },
  impl: {},
})

export const B104_SheepWalker_impl = B104_SheepWalker.impl
