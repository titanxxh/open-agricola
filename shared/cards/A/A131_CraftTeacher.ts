import { Occupation } from '../types'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import type { CardImpl } from '../registry'

const CARD_ID = 'A131_CraftTeacher'

const TRIGGER_MAJORS = new Set(['Major_Joinery', 'Major_Pottery', 'Major_Basket'])

const getBuiltCardId = (choice: string | undefined): string | undefined => {
  if (!choice) return undefined
  return choice.replace(/^major:/, '').replace(/^minor:/, '')
}

// A131 Craft Teacher: Each time after you build the major improvements Joinery, Pottery,
// or Basketmaker's Workshop, you can play up to 2 occupations without paying an occupation cost.
// BGA: checks improvement is a major, and card ID in [Major_Joinery, Major_Pottery, Major_Basket]
// NOTE: This card is marked banned in BGA; implementing as-designed.
const listener: CardListenerRegistration = {
  id: 'A131-craft-teacher-after-improvement',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['improvement-any'],
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
            actionId: 'play-occupation',
            sourceCard: CARD_ID,
            actionContext: { cost: {} },
          },
          {
            type: 'seq',
            children: [
              {
                type: 'leaf',
                actionId: 'play-occupation',
                sourceCard: CARD_ID,
                actionContext: { cost: {} },
              },
              {
                type: 'leaf',
                actionId: 'play-occupation',
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

export const A131_CraftTeacher = new Occupation({
  id: CARD_ID,
  name: 'Craft Teacher',
  deck: 'A',
  number: 131,
  category: 'ACTIONS_BOOSTER',
  desc: ["Each time after you build the major improvement __Joinery__, __Pottery__, and __Basketmaker's Workshop__, you can play up to 2 occupations without paying an occupation cost."],
  cost: {},
  players: '3+',
})

export const A131_CraftTeacher_impl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl
