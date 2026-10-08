// Generated from Open Agricola workshop. Do not hand-edit.
// Workshop card: CUSTOM_MedievalMallet
// Author: xxh
// Submitted: 2026-10-08T16:25:43.696Z
// Description: When you build a room, the cost is reduced by 2 <WOOD>. When you play an Improvement, the cost is reduced by 2 <WOOD>.

import { defineMinorCard } from '../card-source'
import type { CardImpl } from '../registry'


const CARD_ID = 'CUSTOM_MedievalMallet'
const CARD_IMPL: CardImpl = {
    listeners: [
        {
            id: "CUSTOM_MedievalMallet-listener-1",
            cardIds: [CARD_ID],
            actions: ['construct'],
            phases: ['computeCosts'],
            handler: () => ({
                costs: { wood: -2 },
                costAttribution: [{ sourceCard: CARD_ID, costs: { wood: -2 } }],
                sourceCard: CARD_ID,
            })
        },
        {
            id: "CUSTOM_MedievalMallet-listener-2",
            cardIds: [CARD_ID],
            actions: ['improvement'],
            phases: ['computeCosts'],
            handler: () => ({
                bonuses: [{
                        discount: { wood: 2 },
                        capDiscountAtCost: true,
                        optional: false,
                        sources: [CARD_ID],
                    }],
                sourceCard: CARD_ID,
            })
        }
    ],
}

const cardImpl = CARD_IMPL satisfies CardImpl

export const CUSTOM_MedievalMallet = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: 'Medieval Mallet',
    deck: "community",
    number: 0,
    prerequisite: '2 Occupations',
    desc: ['When you build a room, the cost is reduced by 2 <WOOD>. When you play an Improvement, the cost is reduced by 2 <WOOD>.'],
    cost: { wood: 2 },
    vp: 0,
    implemented: true,
    locales: {
        zh: {
            name: "中世纪木槌",
            desc: ["当你建造一个房间时，费用减少 2 <WOOD>。当你打出改良卡时，费用减少 2 <WOOD>。"],
            prerequisite: "2 职业"
        }
    },
    artUrl: "/card-art/community/CUSTOM_MedievalMallet.png"
},
  impl: cardImpl,
})

export const CUSTOM_MedievalMallet_impl = CUSTOM_MedievalMallet.impl
