import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import type { CardImpl } from '../registry'
import { A131_CraftTeacher } from '../../cards-display/A/A131_CraftTeacher'

const CARD_ID = A131_CraftTeacher.id

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

export const A131_CraftTeacher_impl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl
