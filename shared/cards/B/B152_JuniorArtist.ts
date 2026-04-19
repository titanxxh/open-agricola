import { Occupation } from '../types'
import { registerCardListener } from '../card-listeners'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import type { ActionFlow, PlayerState, Resource } from '../../game/types'
import { payLeaf } from '../helpers/pay-gain-node'
import { isSpaceOccupied } from '../../game/space'

const CARD_ID = 'B152_JuniorArtist'

// B152 Junior Artist: Each time after you use the Day Laborer action space, you can pay 1 food
// to use an unoccupied Traveling Players or Lessons action space with the same person.
//
// BGA (php): listens to PlaceFarmer on DayLaborer, returns optional SEQ:
//   [pay 1 food, XOR[useActionSpace(ActionLessons4), useActionSpace(ActionLessons), useActionSpace(ActionTravelingPlayers)]]
//
// We inline each action's effect as leaf flow. For traveling-players we gain the accumulated
// food. For lessons/lessons-4 we run play-occupation with its proper cost override.

const getLessonsCostForSpace = (player: PlayerState, spaceId: string): Partial<Resource> => {
  if (spaceId === 'lessons-4') {
    const base = player.occupationPlayed.length <= 1 ? 1 : 2
    return base > 0 ? { food: base } : {}
  }
  // lessons
  const base = player.occupationPlayed.length === 0 ? 0 : 1
  return base > 0 ? { food: base } : {}
}

const canPlaySomeOccupation = (player: PlayerState, cost: Partial<Resource>): boolean => {
  // Check if any occupation in hand can be afforded (after paying the food for cost).
  // We approximate affordability: must have enough food remaining after this cost + 1 (for the card's own pay).
  const totalFood = player.resources.food ?? 0
  const requiredFood = (cost.food ?? 0) + 1 // +1 for Junior Artist's own pay
  if (totalFood < requiredFood) return false
  // At least one occupation in hand
  return player.occupationHand.length > 0
}

const buildChainedOption = (
  context: CardListenerContext,
  spaceId: string,
): ActionFlow | null => {
  const space = context.state.actionSpaces.find((s) => s.id === spaceId)
  if (!space) return null
  if (isSpaceOccupied(space)) return null
  if (!space.canBeExecutedByPlayer(context.state, context.player)) return null

  if (spaceId === 'lessons' || spaceId === 'lessons-4') {
    const cost = getLessonsCostForSpace(context.player, spaceId)
    if (!canPlaySomeOccupation(context.player, cost)) return null
    return {
      type: 'leaf',
      actionId: 'play-occupation',
      params: { costOverride: cost },
      sourceCard: CARD_ID,
      actionContext: { trueAction: false },
    }
  }

  if (spaceId === 'traveling-players') {
    const food = space.resources.food ?? 0
    if (food <= 0) return null
    return {
      type: 'leaf',
      actionId: 'gain',
      params: { food },
      sourceCard: CARD_ID,
      actionContext: { trueAction: false, fromSpace: spaceId },
    }
  }

  return null
}

const listener: CardListenerRegistration = {
  id: 'B152-junior-artist-after-place-farmer',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['place-farmer'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.space?.id !== 'day-laborer') return
    if ((context.player.resources.food ?? 0) < 1) return

    const children: ActionFlow[] = []
    for (const spaceId of ['lessons-4', 'lessons', 'traveling-players']) {
      const option = buildChainedOption(context, spaceId)
      if (option) children.push(option)
    }
    if (children.length === 0) return

    const chained: ActionFlow =
      children.length === 1
        ? children[0]!
        : { type: 'xor', children }

    return {
      flow: {
        type: 'seq',
        optional: true,
        choiceLabelKey: 'cards.B152_JuniorArtist.choice',
        children: [
          payLeaf({ cardId: CARD_ID, cost: { food: 1 } }),
          chained,
        ],
      },
      sourceCard: CARD_ID,
    }
  },
}

// When the traveling-players branch is taken, zero out the space's food after the gain.
const zeroSpaceListener: CardListenerRegistration = {
  id: 'B152-junior-artist-zero-traveling-players',
  cardIds: [CARD_ID],
  phases: ['immediatelyAfter' as ActionHookPhase],
  actions: ['gain'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.actionContext?.fromSpace !== 'traveling-players') return
    const space = context.state.actionSpaces.find((s) => s.id === 'traveling-players')
    if (!space) return
    space.resources.food = 0
  },
}

registerCardListener(listener)
registerCardListener(zeroSpaceListener)

export const B152_JuniorArtist = new Occupation({
  id: CARD_ID,
  name: 'Junior Artist',
  deck: 'B',
  number: 152,
  category: 'ACTIONS_BOOSTER',
  desc: [
    'Each time after you use the __Day Laborer__ action space, you can pay 1 <FOOD> to use an unoccupied __Traveling Players__ or __Lessons__ action space with the same person.',
  ],
  cost: {},
  players: '4+',
  newSet: true,
})
