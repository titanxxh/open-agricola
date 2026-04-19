import { Occupation } from '../types'
import { registerCardListener } from '../card-listeners'
import type { CardListenerContext, CardListenerRegistration } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import type { ActionChoiceOption, ActionSpace, GameState, PlayerState } from '../../game/types'
import { OCCUPIED_SPACE_CHOICE_PREFIX } from '../../actions/effects/placement-constants'
import { gainLeaf } from '../helpers/pay-gain-node'
import { isSpaceOccupied } from '../../game/space'

const CARD_ID = 'B151_LittlePeasant'

const canIgnoreOccupiedSpaces = (player: PlayerState) =>
  player.houseType === 'wood' && player.rooms === 2

const isMeetingPlace = (space: ActionSpace) => space.id === 'meeting-place'

const getOpenRound = (state: GameState, space: ActionSpace) => {
  const roundIndex = state.roundActionOrder.findIndex((spaceId) => spaceId === space.id)
  return roundIndex === -1 ? space.roundAvailable : roundIndex + 1
}

const isOpenSpace = (state: GameState, space: ActionSpace) => {
  return state.round >= getOpenRound(state, space)
}

const onPlayListener: CardListenerRegistration = {
  id: 'B151-little-peasant-after-play',
  phases: ['after' as ActionHookPhase],
  actions: ['play-occupation'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.choice !== CARD_ID) return
    return { flow: gainLeaf(CARD_ID, { stone: 1 }), sourceCard: CARD_ID }
  },
}

const computeArgsListener: CardListenerRegistration = {
  id: 'B151-little-peasant-compute-args-place-farmer',
  cardIds: [CARD_ID],
  phases: ['computeArgs' as ActionHookPhase],
  actions: ['place-farmer'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!canIgnoreOccupiedSpaces(context.player)) return
    const extraOptions: ActionChoiceOption[] = context.state.actionSpaces
      .filter((space) =>
        isOpenSpace(context.state, space) &&
        !isMeetingPlace(space) &&
        isSpaceOccupied(space) &&
        space.canBeExecutedByPlayer(context.state, context.player),
      )
      .map((space) => ({
        value: `${OCCUPIED_SPACE_CHOICE_PREFIX}${space.id}`,
        labelKey: space.nameKey,
      }))
    if (extraOptions.length === 0) return
    return { extraOptions, sourceCard: CARD_ID }
  },
}

registerCardListener(onPlayListener)
registerCardListener(computeArgsListener)

export const B151_LittlePeasant = new Occupation({
  id: CARD_ID,
  name: "Little Peasant",
  deck: "B",
  number: 151,
  category: "ACTIONS_BOOSTER",
  desc: ["You immediately get 1 <STONE>. As long as you live in a wooden house with exactly 2 rooms, actions spaces—excluding Meeting Place—are not considered occupied for you."],
  cost: {},
  players: "4+",
  newSet: true,
})
