import { defineOccupationCard } from '../card-source'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import type { ActionChoiceOption } from '../../contract/types'
import { OCCUPIED_SPACE_CHOICE_PREFIX } from '../../actions/helpers/placement-constants'
import { isSpaceOccupied } from '../../domain/space'
import { workersAvailable } from '../../domain/player'
import type { CardImpl } from '../registry'
import { isTravelingPlayersSpaceId } from '../helpers/action-space-categories'

const CARD_ID = 'D151_SpinDoctor'
const listener: CardListenerRegistration = {
  id: 'D151-spin-doctor-after-place-farmer',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['place-farmer'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!isTravelingPlayersSpaceId(context.space?.id)) return
    if (workersAvailable(context.state, context.player) <= 0) return
    const constraints = context.state.actionSpaces
      .filter((space) => space.id !== 'meeting-place' || !isSpaceOccupied(space))
      .map((space) => space.id)
    return {
      flow: {
        type: 'seq',
        optional: true,
        children: [
          {
            type: 'leaf',
            actionId: 'place-farmer',
            optional: true,
            sourceCard: CARD_ID,
            actionContext: { constraints },
          },
        ],
      },
      sourceCard: CARD_ID,
    }
  },
}

const computeArgsListener: CardListenerRegistration = {
  id: 'D151-spin-doctor-compute-args-place-farmer',
  cardIds: [CARD_ID],
  phases: ['computeArgs' as ActionHookPhase],
  actions: ['place-farmer'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.sourceCard !== CARD_ID) return
    const extraOptions: ActionChoiceOption[] = context.state.actionSpaces
      .filter((space) => space.id !== 'meeting-place' && isSpaceOccupied(space))
      .map((space) => ({
        value: `${OCCUPIED_SPACE_CHOICE_PREFIX}${space.id}`,
        labelKey: space.nameKey,
        sourceCard: CARD_ID,
      }))
    if (extraOptions.length === 0) return
    return { extraOptions, sourceCard: CARD_ID }
  },
}

const cardImpl = {
  listeners: [listener, computeArgsListener],
  reaches: [] as readonly string[],
} satisfies CardImpl

export const D151_SpinDoctor = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: 'Spin Doctor',
    deck: 'D',
    number: 151,
    category: 'ACTIONS_BOOSTER',
    desc: ['Immediately after each time you use the __Traveling Players__ accumulation space, you can place another person on an action space of your choice, regardless whether or not the action space is occupied.'],
    rules: ['No card, including this one, can allow you to use __Meeting Place__ if it is already occupied.'],
    cost: {},
    players: '4+',
  },
  impl: cardImpl,
})

export const D151_SpinDoctor_impl = D151_SpinDoctor.impl
