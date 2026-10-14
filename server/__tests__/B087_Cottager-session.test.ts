import assert from 'node:assert/strict'
import { afterEach, describe, expect, it } from 'vitest'
import type { GameSession, SessionResponse } from '../game/authoritative-session'
import { createWorkSession } from './_helpers/session-fixtures'
import { resolveTriggerIfPresent } from './_helpers/trigger-select'
import type { Resource } from '../../shared/contract/types'

import '../../shared/cards/B/B087_Cottager'

const CARD_ID = 'B087_Cottager'
const FILLER = '__test_placeholder__'
const sessions: GameSession[] = []
afterEach(() => sessions.splice(0).forEach((session) => session.dispose()))

const setup = ({
  played = true, houseType = 'wood', resources = {},
}: { played?: boolean; houseType?: 'wood' | 'clay'; resources?: Partial<Resource> } = {}) => {
  const session = createWorkSession({
    seed: 5487,
    configure(state) {
      state.round = 5
      for (const player of state.players) {
        player.minorHand = [FILLER]
        player.occupationHand = [FILLER]
        player.resources.food = 20
      }
      const owner = state.players[0]!
      owner.occupationHand = played ? [FILLER] : [CARD_ID]
      owner.occupationPlayed = played ? [CARD_ID] : []
      owner.houseType = houseType
      owner.resources = {
        ...owner.resources,
        wood: 0, clay: 0, reed: 0, stone: 0, food: 0, ...resources,
      }
    },
  })
  sessions.push(session)
  return session
}

const play = (session: GameSession) => {
  const response = session.takeAction(0, 'lessons')
  expect(response.ok, response.error).toBe(true)
  if (!response.state.players[0]!.occupationHand.includes(CARD_ID)) return response
  expect(response.interaction.stateId).toBe('wait')
  if (response.interaction.stateId !== 'wait') return response
  const option = response.interaction.request.options?.find((candidate) => candidate.value === CARD_ID)
  expect(option).toBeDefined()
  return session.resolveChoice(response.interaction.playerIndex, option!.value)
}

const enterCottager = (session: GameSession) =>
  resolveTriggerIfPresent(session, session.takeAction(0, 'day-laborer'), CARD_ID)

const chooseBranch = (session: GameSession, response: SessionResponse, labelKey: string) => {
  expect(response.interaction.stateId).toBe('wait')
  if (response.interaction.stateId !== 'wait') return response
  const option = response.interaction.request.options?.find((candidate) => candidate.labelKey === labelKey)
  expect(option).toBeDefined()
  return session.resolveChoice(response.interaction.playerIndex, option!.value)
}

describe('B087 Cottager parity', () => {
  it('B087 S1: playing Cottager through Lessons leaves it in play', () => {
    const response = play(setup({ played: false }))

    expect(response.ok, JSON.stringify({ error: response.error, interaction: response.interaction })).toBe(true)
    expect(response.state.players[0]!.occupationPlayed).toContain(CARD_ID)
  })

  it('B087 S2: Day Laborer can be followed by exactly one paid room', () => {
    const session = setup({ resources: { wood: 5, reed: 2 } })
    let response = chooseBranch(session, enterCottager(session), 'actions.construct.name')
    expect(response.interaction).toMatchObject({
      stateId: 'wait', request: { kind: 'farm-select', farm: { farmType: 'room', maxSelections: 1 } },
    })
    if (response.interaction.stateId !== 'wait') return
    const room = response.interaction.request.farm.selectableTiles[0]

    response = session.commitSelectionChoice(0, { rooms: [room!] })

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.rooms).toBe(3)
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 0, reed: 0, food: 2 })
  })

  it('caps Cottager at one room with resources for two and preserves selection after rejecting two rooms', () => {
    const session = setup({ resources: { wood: 10, reed: 4 } })
    const pending = chooseBranch(session, enterCottager(session), 'actions.construct.name')
    assert.ok(pending.interaction.stateId === 'wait' && pending.interaction.request.kind === 'farm-select')
    assert.equal(pending.interaction.request.farm.farmType, 'room')
    const before = JSON.stringify({ state: pending.state, interaction: pending.interaction, scores: pending.scores })
    const rejected = session.commitSelectionChoice(0, { rooms: [{ row: 1, col: 1 }, { row: 2, col: 1 }] })

    expect(rejected.ok).toBe(false)
    expect(pending.interaction.request.farm.maxSelections).toBe(1)
    expect(JSON.stringify({ state: rejected.state, interaction: rejected.interaction, scores: rejected.scores })).toBe(before)

    const built = session.commitSelectionChoice(0, { rooms: [{ row: 1, col: 1 }] })
    expect(built.ok, built.error).toBe(true)
    expect(built.state.players[0]!.rooms).toBe(3)
    expect(built.state.players[0]!.resources).toMatchObject({ wood: 5, reed: 2, food: 2 })
    expect(built.state.events.filter((event) => event.type === 'farm.roomBuilt')).toHaveLength(1)
    expect(built.state.log).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'log.actionDetail', params: expect.objectContaining({ detailParts: expect.objectContaining({ effects: { buildRoom: 1 } }) }) }),
    ]))
  })

  it('leaves ordinary Farm Expansion able to build two rooms', () => {
    const session = setup({ played: false, resources: { wood: 10, reed: 4 } })
    const pending = chooseBranch(session, session.takeAction(0, 'farm-expansion'), 'actions.construct.name')
    assert.ok(pending.interaction.stateId === 'wait' && pending.interaction.request.kind === 'farm-select')
    assert.equal(pending.interaction.request.farm.farmType, 'room')
    expect(pending.interaction.request.farm.maxSelections).toBe(2)

    const built = session.commitSelectionChoice(0, { rooms: [{ row: 1, col: 1 }, { row: 2, col: 1 }] })
    expect(built.ok, built.error).toBe(true)
    expect(built.state.players[0]!.rooms).toBe(4)
    expect(built.state.players[0]!.resources).toMatchObject({ wood: 0, reed: 0 })
    expect(built.state.events.filter((event) => event.type === 'farm.roomBuilt')).toHaveLength(1)
  })

  it('B087 S3: the renovation branch pays its selected cost and can be undone', () => {
    const session = setup({ resources: { clay: 2, reed: 1 } })
    let response = enterCottager(session)
    expect(response.interaction.stateId).toBe('wait')
    if (response.interaction.stateId !== 'wait') return
    const renovation = response.interaction.request.options?.find((candidate) =>
      candidate.labelKey?.includes('renovat') || candidate.value.includes('renovat'))
    expect(renovation).toBeDefined()
    response = session.resolveChoice(0, renovation!.value)
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.houseType).toBe('clay')
    expect(response.state.players[0]!.resources).toMatchObject({ clay: 0, reed: 0, food: 2 })
    response = session.undoStep(0)
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.houseType).toBe('wood')
    expect(response.state.players[0]!.rooms).toBe(2)
    expect(response.state.players[0]!.resources).toMatchObject({ clay: 2, reed: 1, food: 2 })
  })

  it('B087 S4: declining Cottager keeps the Day Laborer reward without building or renovating', () => {
    const session = setup({ resources: { wood: 5, clay: 2, reed: 2 } })
    const offered = enterCottager(session)
    expect(offered.interaction.stateId).toBe('wait')
    if (offered.interaction.stateId !== 'wait') return

    const response = session.resolveChoice(offered.interaction.playerIndex, '__skip__')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.rooms).toBe(2)
    expect(response.state.players[0]!.houseType).toBe('wood')
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 5, clay: 2, reed: 2, food: 2 })
  })

  it('B087 S5: a non-Day-Laborer action does not offer Cottager', () => {
    const response = setup({ resources: { wood: 5, clay: 2, reed: 2 } }).takeAction(0, 'forest')

    expect(response.ok, response.error).toBe(true)
    expect(response.interaction.stateId === 'wait' ? response.interaction.sourceCard : undefined)
      .not.toBe(CARD_ID)
    expect(response.state.players[0]!.rooms).toBe(2)
  })

  it('B087 S6: with neither building nor renovation resources Day Laborer offers no usable Cottager branch', () => {
    const session = setup()
    const response = enterCottager(session)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.rooms).toBe(2)
    expect(response.state.players[0]!.resources.food).toBe(2)
    if (response.interaction.stateId === 'wait' && response.interaction.sourceCard === CARD_ID) {
      expect(response.interaction.request.options?.every((option) => option.value === '__skip__')).toBe(true)
    }
  })
})
