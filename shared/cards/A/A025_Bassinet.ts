import { defineMinorCard } from '../card-source'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import type { ActionChoiceOption, GameState } from '../../contract/types'
import { countPeopleOnSpace } from '../helpers/space-occupancy'
import { OCCUPIED_SPACE_CHOICE_PREFIX } from '../../actions/helpers/placement-constants'
import type { CardImpl } from '../registry'

const CARD_ID = 'A025_Bassinet'
const MEETING_PLACE_ID = 'meeting-place'

function findFirstNonAccumSpaceThisWorkPhase(state: GameState): string | null {
  if (state.roundPhase !== 'work') return null
  for (const event of state.events) {
    if (
      event.round !== state.round ||
      event.phase !== 'work' ||
      event.type !== 'worker.placed'
    ) continue
    const space = state.actionSpaces.find((candidate) => candidate.id === event.spaceId)
    if (!space || Object.keys(space.gainPerRound).length > 0) continue
    return space.id
  }
  return null
}

const computeArgsListener: CardListenerRegistration = {
  id: 'A25-bassinet-compute-args-place-farmer',
  cardIds: [CARD_ID],
  phases: ['computeArgs' as ActionHookPhase],
  actions: ['place-farmer'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const targetId = findFirstNonAccumSpaceThisWorkPhase(context.state)
    if (!targetId) return
    if (targetId === MEETING_PLACE_ID) return
    if (countPeopleOnSpace(context.state, targetId) !== 1) return
    const space = context.state.actionSpaces.find((s) => s.id === targetId)
    if (!space) return
    if (!space.canBeExecutedByPlayer(context.state, context.player)) return
    const extraOptions: ActionChoiceOption[] = [
      { value: `${OCCUPIED_SPACE_CHOICE_PREFIX}${targetId}`, labelKey: space.nameKey },
    ]
    return { extraOptions, sourceCard: CARD_ID }
  },
}

const cardImpl = {
  listeners: [computeArgsListener],
  reaches: [] as readonly string[],
} satisfies CardImpl

export const A025_Bassinet = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: 'Bassinet',
    deck: 'A',
    number: 25,
    category: 'ACTIONS_BOOSTER',
    desc: [
        'You can place a(nother) person on the first non-accumulating action space used in each work phase, if there is only 1 person, including newborns, on that space. (There can never be two people on __Meeting Place__.)',
      ],
    cost: { wood: 1, reed: 1 },
    vp: 0,
  },
  impl: cardImpl,
})

export const A025_Bassinet_impl = A025_Bassinet.impl
