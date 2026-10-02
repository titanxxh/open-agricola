// Generated from Open Agricola workshop. Do not hand-edit.
// Workshop card: CUSTOM_Gleaner
// Author: xxh1 (github: @titanxxh)
// Submitted: 2026-10-02T15:17:04.417Z

/* eslint-disable @typescript-eslint/no-explicit-any -- workshop helpers are untyped sandbox code */

import { defineOccupationCard } from '../card-source'
import type { CardImpl } from '../registry'

import { gainLeaf } from '../helpers/pay-gain-node'

const CARD_ID = 'CUSTOM_Gleaner'
function buildSelfBonusFlow(resourcesGained: any): any {
    if (!resourcesGained)
        return
    const children = []
    for (const [resource, amountRaw] of Object.entries(resourcesGained)) {
        const amount = Number(amountRaw) || 0
        if (amount >= 3) {
            const bonus = amount >= 6 ? 2 : 1
            children.push(gainLeaf(CARD_ID, { [resource]: bonus }))
        }
    }
    if (children.length === 0)
        return
    if (children.length === 1)
        return children[0]
    return { type: 'seq', children }
}
function buildOpponentBonusFlow(context: any): any {
    const resourcesGained = context.result?.resourcesGained
    if (!resourcesGained)
        return
    const triggered = Object.entries(resourcesGained).some(([, amountRaw]: any) => {
        return (Number(amountRaw) || 0) >= 4
    })
    if (!triggered)
        return
    const owner = context.ownerPlayer
    const lastRound = owner?.cardStates?.[CARD_ID]?.extraData?.lastRound
    if (lastRound === context.state.round)
        return
    return {
        type: 'seq',
        children: [
            {
                type: 'leaf',
                actionId: 'special-effect',
                params: {
                    kind: 'set-extra-data',
                    key: 'lastRound',
                    value: context.state.round,
                },
                sourceCard: CARD_ID,
            },
            gainLeaf(CARD_ID, { food: 1 }),
        ],
    }
}
const CARD_IMPL: CardImpl = {
    listeners: [
        {
            id: "CUSTOM_Gleaner-listener-1",
            cardIds: [CARD_ID],
            actions: ['collect'],
            phases: ['after'],
            scope: 'player',
            handler: (context: any) => {
                return {
                    flow: buildSelfBonusFlow(context.result?.resourcesGained),
                    sourceCard: CARD_ID,
                }
            }
        },
        {
            id: "CUSTOM_Gleaner-listener-2",
            cardIds: [CARD_ID],
            actions: ['collect'],
            phases: ['after'],
            scope: 'opponent',
            handler: (context: any) => {
                return {
                    flow: buildOpponentBonusFlow(context),
                    sourceCard: CARD_ID,
                }
            }
        }
    ],
}

const cardImpl = CARD_IMPL satisfies CardImpl

export const CUSTOM_Gleaner = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: 'Gleaner',
    deck: "community",
    number: 0,
    desc: [
        'Whenever you take 3 or more of one resource from an accumulating action space at once, also gain 1 of that resource; if you take 6 or more, gain 2 instead. Once per round, after an opponent takes 4 or more of one resource from an accumulating action space at once, gain 1 <FOOD>.',
    ],
    cost: {},
    vp: 0,
    implemented: true,
    locales: {
        zh: {
            name: "拾穗者",
            desc: ["每当你从同一个累积行动格上一次取走 3 个或更多同种资源时，额外获得 1 个该种资源；若取走 6 个或更多，则改为额外获得 2 个该种资源。每轮一次：当对手从同一个累积行动格上一次取走 4 个或更多同种资源后，你获得 1 <FOOD>。"]
        },
        en: {
            name: "Gleaner",
            desc: ["Whenever you take 3 or more of one resource from an accumulating action space at once, also gain 1 of that resource; if you take 6 or more, gain 2 instead. Once per round, after an opponent takes 4 or more of one resource from an accumulating action space at once, gain 1 <FOOD>."]
        }
    },
    artUrl: "/card-art/community/CUSTOM_Gleaner.png"
},
  impl: cardImpl,
})

export const CUSTOM_Gleaner_impl = CUSTOM_Gleaner.impl
