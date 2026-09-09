import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { resolveTriggerIfPresent } from './_helpers/trigger-select'
import type { Resource } from '../../shared/contract/types'

import '../../shared/cards/B/B087_Cottager'

const CARD_ID = 'B087_Cottager'
const FILLER = '__test_placeholder__'

const setup = ({
  played = true, houseType = 'wood', resources = {},
}: { played?: boolean; houseType?: 'wood' | 'clay'; resources?: Partial<Resource> } = {}) => {
  const session = new GameSession(5487, undefined, { playerCount: 2 })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = 5
  state.roundPhase = 'work'
  state.players.forEach((player) => {
    setWorkersAtHome(state, player, 2)
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
    player.resources.food = 20
  })
  const owner = state.players[0]!
  owner.occupationHand = played ? [FILLER] : [CARD_ID]
  owner.occupationPlayed = played ? [CARD_ID] : []
  owner.houseType = houseType
  owner.resources = {
    ...owner.resources,
    wood: 0, clay: 0, reed: 0, stone: 0, food: 0, ...resources,
  }
  session.loadState(state)
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
