import type { ActionDefinition, ActionFlow, ActionSpace, GameState, PlayerState } from '../../../contract/types'
import { recordRoundPlacement } from '../../../cards/helpers/round-placement'
import { smallestAvailableWorker, workersAvailable } from '../../../domain/player'
import { dispatchableGuests, findDispatchableGuest } from '../../../domain/guests'
import { addWorkerRef, findActionSpaceById } from '../../../domain/space'
import { createCardWorkerSpace } from '../../../domain/card-worker-space'

const ensureCardPseudoSpace = (state: GameState, cardId: string): ActionSpace => {
  const spaceId = `card-worker:${cardId}`
  const existing = findActionSpaceById(state, spaceId)
  if (existing) return existing
  const space = createCardWorkerSpace(cardId)
  state.actionSpaces.push(space)
  return space
}

/** Marks a card's spend whose person has been chosen as a family member. */
const FAMILY_PERSON_KEY = 'familyPerson'

/** The Guests of this round a card may take instead of a family member. */
const cardSpendGuests = (state: GameState, player: PlayerState, sourceCard: string | undefined, actionContext: Record<string, unknown> | undefined) =>
  sourceCard === undefined || actionContext?.guestId !== undefined || actionContext?.[FAMILY_PERSON_KEY] === true
    ? [] : dispatchableGuests(state, player)

export const spendWorkerAction: ActionDefinition = {
  id: 'spend-worker',
  nameKey: 'actions.spend-worker.name',
  descriptionKey: 'actions.spend-worker.description',
  roundAvailable: 1,
  gainPerRound: {},
  canBeExecutedByPlayer: (state, player, context) => context?.actionContext?.guestId !== undefined
    ? findDispatchableGuest(state, player, context.actionContext.guestId) !== undefined
    : workersAvailable(state, player) > 0 || cardSpendGuests(state, player, context?.sourceCard, context?.actionContext).length > 0,
  execute: ({ state, player, sourceCard, actionContext, eventSink }) => {
    // A card that takes another person may take a Guest of this round instead of a family member.
    const guests = cardSpendGuests(state, player, sourceCard, actionContext)
    if (guests.length > 0) {
      const choices: ActionFlow[] = [
        ...(workersAvailable(state, player) > 0 ? [{
          type: 'leaf' as const, actionId: 'spend-worker', sourceCard,
          actionContext: { ...actionContext, [FAMILY_PERSON_KEY]: true }, choiceLabelKey: 'actions.place-farmer.name',
        }] : []),
        ...guests.map((guest): ActionFlow => ({
          type: 'leaf', actionId: 'spend-worker', sourceCard, actionContext: { ...actionContext, guestId: guest.id },
          choiceLabelKey: 'actions.activate-extra-turn.name',
          choiceLabelParams: { guestId: guest.id, guestCardId: guest.sourceCardId },
        })),
      ]
      return { type: 'flow', flow: choices.length === 1 ? choices[0]! : { type: 'xor', children: choices } }
    }
    const guest = actionContext?.guestId === undefined ? undefined : findDispatchableGuest(state, player, actionContext.guestId)
    if (actionContext?.guestId !== undefined && !guest) return { type: 'fail', errorKey: 'log.placeFarmerFail' }
    const worker = guest ? undefined : smallestAvailableWorker(state, player)
    const personId = guest?.id ?? worker?.id
    if (!personId) {
      return { type: 'fail', errorKey: 'log.placeFarmerFail' }
    }
    if (guest) guest.dispatched = true

    const roundPlacementId =
      typeof actionContext?.roundPlacementId === 'string'
        ? actionContext.roundPlacementId
        : sourceCard
          ? `card:${sourceCard}`
          : undefined

    if (sourceCard) {
      const space = ensureCardPseudoSpace(state, sourceCard)
      addWorkerRef(space, player.id, personId)
    }

    if (roundPlacementId) {
      const personUse = recordRoundPlacement(player, roundPlacementId, personId)
      eventSink?.emit<'worker.useCompleted'>({ type: 'worker.useCompleted', ...personUse })
    }
    return { type: 'ok' }
  },
}
