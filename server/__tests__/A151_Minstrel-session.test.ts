import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { runCardEffectHook } from '../../shared/cards/card-effects'
import type { ActionFlow } from '../../shared/contract/types'
import { markAllWorkersUsed } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import '../../shared/cards/A/A151_Minstrel'

const CARD_ID = 'A151_Minstrel'

describe('A151_Minstrel session — viaCardJump worker-less', () => {
  const setup4P = () => {
    const session = new GameSession(undefined, undefined, { playerCount: 4 })
    const state = session.getState().state
    expect(state.players.length).toBe(4)
    const owner = state.players[0]!
    owner.occupationPlayed.push(CARD_ID)
    return { session, state, owner }
  }

  it('returns optional jumpLeaf seq when exactly 1 stage-1 space is unoccupied', () => {
    const { state, owner } = setup4P()

    // Mark only sheep-market unoccupied; occupy other stage-1 spaces.
    const sheep = state.actionSpaces.find((s) => s.id === 'sheep-market')!
    sheep.takenBy = []
    sheep.resources = { ...sheep.resources, sheep: 5 }

    for (const id of ['grain-utilization', 'fencing', 'major-improvement']) {
      const space = state.actionSpaces.find((s) => s.id === id)!
      space.takenBy = [{ playerId: 'opponent', workerId: '1' }]
    }

    // roundActionOrder must include all stage-1 ids in positions 0..3 by round 4
    state.roundActionOrder = state.roundActionOrder.map(() => null)
    state.roundActionOrder[0] = 'sheep-market'
    state.roundActionOrder[1] = 'grain-utilization'
    state.roundActionOrder[2] = 'fencing'
    state.roundActionOrder[3] = 'major-improvement'
    state.round = 4

    const flow = runCardEffectHook(state, owner, CARD_ID, 'onStartReturnHome')
    expect(flow).not.toBeNull()
    const seq = flow as Extract<ActionFlow, { type: 'seq' }>
    expect(seq.type).toBe('seq')
    expect(seq.optional).toBe(true)

    const leaf = seq.children[0] as Extract<ActionFlow, { type: 'leaf' }>
    expect(leaf.type).toBe('leaf')
    expect(leaf.actionId).toBe('place-farmer')
    expect(leaf.expandFlow).toBe(true)
    expect(leaf.actionContext?.viaCardJump).toBe(true)
    expect(leaf.actionContext?.targetSpaceId).toBe('sheep-market')
    expect(leaf.actionContext?.workerId).toBeUndefined()
    expect(leaf.actionContext?.sourceCard).toBe(CARD_ID)
  })

  it('returns null when 0 stage-1 spaces are unoccupied', () => {
    const { state, owner } = setup4P()

    for (const id of ['sheep-market', 'grain-utilization', 'fencing', 'major-improvement']) {
      const space = state.actionSpaces.find((s) => s.id === id)!
      space.takenBy = [{ playerId: 'opponent', workerId: '1' }]
    }
    state.roundActionOrder = state.roundActionOrder.map(() => null)
    state.roundActionOrder[0] = 'sheep-market'
    state.roundActionOrder[1] = 'grain-utilization'
    state.roundActionOrder[2] = 'fencing'
    state.roundActionOrder[3] = 'major-improvement'
    state.round = 4

    const flow = runCardEffectHook(state, owner, CARD_ID, 'onStartReturnHome')
    expect(flow).toBeNull()
  })

  it('returns null when 2+ stage-1 spaces are unoccupied', () => {
    const { state, owner } = setup4P()

    for (const id of ['sheep-market', 'grain-utilization', 'fencing', 'major-improvement']) {
      const space = state.actionSpaces.find((s) => s.id === id)!
      space.takenBy = []
    }
    state.roundActionOrder = state.roundActionOrder.map(() => null)
    state.roundActionOrder[0] = 'sheep-market'
    state.roundActionOrder[1] = 'grain-utilization'
    state.roundActionOrder[2] = 'fencing'
    state.roundActionOrder[3] = 'major-improvement'
    state.round = 4

    const flow = runCardEffectHook(state, owner, CARD_ID, 'onStartReturnHome')
    expect(flow).toBeNull()
  })

  it('returns null when stage-1 spaces have not opened yet (round before posIndex)', () => {
    const { state, owner } = setup4P()

    const sheep = state.actionSpaces.find((s) => s.id === 'sheep-market')!
    sheep.takenBy = []
    state.roundActionOrder = state.roundActionOrder.map(() => null)
    // sheep-market scheduled for round 5 (posIndex 4) — skip in round 4
    state.roundActionOrder[4] = 'sheep-market'
    state.round = 4

    const flow = runCardEffectHook(state, owner, CARD_ID, 'onStartReturnHome')
    expect(flow).toBeNull()
  })

  it('returns null when the only unoccupied stage-one space is not executable', () => {
    const { state, owner } = setup4P()

    const fence = state.actionSpaces.find((s) => s.id === 'fencing')!
    fence.takenBy = []
    for (const id of ['sheep-market', 'grain-utilization', 'major-improvement']) {
      const space = state.actionSpaces.find((s) => s.id === id)!
      space.takenBy = [{ playerId: 'opponent', workerId: '1' }]
    }
    state.roundActionOrder = state.roundActionOrder.map(() => null)
    state.roundActionOrder[0] = 'sheep-market'
    state.roundActionOrder[1] = 'grain-utilization'
    state.roundActionOrder[2] = 'fencing'
    state.roundActionOrder[3] = 'major-improvement'
    state.round = 4

    const flow = runCardEffectHook(state, owner, CARD_ID, 'onStartReturnHome')
    expect(flow).toBeNull()
  })
})

const setupReturnHome = ({ doable = true } = {}) => {
  const session = new GameSession(9951, undefined, { playerCount: 4 })
  stabilizeRandomHands(session.state.players)
  const state = session.state
  state.currentPlayerIndex = 0
  state.round = 5
  state.roundPhase = 'work'
  state.roundActionOrder = [
    'sheep-market', 'grain-utilization', 'fencing', 'major-improvement',
    ...state.roundActionOrder.filter((spaceId) =>
      !['sheep-market', 'grain-utilization', 'fencing', 'major-improvement'].includes(spaceId ?? '')),
  ]
  state.actionSpaces.forEach((space) => { space.takenBy = [] })
  state.players.forEach((player) => {
    player.minorHand = ['__test_placeholder__']
    player.occupationHand = ['__test_placeholder__']
    player.minorPlayed = []
    player.occupationPlayed = []
    player.cardStates = {}
    markAllWorkersUsed(state, player)
  })
  const owner = state.players[0]!
  owner.occupationPlayed = [CARD_ID]
  owner.resources.grain = doable ? 1 : 0
  owner.fields = doable ? [{ row: 0, col: 0, crop: null, remaining: 0 }] : []

  const sink = state.actionSpaces.find((space) => space.id === '__test-worker-sink__')!
  for (const spaceId of ['sheep-market', 'fencing', 'major-improvement']) {
    state.actionSpaces.find((space) => space.id === spaceId)!.takenBy = [sink.takenBy.shift()!]
  }
  session.loadState(state)
  return session
}

describe('A151 Minstrel authoritative return-home flow', () => {
  it('uses the only legal stage-one space after every ordinary person was placed', () => {
    const session = setupReturnHome()
    const workersBefore = structuredClone(session.state.players[0]!.workers)
    expect(
      runCardEffectHook(session.state, session.state.players[0]!, CARD_ID, 'onStartReturnHome'),
    ).not.toBeNull()
    let response = session.performRoundEnd()

    expect(response.ok, response.error).toBe(true)
    expect(response.interaction.sourceCard, JSON.stringify({
      interaction: response.interaction,
      round: response.state.round,
      roundPhase: response.state.roundPhase,
      played: response.state.players[0]!.occupationPlayed,
      placements: response.state.actionSpaces
        .filter((space) => space.takenBy.length > 0)
        .map((space) => ({ id: space.id, takenBy: space.takenBy })),
    })).toBe(CARD_ID)
    expect(response.interaction.stateId).toBe('wait')
    const interactionBefore = structuredClone(response.interaction)
    const playerBefore = structuredClone(response.state.players[0])
    const rejected = session.resolveChoice(0, 'grain-utilization')
    expect(rejected.ok).toBe(false)
    expect(rejected.interaction).toEqual(interactionBefore)
    expect(rejected.state.players[0]).toEqual(playerBefore)

    if (response.interaction.stateId !== 'wait') return
    const accept = response.interaction.request.options?.find((option) => option.value !== '__skip__')
    expect(accept, JSON.stringify(response.interaction)).toBeDefined()
    response = session.resolveChoice(0, accept!.value)
    if (response.interaction.stateId === 'wait' && response.interaction.request.kind === 'choice') {
      const sow = response.interaction.request.options?.find((option) => option.labelKey === 'actions.sow.name')
      expect(sow, JSON.stringify(response.interaction)).toBeDefined()
      response = session.resolveChoice(0, sow!.value)
    }
    response = session.commitSelectionChoice(0, { crops: [{ row: 0, col: 0, crop: 'grain' }] })

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.grain).toBe(0)
    expect(response.state.players[0]!.fields[0]!.stacks).toEqual([{ kind: 'grain', remaining: 3 }])
    expect(response.state.players[0]!.workers).toEqual(workersBefore)
    expect(response.state.events.some((event) =>
      event.type === 'worker.placed' && event.viaCardId === CARD_ID)).toBe(false)
  })

  it('does not offer its unique unoccupied target when the target action is not doable', () => {
    const session = setupReturnHome({ doable: false })
    const response = session.performRoundEnd()

    expect(response.ok, response.error).toBe(true)
    expect(response.interaction.sourceCard).not.toBe(CARD_ID)
    expect(response.state.round).toBe(6)
    expect(response.state.players[0]!.resources.grain).toBe(0)
  })
})
