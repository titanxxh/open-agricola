import type { GameSession as SessionRuleOwner } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'

import { describe, expect, it, afterEach } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import {
  executeCardListener,
  getRegisteredCardListeners,
  type CardListenerContext,
} from '../../shared/cards/card-listeners'

import '../../shared/cards/E/E161_ElderBaker'
import assert from 'node:assert/strict'
import { assertRejectedUnchanged } from './_helpers/negative-rule-audit'
import * as audit57Resources from './_helpers/audit/ae-negative-57-resources'

const CARD_ID = 'E161_ElderBaker'
const LISTENER_ID = 'E161-elder-baker-compute-choice-candidates'
const STONE_OVEN_ID = 'Major_StoneOven'

const findListener = (ruleOwner: SessionRuleOwner, id: string) =>
  ruleOwner.withCtx(() => getRegisteredCardListeners()).find((l) => l.id === id)

const setup = (
  overrides: {
    playE161?: boolean
    availableMajors?: string[]
  } = {},
) => {
  const session = new GameSession(42)
  stabilizeRandomHands(session.state.players)
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
    const listener = findListener(session, LISTENER_ID)
    expect(listener).toBeDefined()

    const result = session.withCtx(() => executeCardListener(listener!, {
      state,
      player,
      actionId: 'improvement',
      phase: 'computeChoiceCandidates',
    } as unknown as CardListenerContext))

    expect(result?.extraOptions).toBeDefined()
    const values = result!.extraOptions!.map((o) => o.value)
    expect(values).toContain(STONE_OVEN_ID)
    expect(result!.extraOptions![0]!.sourceCard).toBe(CARD_ID)
  })

  it('returns nothing when owner has not played E161', () => {
    const session = setup({ playE161: false })
    const state = session.getState().state
    const player = state.players[0]!
    const listener = findListener(session, LISTENER_ID)!

    const result = session.withCtx(() => executeCardListener(listener, {
      state,
      player,
      actionId: 'improvement',
      phase: 'computeChoiceCandidates',
    } as unknown as CardListenerContext))

    expect(result).toBeUndefined()
  })

  it('returns nothing when Stone Oven is no longer in supply', () => {
    const session = setup({
      availableMajors: ['Major_Fireplace1', 'Major_Well'],
    })
    const state = session.getState().state
    const player = state.players[0]!
    const listener = findListener(session, LISTENER_ID)!

    const result = session.withCtx(() => executeCardListener(listener, {
      state,
      player,
      actionId: 'improvement',
      phase: 'computeChoiceCandidates',
    } as unknown as CardListenerContext))

    expect(result).toBeUndefined()
  })
})

describe('E161_ElderBaker session integration', () => {
  const enterMinorChoice = (session: GameSession) => {
    let resp = session.takeAction(0, 'meeting-place')
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')
    resp = session.resolveChoice(0, 'action-improvement-1')
    return resp
  }

  it('automatically buys Stone Oven through Minor Improvement when the hand is empty', () => {
    const session = setup()
    const state = session.getState().state
    state.players[0]!.minorHand = []
    session.loadState(state)

    const resp = enterMinorChoice(session)
    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.minorHand).toEqual([])
    expect(resp.state.players[0]!.improvements).toContain(STONE_OVEN_ID)
    expect(resp.state.availableMajorImprovements).not.toContain(STONE_OVEN_ID)
  })

  it('selecting Major_StoneOven via minor-improvement plays it as a major', () => {
    const session = setup()
    const state = session.getState().state
    state.players[0]!.minorHand = ['A030_BakingSheet']
    session.loadState(state)

    let resp = enterMinorChoice(session)
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')
    const stoneOvenOption = resp.interaction.request.options?.find((o) => o.value === STONE_OVEN_ID)
    expect(stoneOvenOption).toBeDefined()
    resp = session.resolveChoice(0, stoneOvenOption!.value)

    let steps = 0
    while (resp.interaction.stateId === 'wait' && steps < 20) {
      steps++
      const opts = resp.interaction.request.options ?? []
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
    if (!resp.ok || resp.interaction.stateId !== 'wait') return
    const values = (resp.interaction.request.options ?? []).map((o) => o.value)
    expect(values).not.toContain(STONE_OVEN_ID)
  })
})

describe('E161 Elder Baker parity', () => {
  const CARD_ID = 'E161_ElderBaker'

  const STONE_OVEN_ID = 'Major_StoneOven'

  const FILLER = '__test_placeholder__'

  const baseSession = ({
    played = true, grain = 0, stoneOvenAvailable = true,
  }: { played?: boolean; grain?: number; stoneOvenAvailable?: boolean } = {}) => {
    const session = new GameSession(6161, undefined, { playerCount: 4 })
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.currentPlayerIndex = 0
    state.round = 5
    state.roundPhase = 'work'
    state.actionSpaces.forEach((space) => { space.takenBy = [] })
    state.players.forEach((player, index) => {
      setWorkersAtHome(state, player, 2)
      player.minorHand = [FILLER]
      player.occupationHand = [FILLER]
      player.minorPlayed = []
      player.occupationPlayed = []
      player.improvements = []
      player.cardStates = {}
      Object.assign(player.resources, {
        wood: 0, clay: index === 0 ? 1 : 0, reed: 0, stone: index === 0 ? 3 : 0,
        food: 20, grain: index === 0 ? grain : 0, vegetable: 0, sheep: 0, boar: 0,
        cattle: 0, begging: 0,
      })
    })
    const owner = state.players[0]!
    owner.occupationHand = played ? [FILLER] : [CARD_ID]
    owner.occupationPlayed = played ? [CARD_ID] : []
    if (!stoneOvenAvailable) {
      state.availableMajorImprovements = state.availableMajorImprovements
        .filter((cardId) => cardId !== STONE_OVEN_ID)
    }
    session.loadState(state)
    return session
  }

  const setupPlayed = (configuration: { grain?: number; stoneOvenAvailable?: boolean } = {}) => {
    return baseSession({ ...configuration, played: true })
  }

  it('E161 S2: the owner uses the private Elder Baker action space to gain three grain', () => {
    const response = setupPlayed().takeAction(0, CARD_ID)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.grain).toBe(3)
  })

  it('E161 S3: a non-owner cannot use the private Elder Baker action space', () => {
    const session = setupPlayed()
    const before = session.getState()
    const response = session.takeAction(1, CARD_ID)

    expect(session.getActionAvailability(1)[CARD_ID]).toBe(false)
    expect(response.ok).toBe(false)
    expect(response.state.players[1]!.resources.grain).toBe(0)
    expect(response.state.actionSpaces.find((space) => space.id === CARD_ID)?.takenBy)
      .toEqual(before.state.actionSpaces.find((space) => space.id === CARD_ID)?.takenBy)
  })
})

describe('ae-negative-57-resources', () => {
  const { sessions, ok, save, make, finish, play, choose, ready, cycleToOwner, minorMenu } = audit57Resources
  afterEach(() => sessions.splice(0).forEach(session => session.dispose()))
  it('E161 N1 real Elder Baker purchase then live owner use grants exactly three grain from private action space', () => {
    const session = make('E161_ElderBaker', undefined, false), played = finish(session, play(session, 'E161_ElderBaker'))
    assert.ok(played.state.actionSpaces.some(space => space.id === 'E161_ElderBaker'))
    cycleToOwner(session)
    const used = session.takeAction(0, 'E161_ElderBaker')
    save('E161-N1', { played, used })
    assert.deepEqual({ ok: used.ok, grain: used.state.players[0]!.resources.grain }, { ok: true, grain: 3 })
  })
  it('E161 N2 loaded played private space grants owner three grain while opponent and occupied reuse reject', () => {
    const opponent = make('E161_ElderBaker', state => { state.currentPlayerIndex = 1 }), wrong = assertRejectedUnchanged(opponent, () => opponent.takeAction(1, 'E161_ElderBaker')), control = finish(opponent, ok(opponent.takeAction(1, 'grain-seeds')))
    assert.equal(control.state.players[0]!.resources.grain, 0)
    assert.equal(control.state.players[1]!.resources.grain, 1)
    const owner = make('E161_ElderBaker'), response = finish(owner, ok(owner.takeAction(0, 'E161_ElderBaker')))
    assert.equal(response.state.players[0]!.resources.grain, 3)
    ready(owner)
    const occupied = assertRejectedUnchanged(owner, () => owner.takeAction(1, 'E161_ElderBaker'))
    save('E161-N2', { wrong, control, response, occupied })
  })
  it('E161 N3 real Minor Improvement action pays three stone and one clay for Stone Oven and can decline its immediate baking', () => {
    const session = make('E161_ElderBaker', state => { const p = state.players[0]!; p.minorHand = ['B004_WoodPile', 'A006_StorageBarn']; p.resources.stone = 3; p.resources.clay = 1 })
    const pending = minorMenu(session), response = finish(session, choose(session, pending, option => option.value === 'Major_StoneOven'))
    assert.ok(response.state.players[0]!.improvements.includes('Major_StoneOven'))
    assert.equal(response.state.players[0]!.resources.stone, 0)
    assert.equal(response.state.players[0]!.resources.clay, 0)
    assert.equal(response.state.players[0]!.resources.grain, 0)
    save('E161-N3', { pending, response })
  })
  it('E161 N4 in-hand card unavailable Stone Oven and insufficient stone cannot obtain the major through a minor action', () => {
    for (const mode of ['hand', 'supply', 'stone']) {
      const session = make('E161_ElderBaker', state => { const p = state.players[0]!; p.minorHand = ['B004_WoodPile', 'A006_StorageBarn']; p.resources.stone = mode === 'stone' ? 2 : 3; p.resources.clay = 1; if (mode === 'supply') { state.availableMajorImprovements = state.availableMajorImprovements.filter(id => id !== 'Major_StoneOven'); state.players[1]!.improvements.push('Major_StoneOven') } }, mode !== 'hand')
      const pending = minorMenu(session), rejected = assertRejectedUnchanged(session, () => session.resolveChoice(0, 'Major_StoneOven')), response = finish(session, choose(session, pending, option => option.value === 'B004_WoodPile'))
      assert.equal(response.state.players[0]!.improvements.includes('Major_StoneOven'), false)
      assert.equal(response.state.players[0]!.resources.stone, mode === 'stone' ? 2 : 3)
      save(`E161-N4-${mode}`, { pending, rejected, response })
    }
  })
})
