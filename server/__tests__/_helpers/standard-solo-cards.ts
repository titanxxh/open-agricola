import assert from 'node:assert/strict'
import { expect } from 'vitest'
import { GameSession, type SessionResponse } from '../../game/authoritative-session'
import type { GameState } from '../../../shared/contract/types'
import { setActiveWorkerCount } from '../../../shared/domain/player'
import { captureStateWithHistory } from '../../../shared/session/history-streams'
import { rehydrateState, serializeSessionSnapshot } from '../../../shared/session/serialization'
import { createWorkSession } from './session-fixtures'
import { getChoiceOptions } from './session-assertions'

export const TERRAIN_CARD = 'moor-special-1-2-terrain'
export const HORSE_CARD = 'moor-special-1-5-6-horse'
export const work = ({ playerCount = 2, round = 8, seed = 14100, moor = true, configure }: {
  playerCount?: number
  round?: number
  seed?: number
  moor?: boolean
  configure?: (state: GameState) => void
} = {}) => createWorkSession({ seed, options: { playerCount, enableFarmersOfTheMoor: moor, deckIds: ['A'] }, configure(state) {
  state.round = round
  for (const player of state.players) {
    for (const key of Object.keys(player.resources)) Reflect.set(player.resources, key, 0)
    player.resources.food = 20
    if (moor) player.resources.fuel = 10
    player.rooms = 2
    player.houseType = 'wood'
    player.roomTiles = [{ row: 2, col: 3 }, { row: 2, col: 4 }]
    player.fields = [{ row: 0, col: 1, stacks: [] }]
    player.pastures = []
    player.stableTiles = []
    player.houseAnimals = {}
    player.farmTerrain = moor ? [{ row: 0, col: 0, kind: 'forest' }, { row: 2, col: 0, kind: 'moor' }] : []
    player.minorPlayed = []
    player.occupationPlayed = []
    player.improvements = []
    player.cardStates = {}
    setActiveWorkerCount(player, 2)
  }
  if (playerCount === 1 && state.farmersOfTheMoor) {
    state.farmersOfTheMoor.soloRetentionPaid = false
    let order = 0
    for (const card of state.farmersOfTheMoor.specialActionCards) card.location = card.id === TERRAIN_CARD
      ? { kind: 'solo-current' } : { kind: 'solo-draw', order: order++ }
  }
  configure?.(state)
  const minors = new Set(state.players.flatMap(player => [...player.minorHand, ...player.minorPlayed]))
  const occupations = new Set(state.players.flatMap(player => [...player.occupationHand, ...player.occupationPlayed]))
  state.ordinaryCardDecks.minor = state.ordinaryCardDecks.minor.filter(id => !minors.has(id))
  state.ordinaryCardDecks.occupation = state.ordinaryCardDecks.occupation.filter(id => !occupations.has(id))
} })

export const openMinor = (session: GameSession, actor = 0, space = 'meeting-place') => {
  let response = session.takeAction(actor, space)
  expect(response.ok, response.error).toBe(true)
  const branch = getChoiceOptions(response).find(option => option.value.startsWith('action-improvement-'))
  if (branch) response = session.resolveChoice(actor, branch.value)
  expect(response.ok, response.error).toBe(true)
  return response
}

export const buyMinor = (session: GameSession, cardId: string, actor = 0, space = 'meeting-place') => {
  let response = openMinor(session, actor, space)
  const option = getChoiceOptions(response).find(option => option.value === cardId || option.value === `minor:${cardId}`)
  if (option) response = session.resolveChoice(actor, option.value)
  expect(response.ok, response.error).toBe(true)
  expect(response.state.players[actor]!.minorHand).not.toContain(cardId)
  return response
}

export const acceptCard = (session: GameSession, response: SessionResponse, cardId: string) => {
  expect(response.ok, response.error).toBe(true)
  expect(response.interaction).toMatchObject({ stateId: 'wait', sourceCard: cardId, request: { kind: 'choice' } })
  const options = getChoiceOptions(response).filter(option => option.value !== '__skip__')
  expect(options).toHaveLength(1)
  assert.ok(response.interaction.stateId === 'wait')
  return session.resolveChoice(response.interaction.playerIndex, options[0]!.value)
}

export const restore = (session: GameSession): GameSession => {
  const before = captureStateWithHistory(session.state)
  const interaction = structuredClone(session.getState().interaction)
  const saved = session.withCtx(() => serializeSessionSnapshot(session.state, session))
  const restored = new GameSession(rehydrateState(JSON.parse(JSON.stringify(saved))))
  try {
    expect(captureStateWithHistory(restored.state)).toEqual(before)
    expect(restored.getState().interaction).toEqual(interaction)
    return restored
  } catch (error) {
    restored.dispose()
    throw error
  }
}

export const chooseCardAction = (session: GameSession, response: SessionResponse, sourceCard: string,
  cardId: string, actionId: string, tile?: { row: number; col: number }) => {
  expect(response.interaction).toMatchObject({ stateId: 'wait', sourceCard, request: { kind: 'choice' } })
  const value = ['card-action', cardId, 'action', actionId, ...(tile ? [tile.row, tile.col] : [])].join(':')
  const option = getChoiceOptions(response).find(option => option.value === value)
  assert.ok(option, JSON.stringify(response.interaction))
  assert.ok(response.interaction.stateId === 'wait')
  return session.resolveChoice(response.interaction.playerIndex, option.value)
}
