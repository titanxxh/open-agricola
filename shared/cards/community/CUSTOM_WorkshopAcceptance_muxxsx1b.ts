// Generated from Open Agricola workshop. Do not hand-edit.
// Workshop card: CUSTOM_WorkshopAcceptance_muxxsx1b
// Author: Workshop App acceptance
// Submitted: 2026-10-07T10:16:08.028Z

import { defineMinorCard } from '../card-source'
import type { CardImpl } from '../registry'


const CARD_IMPL: CardImpl = {}

const cardImpl = CARD_IMPL satisfies CardImpl

export const CUSTOM_WorkshopAcceptance_muxxsx1b = defineMinorCard({
  meta: { "id": "CUSTOM_WorkshopAcceptance_muxxsx1b", "name": "Workshop delivery acceptance", "deck": "community", "number": 0, "desc": ["Temporary acceptance fixture. No card effect."], "cost": {}, "vp": 0, locales: {
        zh: {
            name: "工坊投稿验收",
            desc: ["验收修订 1791368131565，无卡牌效果。"]
        }
    } },
  impl: cardImpl,
})

export const CUSTOM_WorkshopAcceptance_muxxsx1b_impl = CUSTOM_WorkshopAcceptance_muxxsx1b.impl
