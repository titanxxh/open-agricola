import { defineOccupationCard } from '../card-source'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import type { CardImpl } from '../registry'

const CARD_ID = 'A131_CraftTeacher'
const TRIGGER_MAJORS = new Set(['Major_Joinery', 'Major_Pottery', 'Major_Basket'])

const getBuiltCardId = (choice: string | undefined): string | undefined => {
  if (!choice) return undefined
  return choice.replace(/^major:/, '').replace(/^minor:/, '')
}

const listener: CardListenerRegistration = {
  id: 'A131-craft-teacher-after-improvement',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['improvement'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const builtCardId = getBuiltCardId(context.choice)
    if (!builtCardId || !TRIGGER_MAJORS.has(builtCardId)) return
    return {
      flow: {
        type: 'xor',
        optional: true,
        children: [
          {
            type: 'leaf',
            actionId: 'occupation',
            sourceCard: CARD_ID,
            actionContext: { cost: {} },
          },
          {
            type: 'seq',
            children: [
              {
                type: 'leaf',
                actionId: 'occupation',
                sourceCard: CARD_ID,
                actionContext: { cost: {} },
              },
              {
                type: 'leaf',
                actionId: 'occupation',
                optional: true,
                sourceCard: CARD_ID,
                actionContext: { cost: {} },
              },
            ],
          },
        ],
      },
      sourceCard: CARD_ID,
    }
  },
}

const cardImpl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl

export const A131_CraftTeacher = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: 'Craft Teacher',
    deck: 'A',
    number: 131,
    category: 'ACTIONS_BOOSTER',
    desc: ["Each time after you build the major improvement __Joinery__, __Pottery__, and __Basketmaker's Workshop__, you can play up to 2 occupations without paying an occupation cost."],
    cost: {},
    players: '3+',
  },
  impl: cardImpl,
})

export const A131_CraftTeacher_impl = A131_CraftTeacher.impl
