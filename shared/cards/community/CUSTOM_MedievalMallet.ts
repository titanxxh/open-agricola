// Generated from Open Agricola workshop. Do not hand-edit.
// Workshop card: CUSTOM_MedievalMallet
// Author: xxh (github: @titanxxh)
// Submitted: 2026-04-28T07:19:51.556Z

import { MinorImprovement } from '../types'
import type { CardImpl } from '../registry'

// --- BEGIN WORKSHOP CODE (validated in sandbox) ---
const CARD_ID = 'CUSTOM_MedievalMallet';
const CARD_DEF = new MinorImprovement({
    id: CARD_ID,
    name: 'Medieval Mallet',
    deck: "community",
    number: 0,
    desc: [
        'When building a stone room or renovating to a stone house, cost of <STONE> is reduced by 2.',
        'When playing an Improvement, cost of <STONE> is reduced by 1.',
    ],
    cost: { wood: 2 },
    vp: 0,
    prerequisite: "2 Occupations",
    occupationPrerequisites: { min: 2 },
    implemented: true,
    locales: {
        en: {
            name: "Medieval Mallet",
            desc: ["When building a stone house or renovating to a stone house, required <STONE> decreases by 2; when playing an improvement card, required <STONE> decreases by 1."],
            prerequisite: "2 Occupations"
        },
        zh: {
            name: "中世纪木槌",
            desc: ["建造石屋或翻修到石屋时，所需 <STONE> 减少 2；打出发展卡时，所需 <STONE> 减少 1。"],
            prerequisite: "2职业"
        }
    }
});
const CARD_IMPL: CardImpl = {
    listeners: [
        {
            id: "CUSTOM_MedievalMallet-listener-1",
            cardIds: [CARD_ID],
            actions: ['construct'],
            phases: ['computeCosts'],
            handler: (context) => {
                if (context.space?.id !== 'build-stone-room')
                    return;
                return { costs: { stone: -2 }, sourceCard: CARD_ID };
            }
        },
        {
            id: "CUSTOM_MedievalMallet-listener-2",
            cardIds: [CARD_ID],
            actions: ['renovate-house'],
            phases: ['computeCosts'],
            handler: (context) => {
                if (context.player.houseType !== 'clay')
                    return;
                return { costs: { stone: -2 }, sourceCard: CARD_ID };
            }
        },
        {
            id: "CUSTOM_MedievalMallet-listener-3",
            cardIds: [CARD_ID],
            actions: ['improvement-any'],
            phases: ['computeCosts'],
            handler: (_context) => {
                return { costs: { stone: -1 }, sourceCard: CARD_ID };
            }
        }
    ],
};
// --- END WORKSHOP CODE ---

export const CUSTOM_MedievalMallet = CARD_DEF
export const CUSTOM_MedievalMallet_impl = CARD_IMPL satisfies CardImpl
