import { defineMinorCard } from '../card-source'
import type {
  ActionDefinition,
  ActionExecutionResult,
  GameState,
  ActionMutationContext,
  PlayerState,
} from '../../contract/types'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainAction } from '../../actions/effects/gain'
import { registerAdHocAction } from '../../actions/helpers/ad-hoc-action-registry'
import {
  getBogPonyLyingHorseCount,
  writeBogPonyLyingHorseCount,
} from './M084_BogPony-state'
import { getAssignedAnimalsByType, subtractAnimalsFromBoard } from '../../domain/animals'
import { ensureCardState } from '../helpers/card-state'
import type { CardListenerContext, CardListenerRegistration } from '../card-listeners'
import type { CardImpl } from '../registry'
import type { AnimalKey } from '../../contract/animals'

const CARD_ID = 'M084_BogPony'
const ACTION_ID = 'card_M084_BogPony_lie-horse'

const countStandingHorses = (state: GameState | undefined, player: PlayerState): number => {
  const lyingHorses = getBogPonyLyingHorseCount(player)
  return Math.max(0, (getAssignedAnimalsByType(player, state).horse ?? 0) - lyingHorses)
}

const lieHorse = (ctx: ActionMutationContext): ActionExecutionResult => {
  const { state, player } = ctx
  if (countStandingHorses(state, player) <= 0) return { type: 'fail', errorKey: 'log.specialEffectFail' }
  const cardState = ensureCardState(player, CARD_ID)
  const extraData = { ...((cardState.extraData as Record<string, unknown> | undefined) ?? {}) }
  writeBogPonyLyingHorseCount(extraData, getBogPonyLyingHorseCount(player) + 1)
  cardState.extraData = extraData
  return gainAction.execute({
    ...ctx,
    params: { fuel: 2 },
    sourceCard: ctx.sourceCard ?? CARD_ID,
  })
}

const consumeLyingHorses = (
  state: GameState | undefined,
  player: PlayerState,
  animalType: AnimalKey,
  amount: number,
): number => {
  if (animalType !== 'horse') return 0
  const current = getBogPonyLyingHorseCount(player)
  const assigned = getAssignedAnimalsByType(player, state).horse ?? 0
  const take = Math.min(current, assigned, Math.max(0, Math.floor(amount)))
  if (take <= 0) return 0
  const extraData = player.cardStates?.[CARD_ID]?.extraData as Record<string, unknown> | undefined
  if (!extraData) return 0
  writeBogPonyLyingHorseCount(extraData, current - take)
  subtractAnimalsFromBoard(player, { horse: take }, state)
  return take
}

const consumeRemovedLyingHorseMarkers = (player: PlayerState, animalType: AnimalKey, amount: number): void => {
  if (animalType !== 'horse') return
  const current = getBogPonyLyingHorseCount(player)
  const take = Math.min(current, Math.max(0, Math.floor(amount)))
  if (take <= 0) return
  const extraData = player.cardStates?.[CARD_ID]?.extraData as Record<string, unknown> | undefined
  if (!extraData) return
  writeBogPonyLyingHorseCount(extraData, current - take)
}

export const bogPonyLieHorseAction: ActionDefinition = {
  id: ACTION_ID,
  nameKey: 'cards.M084_BogPony.anytime',
  descriptionKey: 'cards.M084_BogPony.anytime',
  roundAvailable: 1,
  gainPerRound: {},
  canBeExecutedByPlayer: () => true,
  execute: (ctx) => lieHorse(ctx),
}

registerAdHocAction(bogPonyLieHorseAction)

const anytimeListener: CardListenerRegistration = {
  id: 'M084-bog-pony-anytime',
  cardIds: [CARD_ID],
  phases: ['anytime' as ActionHookPhase],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (countStandingHorses(context.state, context.player) <= 0) return
    return {
      flow: { type: 'leaf', actionId: ACTION_ID, sourceCard: CARD_ID },
      sourceCard: CARD_ID,
      labelKey: 'cards.M084_BogPony.anytime',
    }
  },
}

const cardImpl = {
  listeners: [anytimeListener],
  effect: {
    id: CARD_ID,
    computeBreedableAnimalCount: (_state, player, animalType, currentCount) => {
      if (animalType !== 'horse') return undefined
      return Math.max(0, currentCount - getBogPonyLyingHorseCount(player))
    },
    computeAnimalScoreAdjustment: (_state, player, animalType, ctx) => {
      if (animalType !== 'horse') return undefined
      return Math.min(ctx.quantity, getBogPonyLyingHorseCount(player)) * -0.5
    },
    consumeAnimalPayment: (state, player, animalType, amount) =>
      consumeLyingHorses(state, player, animalType, amount),
    onAnimalRemoved: (_state, player, animalType, amount) =>
      consumeRemovedLyingHorseMarkers(player, animalType, amount),
  },
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
