// Generated from Open Agricola workshop. Do not hand-edit.
// Workshop card: CUSTOM_MedievalMallet
// Author: xxh (github: @titanxxh)
// Submitted: 2026-08-01T11:39:55.759Z

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
            handler: (_context) => {
                return { costs: { wood: -2 }, sourceCard: CARD_ID }
            }
        },
        {
            id: "CUSTOM_MedievalMallet-listener-2",
            cardIds: [CARD_ID],
            actions: ['improvement-any', 'minor-improvement'],
            phases: ['computeCosts'],
            handler: (_context) => {
                return { costs: { wood: -2 }, sourceCard: CARD_ID }
            }
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
    prerequisite: '2 occupations played',
    desc: [
        'When you build a room, the cost is reduced by 2 <WOOD>. When you play an Improvement, the cost is reduced by 2 <WOOD>.',
    ],
    cost: { wood: 2 },
    vp: 0,
    implemented: true,
    locales: {
        zh: {
            name: "中世纪木槌",
            desc: ["建造房间时，木材费用减少2 <WOOD>。打出改良卡时，木材费用也减少2 <WOOD>。"],
            prerequisite: "已打出2个职业"
        }
    }
},
  impl: cardImpl,
})

export const CUSTOM_MedievalMallet_impl = CUSTOM_MedievalMallet.impl
