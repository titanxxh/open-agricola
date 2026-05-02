import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import {
  executeCardListener,
  getRegisteredCardListeners,
  type CardListenerContext,
} from '../../shared/cards/card-listeners'

import '../../shared/cards/E/E161_ElderBaker'

const CARD_ID = 'E161_ElderBaker'
const LISTENER_ID = 'E161-elder-baker-compute-choice-candidates'
const STONE_OVEN_ID = 'Major_StoneOven'

const findListener = (id: string) =>
  getRegisteredCardListeners().find((l) => l.id === id)

const setup = (
  overrides: {
    playE161?: boolean
    availableMajors?: string[]
  } = {},
) => {
  const session = new GameSession()
  const state = session.getState().state
  state.players = state.players.slice(0, 2)
  state.round = 3
  state.roundPhase = 'work'
  state.currentPlayerIndex = 0

  state.players[0]!.workersAvailable = 1
  state.players[0]!.familySize = 1
  state.players[1]!.workersAvailable = 0
  state.players[1]!.familySize = 1

  const owner = state.players[0]!
  if (overrides.playE161 !== false) {
    owner.occupationPlayed.push(CARD_ID)
  }
  // Plenty of resources to keep Stone Oven affordable (cost 1 stone).
  owner.resources = {
    ...owner.resources,
    food: 10,
    wood: 5,
    clay: 5,
    stone: 5,
    reed: 5,
    grain: 0,
    vegetable: 0,
    sheep: 0,
    boar: 0,
    cattle: 0,
  }
  if (overrides.availableMajors) {
    state.availableMajorImprovements = overrides.availableMajors.slice()
  }

  session.loadState(state)
  return session
}

describe('E161_ElderBaker computeChoiceCandidates listener (unit)', () => {
  it('injects Major_StoneOven candidate when owner played E161', () => {
    const session = setup()
    const state = session.getState().state
    const player = state.players[0]!
    const listener = findListener(LISTENER_ID)
    expect(listener).toBeDefined()

    const result = executeCardListener(listener!, {
      state,
      player,
      actionId: 'minor-improvement',
      phase: 'computeChoiceCandidates',
    } as unknown as CardListenerContext)

    expect(result?.extraOptions).toBeDefined()
    const values = result!.extraOptions!.map((o) => o.value)
    expect(values).toContain(`major:${STONE_OVEN_ID}`)
    expect(result!.extraOptions![0]!.sourceCard).toBe(CARD_ID)
  })

  it('returns nothing when owner has not played E161', () => {
    const session = setup({ playE161: false })
    const state = session.getState().state
    const player = state.players[0]!
    const listener = findListener(LISTENER_ID)!

    const result = executeCardListener(listener, {
      state,
      player,
      actionId: 'minor-improvement',
      phase: 'computeChoiceCandidates',
    } as unknown as CardListenerContext)

    expect(result).toBeUndefined()
  })

  it('returns nothing when Stone Oven is no longer in supply', () => {
    const session = setup({
      availableMajors: ['Major_Fireplace1', 'Major_Well'],
    })
    const state = session.getState().state
    const player = state.players[0]!
    const listener = findListener(LISTENER_ID)!

    const result = executeCardListener(listener, {
      state,
      player,
      actionId: 'minor-improvement',
      phase: 'computeChoiceCandidates',
    } as unknown as CardListenerContext)

    expect(result).toBeUndefined()
  })
})

describe('E161_ElderBaker session integration', () => {
  const enterMinorChoice = (session: GameSession) => {
    let resp = session.takeAction(0, 'meeting-place')
    expect(resp.ok).toBe(true)
    expect(resp.pending.type).toBe('choice')
    resp = session.resolveChoice(0, 'action-minor-improvement-1')
    return resp
  }

  it('minor-improvement choice list contains Major_StoneOven candidate', () => {
    const session = setup()
    const state = session.getState().state
    state.players[0]!.minorHand = []
    session.loadState(state)

    const resp = enterMinorChoice(session)
    expect(resp.ok).toBe(true)
    expect(resp.pending.type).toBe('choice')
    const values = (resp.pending.options ?? []).map((o) => o.value)
    expect(values).toContain(`major:${STONE_OVEN_ID}`)
  })

  it('selecting Major_StoneOven via minor-improvement plays it as a major', () => {
    const session = setup()
    const state = session.getState().state
    state.players[0]!.minorHand = []
    session.loadState(state)

    let resp = enterMinorChoice(session)
    expect(resp.ok).toBe(true)
    expect(resp.pending.type).toBe('choice')
    resp = session.resolveChoice(0, `major:${STONE_OVEN_ID}`)

    let steps = 0
    while (resp.pending.type === 'choice' && steps < 20) {
      steps++
      const opts = resp.pending.options ?? []
      const next =
        opts.find((o) => o.value !== '__skip__' && o.value !== 'cancel') ?? opts[0]
      if (!next) break
      resp = session.resolveChoice(0, next.value)
    }
    expect(resp.state.players[0]!.improvements).toContain(STONE_OVEN_ID)
    expect(resp.state.availableMajorImprovements).not.toContain(STONE_OVEN_ID)
  })

  it('non-E161 owner: minor-improvement does NOT have Stone Oven', () => {
    const session = setup({ playE161: false })
    const state = session.getState().state
    state.players[0]!.minorHand = []
    session.loadState(state)

    const resp = enterMinorChoice(session)
    if (!resp.ok || resp.pending.type !== 'choice') return
    const values = (resp.pending.options ?? []).map((o) => o.value)
    expect(values).not.toContain(`major:${STONE_OVEN_ID}`)
  })
})
