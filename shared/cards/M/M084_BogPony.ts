import { defineMinorCard } from '../card-source'
import type {
  ActionDefinition,
  ActionExecutionResult,
  PlayerState,
} from '../../contract/types'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { registerAdHocAction } from '../../actions/helpers/ad-hoc-action-registry'
import {
  readPrivateAnimalCounts,
  writePrivateAnimalCounts,
} from '../../domain/animal-holder-state'
import { getAssignedAnimalsByType, subtractAnimalsFromBoard } from '../../domain/animals'
import { ensureCardState } from '../helpers/card-state'
import type { CardListenerContext, CardListenerRegistration } from '../card-listeners'
import type { CardImpl } from '../registry'

const CARD_ID = 'M084_BogPony'
const ACTION_ID = 'card_M084_BogPony_lie-horse'

const countStandingHorses = (player: PlayerState): number => {
  return getAssignedAnimalsByType(player).horse ?? 0
}

const moveStandingHorseToCard = (player: PlayerState): boolean => {
  if (countStandingHorses(player) <= 0) return false
  const totalHorses = player.resources.horse ?? 0
  subtractAnimalsFromBoard(player, { horse: 1 })
  player.resources.horse = totalHorses
  return true
}

const lieHorse = (player: PlayerState): ActionExecutionResult => {
  if (!moveStandingHorseToCard(player)) return { type: 'fail', errorKey: 'log.specialEffectFail' }
  const cardState = ensureCardState(player, CARD_ID)
  const extraData = { ...((cardState.extraData as Record<string, unknown> | undefined) ?? {}) }
  const counts = readPrivateAnimalCounts(extraData)
  counts.horse = (counts.horse ?? 0) + 1
  writePrivateAnimalCounts(extraData, counts)
  cardState.extraData = extraData
  player.resources.fuel = (player.resources.fuel ?? 0) + 2
  return { type: 'ok' }
}

export const bogPonyLieHorseAction: ActionDefinition = {
  id: ACTION_ID,
  nameKey: 'cards.M084_BogPony.anytime',
  descriptionKey: 'cards.M084_BogPony.anytime',
  roundAvailable: 1,
  gainPerRound: {},
  canBeExecutedByPlayer: () => true,
  execute: ({ player }) => lieHorse(player),
}

registerAdHocAction(bogPonyLieHorseAction)

const anytimeListener: CardListenerRegistration = {
  id: 'M084-bog-pony-anytime',
  cardIds: [CARD_ID],
  phases: ['anytime' as ActionHookPhase],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (countStandingHorses(context.player) <= 0) return
    return {
      flow: { type: 'leaf', actionId: ACTION_ID, sourceCard: CARD_ID },
      sourceCard: CARD_ID,
      labelKey: 'cards.M084_BogPony.anytime',
    }
  },
}

const cardImpl = {
  listeners: [anytimeListener],
  effect: { id: CARD_ID },
  reaches: [] as readonly string[],
} satisfies CardImpl

export const M084_BogPony = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Bog Pony",
    deck: "M",
    number: 84,
    category: "GOODS_PROVIDER",
    desc: [
        "At any time, you can lie a standing horse on its side to get 2 fuel. Lying horses do not count for breeding and are only worth 1/2 point during scoring. They can, however, be turned into food with an appropriate improvement."
    ],
    cost: {},
    prerequisite: "1 Major Improvement",
    implemented: true,
    requiresFarmersOfTheMoor: true,
  },
  impl: cardImpl,
})

export const M084_BogPony_impl = M084_BogPony.impl
