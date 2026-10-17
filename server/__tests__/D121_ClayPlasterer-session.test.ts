import { describe, expect, it, afterEach } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import '../../shared/cards/D/D121_ClayPlasterer'
import assert from 'node:assert/strict'
import { assertRejectedUnchanged } from './_helpers/negative-rule-audit'
import * as audit50Cards from './_helpers/audit/ae-negative-50-cards'

const CARD_ID = 'D121_ClayPlasterer'

const setup = ({
  played = true,
  houseType = 'wood',
  rooms = 2,
  resources = {},
}: {
  played?: boolean
  houseType?: 'wood' | 'clay' | 'stone'
  rooms?: number
  resources?: Partial<Record<'wood' | 'clay' | 'reed' | 'stone', number>>
} = {}) => {
  const session = new GameSession(6121, undefined, { playerCount: 2 })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = 14
  state.roundPhase = 'work'
  state.actionSpaces.forEach((space) => { space.takenBy = [] })
  state.players.forEach((player) => {
    player.minorHand = ['__test_placeholder__']
    player.occupationHand = ['__test_placeholder__']
    player.minorPlayed = []
    player.occupationPlayed = []
    player.cardStates = {}
    player.resources = {
      ...player.resources,
      wood: 0, clay: 0, reed: 0, stone: 0, food: 20, grain: 0, vegetable: 0,
      sheep: 0, boar: 0, cattle: 0, begging: 0,
    }
    setWorkersAtHome(state, player, 2)
  })
  const owner = state.players[0]!
  owner.occupationHand = played ? ['__test_placeholder__'] : [CARD_ID]
  owner.occupationPlayed = played ? [CARD_ID] : []
  owner.houseType = houseType
  owner.rooms = rooms
  owner.roomTiles = Array.from({ length: rooms }, (_, row) => ({ row, col: 0 }))
  owner.resources = { ...owner.resources, ...resources }
  session.loadState(state)
  return session
}

const chooseCardIfNeeded = (session: GameSession, response: SessionResponse, cardId: string) => {
  if (response.interaction.stateId !== 'wait') return response
  const option = response.interaction.request.options?.find((candidate) => candidate.value === cardId)
  return option ? session.resolveChoice(response.interaction.playerIndex, option.value) : response
}

const openRoomSelection = (session: GameSession) => {
  let response = session.takeAction(0, 'farm-expansion')
  if (response.interaction.stateId === 'wait') {
    const construct = response.interaction.request.options?.find(
      (option) => option.labelKey === 'actions.construct.name',
    )
    if (construct) response = session.resolveChoice(response.interaction.playerIndex, construct.value)
  }
  expect(response.interaction.stateId).toBe('wait')
  if (response.interaction.stateId !== 'wait') return response
  expect(response.interaction.request.kind).toBe('farm-select')
  expect(response.interaction.request.farm.farmType).toBe('room')
  return response
}

describe('D121 Clay Plasterer session', () => {
  it('D121 S1: playing Clay Plasterer through Lessons leaves it in play', () => {
    const session = setup({ played: false })

    const response = chooseCardIfNeeded(session, session.takeAction(0, 'lessons'), CARD_ID)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.occupationPlayed).toContain(CARD_ID)
  })

  it('D121 S2: a three-room wood house renovates to clay for exactly one clay and one reed', () => {
    const session = setup({ rooms: 3, resources: { clay: 1, reed: 1 } })

    const response = session.takeAction(0, 'house-redevelopment')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]).toMatchObject({
      houseType: 'clay',
      rooms: 3,
      resources: { clay: 0, reed: 0 },
    })
  })

  it('D121 S3: without Clay Plasterer one clay and one reed cannot renovate a three-room wood house', () => {
    const session = setup({ played: false, rooms: 3, resources: { clay: 1, reed: 1 } })
    session.state.players[0]!.occupationHand = ['__test_placeholder__']
    session.loadState(session.state)

    const response = session.takeAction(0, 'house-redevelopment')

    expect(response.ok).toBe(false)
    expect(response.state.players[0]).toMatchObject({
      houseType: 'wood',
      rooms: 3,
      resources: { clay: 1, reed: 1 },
    })
    expect(response.state.actionSpaces.find((space) => space.id === 'house-redevelopment')?.takenBy).toEqual([])
  })

  it('D121 S4: three clay and two reed pay for one clay room through Farm Expansion', () => {
    const session = setup({ houseType: 'clay', resources: { clay: 3, reed: 2 } })
    const selection = openRoomSelection(session)
    expect(selection.ok, selection.error).toBe(true)
    if (selection.interaction.stateId !== 'wait' || selection.interaction.request.kind !== 'farm-select') {
      throw new Error('expected room selection')
    }
    const room = selection.interaction.request.farm.selectableTiles[0]!
    const response = session.commitSelectionChoice(0, { rooms: [room] })
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]).toMatchObject({
      houseType: 'clay', rooms: 3, resources: { clay: 0, reed: 0 },
    })
    expect(response.state.players[0]!.roomTiles).toContainEqual(room)
  })

  it('D121 S5: two clay rooms cost six clay and four reed to build', () => {
    const session = setup({ houseType: 'clay', resources: { clay: 6, reed: 4 } })
    const selection = openRoomSelection(session)
    if (selection.interaction.stateId !== 'wait'
      || selection.interaction.request.kind !== 'farm-select') return
    expect(selection.interaction.request.farm.maxSelections).toBe(2)
    const [roomA, roomB] = selection.interaction.request.farm.selectableTiles

    const response = session.commitSelectionChoice(0, { rooms: [roomA!, roomB!] })

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]).toMatchObject({
      houseType: 'clay', rooms: 4, resources: { clay: 0, reed: 0 },
    })
  })

  it('D121 S6: a wood room keeps its normal five-wood two-reed cost', () => {
    const session = setup({ resources: { wood: 5, reed: 2 } })
    const selection = openRoomSelection(session)
    if (selection.interaction.stateId !== 'wait'
      || selection.interaction.request.kind !== 'farm-select') return
    const room = selection.interaction.request.farm.selectableTiles[0]!

    const response = session.commitSelectionChoice(0, { rooms: [room] })

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]).toMatchObject({
      houseType: 'wood', rooms: 3, resources: { wood: 0, reed: 0 },
    })
  })
})

describe('ae-negative-50-cards', () => {
  const { sessions, save, ok, make, finish, resources, rooms, build } = audit50Cards
  afterEach(() => sessions.splice(0).forEach(s => s.dispose()))
  it('D121 N1 exactly one clay one reed renovates all three physical wood rooms', () => { const s = make('D121_ClayPlasterer', st => { rooms(st, 3, 'wood'); Object.assign(st.players[0]!.resources, { clay: 1, reed: 1 }) }, true, 14), r = finish(s, ok(s.takeAction(0, 'house-redevelopment')), false); resources(r, { clay: 0, reed: 0 }); assert.equal(r.state.players[0]!.houseType, 'clay'); assert.equal(r.state.players[0]!.roomTiles.length, 3); save('D121-N1', r) })
  it('D121 N2 one or two clay rooms pay exactly three clay two reed per room while wood keeps normal cost', () => { for (const [house, count] of [['clay', 1], ['clay', 2], ['wood', 1]] as const) { const s = make('D121_ClayPlasterer', st => { rooms(st, 2, house); Object.assign(st.players[0]!.resources, { [house]: (house === 'wood' ? 5 : 3) * count, reed: 2 * count }) }), r = build(s, count); resources(r, { [house]: 0, reed: 0 }); assert.equal(r.state.players[0]!.rooms, 2 + count); save(`D121-N2-${house}-${count}`, r) } })
  it('D121 N3 unplayed card cannot admit cheap renovation and stone renovation retains normal three stone cost', () => { const s = make('D121_ClayPlasterer', st => { rooms(st, 3, 'wood'); Object.assign(st.players[0]!.resources, { clay: 1, reed: 1 }) }, false, 14), rejected = assertRejectedUnchanged(s, () => s.takeAction(0, 'house-redevelopment')), r = finish(s, ok(s.takeAction(0, 'grain-seeds'))); assert.equal(r.state.players[0]!.houseType, 'wood'); const c = make('D121_ClayPlasterer', st => { rooms(st, 3, 'clay'); Object.assign(st.players[0]!.resources, { stone: 3, reed: 1 }) }, true, 14), cr = finish(c, ok(c.takeAction(0, 'house-redevelopment')), false); resources(cr, { stone: 0, reed: 0 }); assert.equal(cr.state.players[0]!.houseType, 'stone'); save('D121-N3', { rejected, r, cr }) })
})
