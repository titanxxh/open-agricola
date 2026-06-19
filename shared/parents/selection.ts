import type {
  GameState,
  ParentSelectionState,
  ParentSelectionSubmission,
} from '../contract/types'
import { appendImmediateEvents, type ImmediateEventDraft } from '../events/append'
import { createRng, shuffleWithRng } from '../utils/rng'
import {
  FATHER_PARENT_CARD_IDS,
  MOTHER_PARENT_CARD_IDS,
  isFatherParentCardId,
  isMotherParentCardId,
} from './ids'
import { getParentCardDefinition } from './cards'
import type { FatherParentCardId, MotherParentCardId } from './types'
import { queueSelectedMotherRewards } from './mother-rewards'

const dealParentIds = <T extends string>(
  ids: readonly T[],
  seed: number,
  salt: number,
): T[] => shuffleWithRng([...ids], createRng(seed + salt)) as T[]

export const createParentSelectionState = (
  playerIds: readonly string[],
  seed: number,
): ParentSelectionState => {
  const mothers = dealParentIds(MOTHER_PARENT_CARD_IDS, seed, 0x510001)
  const fathers = dealParentIds(FATHER_PARENT_CARD_IDS, seed, 0x520001)
  const candidates: ParentSelectionState['candidates'] = {}
  const submissions: ParentSelectionState['submissions'] = {}
  playerIds.forEach((playerId, index) => {
    candidates[playerId] = {
      mother: mothers.slice(index * 2, index * 2 + 2) as MotherParentCardId[],
      father: fathers.slice(index * 2, index * 2 + 2) as FatherParentCardId[],
    }
    submissions[playerId] = null
  })
  return { candidates, submissions }
}

export const startParentSelectionIfNeeded = (state: GameState): void => {
  if (!state.enableParentCards || state.parentSelection || state.phase !== 'playing') return
  const alreadySelected = state.players.every(
    (player) => player.parentCards.mother && player.parentCards.father,
  )
  if (alreadySelected) return
  state.parentSelection = createParentSelectionState(
    state.players.map((player) => player.id),
    state.gameSeed,
  )
  state.phase = 'parent-selection'
  completeParentSelectionIfReady(state)
}

const autoSubmitForcedParentSelections = (state: GameState): void => {
  const selection = state.parentSelection
  if (!selection) return
  state.players.forEach((player) => {
    if (selection.submissions[player.id]) return
    const candidates = selection.candidates[player.id]
    const mother = candidates?.mother[0]
    const father = candidates?.father[0]
    if (candidates?.mother.length !== 1 || candidates.father.length !== 1) return
    if (!isMotherParentCardId(mother) || !isFatherParentCardId(father)) return
    selection.submissions[player.id] = { mother, father }
  })
}

const motherRewardLogValue = (mother: MotherParentCardId): string | null => {
  const card = getParentCardDefinition(mother)
  if (card?.kind !== 'mother') return null
  if (card.gain.type === 'resource') return card.gain.resource
  return card.gain.type
}

export const ensureParentMotherScheduleLogs = (state: GameState): void => {
  if (!state.enableParentCards || state.phase !== 'playing') return
  const existingCardIds = new Set(
    state.log
      .filter((entry) => entry.key === 'log.parentMotherScheduled')
      .map((entry) => entry.params?.cardId)
      .filter((cardId): cardId is string => typeof cardId === 'string'),
  )
  const missing: ImmediateEventDraft[] = state.players.flatMap((player) => {
    const mother = player.parentCards.mother
    if (!mother) return []
    const card = getParentCardDefinition(mother)
    const reward = motherRewardLogValue(mother)
    if (card?.kind !== 'mother' || !reward) return []
    if (existingCardIds.has(card.id)) return []
    return [{
      type: 'parent.motherScheduled',
      actorPlayerId: player.id,
      playerId: player.id,
      cardId: card.id,
      targetRound: card.round,
      reward,
    }]
  })
  appendImmediateEvents(state, missing)
}

const completeParentSelectionIfReady = (state: GameState): void => {
  const selection = state.parentSelection
  if (!selection) return
  autoSubmitForcedParentSelections(state)
  const submissions = state.players.map((player) => selection.submissions[player.id])
  if (submissions.some((submission) => submission === null)) return
  state.players.forEach((player) => {
    const submission = selection.submissions[player.id]
    if (!submission) return
    player.parentCards = {
      mother: submission.mother,
      father: submission.father,
    }
  })
  state.parentSelection = null
  state.phase = 'playing'
  queueSelectedMotherRewards(state)
  ensureParentMotherScheduleLogs(state)
}

export const submitParentSelection = (
  state: GameState,
  playerId: string,
  submission: ParentSelectionSubmission,
): { ok: true } | { ok: false; error: string } => {
  if (!state.enableParentCards) return { ok: false, error: 'parent cards are not enabled' }
  if (state.phase !== 'parent-selection' || !state.parentSelection) {
    return { ok: false, error: 'not in parent-selection phase' }
  }
  const candidates = state.parentSelection.candidates[playerId]
  if (!candidates) return { ok: false, error: 'unknown player' }
  if (state.parentSelection.submissions[playerId]) {
    return { ok: false, error: 'parent selection already submitted' }
  }
  if (!isMotherParentCardId(submission.mother)) {
    return { ok: false, error: 'invalid mother parent card' }
  }
  if (!isFatherParentCardId(submission.father)) {
    return { ok: false, error: 'invalid father parent card' }
  }
  if (!candidates.mother.includes(submission.mother)) {
    return { ok: false, error: 'mother parent card not in candidates' }
  }
  if (!candidates.father.includes(submission.father)) {
    return { ok: false, error: 'father parent card not in candidates' }
  }
  state.parentSelection.submissions[playerId] = submission
  completeParentSelectionIfReady(state)
  return { ok: true }
}
