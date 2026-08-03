// Generated from Open Agricola workshop. Do not hand-edit.
// Workshop card: CUSTOM_MasterBuilder
// Author: xxh (github: @titanxxh)
// Submitted: 2026-08-03T14:07:04.836Z

import { defineOccupationCard } from '../card-source'
import type { CardImpl } from '../registry'


const CARD_ID = 'CUSTOM_MasterBuilder'
const CARD_IMPL: CardImpl = {
    listeners: [
        {
            id: "CUSTOM_MasterBuilder-listener-1",
            cardIds: [CARD_ID],
            actions: ['construct'],
            phases: ['computeCosts'],
            handler: () => ({
                costs: { wood: -2 },
                sourceCard: CARD_ID,
            })
        },
        {
            id: "CUSTOM_MasterBuilder-listener-2",
            cardIds: [CARD_ID],
            actions: ['improvement'],
            phases: ['computeCosts'],
            handler: () => ({
                costs: { wood: -2 },
                sourceCard: CARD_ID,
            })
        }
    ],
}

const cardImpl = CARD_IMPL satisfies CardImpl

export const CUSTOM_MasterBuilder = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: 'Master Builder',
    deck: "community",
    number: 0,
    desc: [
        'When you build a room, the cost is reduced by 2 <WOOD>. When you play an Improvement, the cost is reduced by 2 <WOOD>.',
    ],
    cost: {},
    vp: 0,
    implemented: true,
    locales: {
        zh: {
            name: "建造大师",
            desc: ["当你建造房间时，费用减少 2 <WOOD>。当你打出改良卡时，费用减少 2 <WOOD>。"]
        }
    }
},
  impl: cardImpl,
})

export const CUSTOM_MasterBuilder_impl = CUSTOM_MasterBuilder.impl
