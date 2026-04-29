import { MinorImprovement } from '../types'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import type { ActionChoiceOption, GameState } from '../../game/types'
import { getRoundPlacementOrder } from '../helpers/round-placement'
import { countPeopleOnSpace } from '../helpers/space-occupancy'
import { OCCUPIED_SPACE_CHOICE_PREFIX } from '../../actions/effects/placement-constants'
import type { CardImpl } from '../registry'

const CARD_ID = 'A25_Bassinet'
const MEETING_PLACE_ID = 'meeting-place'

function findFirstNonAccumSpaceThisRound(state: GameState): string | null {
  const startIdx = state.players.findIndex((p) => p.startPlayer)
  const N = state.players.length
  if (N === 0 || startIdx < 0) return null
  const turnOrder = Array.from({ length: N }, (_, i) => state.players[(startIdx + i) % N])
  const maxSlots = Math.max(0, ...turnOrder.map((p) => getRoundPlacementOrder(p).length))

  for (let slot = 0; slot < maxSlots; slot++) {
    for (const p of turnOrder) {
      const placements = getRoundPlacementOrder(p)
      if (slot >= placements.length) continue
      const spaceId = placements[slot]
      const space = state.actionSpaces.find((s) => s.id === spaceId)
      if (!space) continue
      if (Object.keys(space.gainPerRound).length > 0) continue
      return spaceId
    }
  }
  return null
}

const computeArgsListener: CardListenerRegistration = {
  id: 'A25-bassinet-compute-args-place-farmer',
  cardIds: [CARD_ID],
  phases: ['computeArgs' as ActionHookPhase],
  actions: ['place-farmer'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const targetId = findFirstNonAccumSpaceThisRound(context.state)
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

export const A25_Bassinet = new MinorImprovement({
  id: CARD_ID,
  name: 'Bassinet',
  deck: 'A',
  number: 25,
  category: 'ACTIONS_BOOSTER',
  desc: [
    'You can place a(nother) person on the first non-accumulating action space used in each work phase, if there is only 1 person, including newborns, on that space. (There can never be two people on __Meeting Place__.)',
  ],
  cost: {},
  vp: 0,
})

export const A25_Bassinet_impl = {
  listeners: [computeArgsListener],
  reaches: [] as readonly string[],
} satisfies CardImpl
