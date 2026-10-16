import { afterEach, describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { createWorkSession } from './_helpers/session-fixtures'
import { serializeSessionSnapshot, serializeState, rehydrateState } from '../../shared/session/serialization'
import { getUsedFarmyardTileKeys } from '../../shared/domain/farmyard-usage'
import { readCardResourceStats } from '../../shared/cards/helpers/card-state'
import type { GameState } from '../../shared/contract/types'

const CARD = 'A040_PottersYard'
const sessions: GameSession[] = []
afterEach(() => sessions.splice(0).forEach(session => session.dispose()))
const original = ['0-3', '0-4', '1-4', '2-3', '2-4']
const tokens = (state: GameState, index = 0) => (state.players[index]!.farmyardSpaceStates ?? [])
  .filter(token => token.sourceCardId === CARD && token.kind === 'farmyard-goods-token')
const keys = (state: GameState, index = 0) => tokens(state, index).map(token => token.spaceKey).sort()
const options = (response: SessionResponse) => response.interaction.stateId === 'wait' ? response.interaction.request.options ?? [] : []
function choose(session: GameSession, response: SessionResponse, value: string) {
  const option = options(response).find(option => option.value === value)
  if (value !== 'confirm') expect(option, JSON.stringify(response.interaction)).toBeDefined()
  expect(option?.disabled).not.toBe(true)
  if (response.interaction.stateId !== 'wait') throw new Error('Expected a waiting interaction')
  const next = session.resolveChoice(response.interaction.playerIndex, value)
  expect(next.ok, next.error).toBe(true)
  return next
}
function setup(configure?: (state: GameState) => void, moor = true) {
  const session = createWorkSession({ options: { enableFarmersOfTheMoor: moor, allowIncompleteFarmersOfTheMoorMinorDeal: true }, configure: state => {
    state.round = 3
    const player = state.players[0]!
    player.minorHand = [CARD, '__test_placeholder__']
    Object.assign(player.resources, { wood: 20, reed: 10, clay: 0, stone: 20, food: 20, fuel: 20 })
    if (!moor) player.fields = [0, 1, 2].flatMap(row => [3, 4].map(col => ({ row, col, stacks: [] })))
    configure?.(state)
  } })
  sessions.push(session)
  return session
}
function play(session: GameSession, card = CARD, space = 'major-improvement') {
  let response = session.takeAction(0, space)
  expect(response.ok, response.error).toBe(true)
  const branch = options(response).find(option => option.value.startsWith('action-improvement-'))
  if (branch) response = choose(session, response, branch.value)
  if (options(response).some(option => option.value === card)) response = choose(session, response, card)
  expect(response.state.players[0]!.minorPlayed).toContain(card)
  return response
}
function nextTurn(session: GameSession, response: SessionResponse, opponentSpace = 'day-laborer') {
  expect(response.interaction.stateId === 'wait' && response.interaction.request.kind).toBe('confirm-next-player')
  response = choose(session, response, 'confirm')
  if (response.state.currentPlayerIndex === 1) {
    response = session.takeAction(1, opponentSpace)
    expect(response.ok, response.error).toBe(true)
    response = choose(session, response, 'confirm')
  }
  expect(response.state.currentPlayerIndex).toBe(0)
  return response
}
function restore(session: GameSession) {
  const restored = new GameSession(rehydrateState(JSON.parse(JSON.stringify(serializeSessionSnapshot(session.state, session)))))
  sessions.push(restored)
  return restored
}
function skipExchange(session: GameSession, response: SessionResponse) {
  if (options(response).some(option => option.value === CARD)) response = choose(session, response, CARD)
  if (options(response).some(option => option.value === '__skip__')) response = choose(session, response, '__skip__')
  return response
}
function exchangeWindow(session: GameSession, response: SessionResponse) {
  for (let count = 0; count < 4 && options(response).some(option => option.value === CARD); count++) response = choose(session, response, CARD)
  expect(options(response).some(option => option.value === '__skip__'), JSON.stringify(response.interaction)).toBe(true)
  return response
}
function accept(session: GameSession, response: SessionResponse) {
  const option = options(response).find(option => !option.disabled && !option.value.startsWith('__'))
  if (!option) throw new Error(`Expected an enabled offer: ${JSON.stringify(response.interaction)}`)
  return choose(session, response, option.value)
}

// Approved seams: actual paid card play, authoritative farm mutations, committed
// events, source-owned goods, persisted pending, undo, and public presentation.
describe('A040 original clay positions', () => {
  it.each(['stone', 'wood'] as const)('claims a scheduled room at the real round start only for %s house', houseType => {
    const session = setup(state => {
      state.round = 11
      const player = state.players[0]!
      player.houseType = houseType
      player.minorPlayed = ['B014_Hawktower']
      state.players[1]!.resources.food = 50
      state.futureMeeples.push({ id: 'hawktower-12', cardId: 'B014_Hawktower', playerId: player.id,
        round: 12, actionId: null, resources: {}, roomType: 'stone' })
    }, false)
    let response = nextTurn(session, play(session))
    response = session.takeAction(0, 'forest')
    expect(response.ok, response.error).toBe(true)
    response = choose(session, response, 'confirm')
    response = session.takeAction(1, 'clay-pit')
    expect(response.ok, response.error).toBe(true)
    response = choose(session, response, 'confirm')
    for (let step = 0; step < 20 && response.interaction.stateId === 'wait'; step++) {
      const request = response.interaction.request
      if (request.kind === 'feed') response = session.resolveChoice(response.interaction.playerIndex, 'confirm', { selections: [] })
      else if (options(response).some(option => option.value === CARD)) response = choose(session, response, CARD)
      else if (options(response).some(option => option.value === '__skip__')) response = choose(session, response, '__skip__')
      else throw new Error(`Unexpected round interaction: ${JSON.stringify(response.interaction)}`)
      expect(response.ok, response.error).toBe(true)
    }
    expect(response.state.round).toBe(12)
    expect(response.state.roundPhase).toBe('work')
    expect(response.state.players[0]!.rooms).toBe(houseType === 'stone' ? 3 : 2)
    expect(response.state.players[0]!.resources.clay).toBe(houseType === 'stone' ? 1 : 0)
    expect(keys(response.state)).toHaveLength(houseType === 'stone' ? 6 : 7)
    expect(response.state.events.filter(event => event.type === 'farm.roomBuilt')).toHaveLength(houseType === 'stone' ? 1 : 0)
  })

  it.each([true, false])('claims the original clay exactly once with exchange=%s, restoration and undo', exchange => {
    let session = setup()
    let response = nextTurn(session, play(session))
    response = session.takeAction(0, 'farmland')
    expect(response.ok, response.error).toBe(true)
    session = restore(session)
    response = session.commitSelectionChoice(0, { tile: { row: 0, col: 3 } })
    response = exchangeWindow(session, response)
    expect(response.state.players[0]!.resources.clay).toBe(1)
    expect(keys(response.state)).toEqual(['0-4', '1-4', '2-3', '2-4'])
    expect(readCardResourceStats(response.state.players[0]!, CARD)?.gained).toEqual({ clay: 1 })
    expect(response.state.players[0]!.stats?.resourcesFromCards.clay).toBe(1)
    expect(serializeState(response.state, {}).players[0]!.cardStatePresentation[CARD]?.resourceGroups).toEqual([{ clay: 4 }])
    session = restore(session)
    response = exchange ? accept(session, session.getState()) : choose(session, session.getState(), '__skip__')
    expect(response.state.players[0]!.resources).toMatchObject({ clay: exchange ? 0 : 1, food: exchange ? 22 : 20 })
    expect(readCardResourceStats(response.state.players[0]!, CARD)?.gained).toEqual(exchange ? { clay: 1, food: 2 } : { clay: 1 })
    expect(response.state.events.filter(event => event.type === 'resource.moved' && event.sourceCardId === CARD && event.to.kind === 'player' && event.resources.clay === 1)).toHaveLength(1)
    response = session.undoAction()
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.clay).toBe(0)
    expect(keys(response.state)).toEqual(original)
    session.takeAction(0, 'farmland')
    response = session.commitSelectionChoice(0, { tile: { row: 0, col: 3 } })
    response = exchangeWindow(session, response)
    expect(response.state.players[0]!.resources.clay).toBe(1)
    expect(keys(response.state)).toHaveLength(4)
    skipExchange(session, response)
  })

  it('places clay on exactly five unused spaces in the real Moor starting farm', () => {
    const session = setup()
    const response = play(session)
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 19, reed: 9, clay: 0 })
    expect(keys(response.state)).toEqual(original)
    for (const token of tokens(response.state)) {
      expect(token).toMatchObject({ resources: { clay: 1 }, claimPolicy: 'when-no-longer-unused' })
      expect(token.blocksPlacement).toBeUndefined()
      expect(getUsedFarmyardTileKeys(response.state.players[0]!).has(token.spaceKey)).toBe(false)
    }
  })

  it('never borrows another space clay after an original moor is cleared and plowed', () => {
    const session = setup()
    let response = play(session)
    response = nextTurn(session, response)
    const special = response.state.farmersOfTheMoor!.specialActionCards.find(card => card.actions.includes('cut-peat'))!
    response = session.takeSpecialAction(0, special.id, 'cut-peat', { tile: { row: 0, col: 2 } })
    expect(response.ok, response.error).toBe(true)
    response = nextTurn(session, response, 'forest')
    response = session.takeAction(0, 'farmland')
    expect(response.ok, response.error).toBe(true)
    response = session.commitSelectionChoice(0, { tile: { row: 0, col: 2 } })
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.fields).toContainEqual({ row: 0, col: 2, stacks: [] })
    expect(response.state.players[0]!.resources.clay).toBe(0)
    expect(keys(response.state)).toEqual(original)
    expect(response.interaction.stateId === 'wait' && response.interaction.request.kind).toBe('confirm-next-player')
    expect(response.state.events.filter(event => event.type === 'resource.moved' && event.sourceCardId === CARD && event.to.kind === 'player')).toEqual([])
  })
})
