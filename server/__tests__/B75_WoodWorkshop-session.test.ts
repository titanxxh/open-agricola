import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import type { InteractionState } from '../../shared/contract/types'
import { setWorkersAtHome } from '../../shared/domain/player'
import '../../shared/cards/B/B75_WoodWorkshop'
import '../../shared/cards/A/A48_ShavingHorse'

const B75 = 'B75_WoodWorkshop'
const A48 = 'A48_ShavingHorse'
const WOOD_MINOR = 'C13_WoodSlideHammer'
const FOOD_MINOR = 'A5_ClayEmbankment'

const setup = (overrides: {
  wood?: number
  food?: number
  minorHand?: string[]
  played?: string[]
  availableMajors?: string[]
} = {}) => {
  const session = new GameSession(1)
  const state = session.getState().state
  state.players = state.players.slice(0, 2)
  state.currentPlayerIndex = 0
  state.round = 1
  state.roundPhase = 'work'

  const player = state.players[0]!
  setWorkersAtHome(state, player, 2)
  player.resources = {
    ...player.resources,
    wood: overrides.wood ?? 0,
    clay: 0,
    reed: 0,
    stone: 0,
    food: overrides.food ?? 0,
  }
  player.minorPlayed = overrides.played ?? [B75]
  player.minorHand = overrides.minorHand ?? ['__test_placeholder__']
  player.occupationHand = ['__test_placeholder__']
  state.players[1]!.minorHand = ['__test_placeholder__']
  state.players[1]!.occupationHand = ['__test_placeholder__']
  state.availableMajorImprovements = overrides.availableMajors ?? []

  const space = state.actionSpaces.find((entry) => entry.id === 'major-improvement')
  if (!space) throw new Error('major-improvement missing')
  space.takenBy = []

  session.loadState(state)
  return session
}

type WaitResponse = SessionResponse & {
  interaction: Extract<InteractionState, { stateId: 'wait' }>
}

const expectWait = (resp: SessionResponse): WaitResponse => {
  expect(resp.ok).toBe(true)
  expect(resp.interaction.stateId).toBe('wait')
  if (resp.interaction.stateId !== 'wait') {
    throw new Error(`expected wait, got ${resp.interaction.stateId}`)
  }
  return resp as WaitResponse
}

describe('B75_WoodWorkshop session', () => {
  it('uses mandatory B75 before trigger to play a wood-cost minor', () => {
    const session = setup({ wood: 0, minorHand: [WOOD_MINOR] })

    let resp = session.takeAction(0, 'major-improvement')
    const wait = expectWait(resp)
    expect(wait.interaction.promptKey).toBe('ui.interactionSelectTrigger')
    expect(wait.interaction.options?.find((option) => option.value === B75)?.disabled).not.toBe(true)
    expect(wait.interaction.options?.find((option) => option.value === '__pass__')?.disabled).toBe(true)

    resp = session.resolveChoice(0, B75)
    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.minorPlayed).toContain(WOOD_MINOR)
    expect(resp.state.players[0]!.resources.wood).toBe(0)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    expect(resp.interaction.promptKey).toBe('ui.confirmNextPlayer')
  })

  it('uses real B75 wood then real A48 exchange to pay and pass a food-cost minor', () => {
    const session = setup({
      wood: 4,
      food: 0,
      minorHand: [FOOD_MINOR],
      played: [B75, A48],
    })

    let resp = session.takeAction(0, 'major-improvement')
    let wait = expectWait(resp)
    expect(wait.interaction.promptKey).toBe('ui.interactionSelectTrigger')

    resp = session.resolveChoice(0, B75)
    wait = expectWait(resp)
    expect(wait.state.players[0]!.resources.wood).toBe(5)
    expect(wait.interaction.promptKey).toBe('ui.interactionSelectTrigger')
    expect(wait.interaction.options?.map((option) => option.value)).toContain(A48)

    resp = session.resolveChoice(0, A48)
    wait = expectWait(resp)
    expect(wait.interaction.promptKey).toBe('ui.interactionOptionalAction')
    expect(wait.interaction.sourceCard).toBe(A48)

    const exchange = wait.interaction.options?.find((option) => option.value !== '__skip__')
    expect(exchange).toBeDefined()
    resp = session.resolveChoice(0, exchange!.value)
    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.minorPlayed).not.toContain(FOOD_MINOR)
    expect(resp.state.players[1]!.minorHand).toContain(FOOD_MINOR)
    expect(resp.state.players[0]!.resources.wood).toBe(4)
    expect(resp.state.players[0]!.resources.food).toBe(2)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    expect(resp.interaction.promptKey).toBe('ui.confirmNextPlayer')
  })

  it('blocks after B75 gains wood if no improvement is playable', () => {
    const session = setup({
      wood: 0,
      food: 0,
      minorHand: [FOOD_MINOR],
      played: [B75],
      availableMajors: [],
    })

    let resp = session.takeAction(0, 'major-improvement')
    let wait = expectWait(resp)
    expect(wait.interaction.promptKey).toBe('ui.interactionSelectTrigger')
    expect(wait.interaction.options?.find((option) => option.value === '__pass__')?.disabled).toBe(true)

    resp = session.resolveChoice(0, B75)
    wait = expectWait(resp)
    expect(wait.state.players[0]!.resources.wood).toBe(1)
    expect(wait.interaction.request.kind).toBe('engine-blocked')
    expect(wait.interaction.allowedCommands).toEqual(['undoStep', 'undoAction'])
    expect(wait.interaction.promptKey).toBe('ui.interactionEngineBlocked')

    const invalidResolve = session.resolveChoice(0, 'not-advertised-choice')
    expect(invalidResolve.ok).toBe(false)
    expect(invalidResolve.error).toBe('engine-blocked cannot resolve')

    const undoResp = session.undoStep()
    expect(undoResp.ok).toBe(true)
    expect(undoResp.state.players[0]!.resources.wood).toBe(0)
  })
})
