import { describe, expect, it } from 'vitest'
import { computeAnimalZones, type AnimalZone } from '../../shared/domain/animal-zones'
import { captureStateWithHistory } from '../../shared/session/history-streams'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { runCardEffectHook } from '../../shared/cards/card-effects'
import { type GameState } from '../../shared/contract/types'
import { markAllWorkersUsed } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import '../../shared/cards/A/A151_Minstrel'
import assert from 'node:assert/strict'
import { createWorkSession } from './_helpers/session-fixtures'
import { confirmNext, assertRejectedUnchanged , getChoiceOptions } from './_helpers/session-assertions'
import { createScenarioEvidence } from './_helpers/scenario-evidence'

const sessionEvidence = createScenarioEvidence(import.meta.url)

function assertAnimalPlacement(session: GameSession, initial: SessionResponse, totals: [number, number, number], expected: Pick<AnimalZone, 'id' | 'animalType' | 'animalCount' | 'capacity'>[], actor = 0) {
  for (const response of [initial, session.getState()]) {
    const player = response.state.players[actor]!
    assert.deepEqual([player.resources.sheep, player.resources.boar, player.resources.cattle], totals)
    const zones = session.withCtx(() => computeAnimalZones(player, response.state))
    assert.deepEqual(zones.filter(zone => zone.animalCount !== undefined && zone.animalCount > 0).map(zone => ({ id: zone.id, animalType: zone.animalType, animalCount: zone.animalCount, capacity: zone.capacity })), expected)
  }
}

function assertStaleRejected(session: GameSession, command: () => SessionResponse) {
  const before = session.getState()
  const expected = { state: captureStateWithHistory(before.state), interaction: structuredClone(before.interaction), scores: structuredClone(before.scores) }
  const rejected = assertRejectedUnchanged(session, command)
  for (const response of [rejected, session.getState()]) {
    assert.deepEqual({ state: captureStateWithHistory(response.state), interaction: response.interaction, scores: response.scores }, expected)
  }
}

const CARD_ID = 'A151_Minstrel'

describe('A151_Minstrel session — viaCardJump worker-less', () => {
  const setup4P = () => {
    const session = sessionEvidence.track(createWorkSession({ options: { playerCount: 4 } }))
    const state = session.getState().state
    expect(state.players.length).toBe(4)
    const owner = state.players[0]!
    owner.occupationPlayed.push(CARD_ID)
    return { session, state, owner }
  }

  it('returns optional jumpLeaf seq when exactly 1 stage-1 space is unoccupied', () => {
    const { session, state, owner } = setup4P()

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

    const flow = session.withCtx(() => runCardEffectHook(state, owner, CARD_ID, 'onStartReturnHome', undefined, { actionHooks: session.actionHooks }))
    expect(flow).not.toBeNull()
    assert.ok(flow?.type === 'seq')
    const seq = flow
    expect(seq.optional).toBe(true)

    const leaf = seq.children[0]
    assert.ok(leaf?.type === 'leaf')
    expect(leaf.actionId).toBe('place-farmer')
    expect(leaf.expandFlow).toBe(true)
    expect(leaf.actionContext?.viaCardJump).toBe(true)
    expect(leaf.actionContext?.targetSpaceId).toBe('sheep-market')
    expect(leaf.actionContext?.workerId).toBeUndefined()
    expect(leaf.actionContext?.sourceCard).toBe(CARD_ID)
  })

  it('returns null when 0 stage-1 spaces are unoccupied', () => {
    const { session, state, owner } = setup4P()

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

    const flow = session.withCtx(() => runCardEffectHook(state, owner, CARD_ID, 'onStartReturnHome', undefined, { actionHooks: session.actionHooks }))
    expect(flow).toBeNull()
  })

  it('returns null when 2+ stage-1 spaces are unoccupied', () => {
    const { session, state, owner } = setup4P()

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

    const flow = session.withCtx(() => runCardEffectHook(state, owner, CARD_ID, 'onStartReturnHome', undefined, { actionHooks: session.actionHooks }))
    expect(flow).toBeNull()
  })

  it('returns null when stage-1 spaces have not opened yet (round before posIndex)', () => {
    const { session, state, owner } = setup4P()

    const sheep = state.actionSpaces.find((s) => s.id === 'sheep-market')!
    sheep.takenBy = []
    state.roundActionOrder = state.roundActionOrder.map(() => null)
    // sheep-market scheduled for round 5 (posIndex 4) — skip in round 4
    state.roundActionOrder[4] = 'sheep-market'
    state.round = 4

    const flow = session.withCtx(() => runCardEffectHook(state, owner, CARD_ID, 'onStartReturnHome', undefined, { actionHooks: session.actionHooks }))
    expect(flow).toBeNull()
  })

  it('returns null when the only unoccupied stage-one space is not executable', () => {
    const { session, state, owner } = setup4P()

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

    const flow = session.withCtx(() => runCardEffectHook(state, owner, CARD_ID, 'onStartReturnHome', undefined, { actionHooks: session.actionHooks }))
    expect(flow).toBeNull()
  })
})

const setupReturnHome = ({ doable = true } = {}) => {
  const session = sessionEvidence.track(createWorkSession({ seed: 9951, options: { playerCount: 4 } }))
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
  owner.fields = doable ? [{ row: 0, col: 0, stacks: [] }] : []

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
      session.withCtx(() => runCardEffectHook(session.state, session.state.players[0]!, CARD_ID, 'onStartReturnHome', undefined, { actionHooks: session.actionHooks })),
    ).not.toBeNull()
    let response = session.performRoundEnd()

    expect(response.ok, response.error).toBe(true)
    assert.ok(response.interaction.stateId === 'wait')
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

    assert.ok(!(response.interaction.stateId !== 'wait'), JSON.stringify(response.interaction))
    const accept = getChoiceOptions(response)?.find((option) => option.value !== '__skip__')
    expect(accept, JSON.stringify(response.interaction)).toBeDefined()
    response = session.resolveChoice(0, accept!.value)
    if (response.interaction.stateId === 'wait' && response.interaction.request.kind === 'choice') {
      const sow = getChoiceOptions(response)?.find((option) => option.labelKey === 'actions.sow.name')
      expect(sow, JSON.stringify(response.interaction)).toBeDefined()
      response = session.resolveChoice(0, sow!.value)
    }
    expect(response.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'farm-select', farm: { farmType: 'sow' } } })
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
    expect(response.interaction.stateId).toBe('idle')
    expect(response.state.roundPhase).toBe('work')
    expect(response.state.round).toBe(6)
    expect(response.state.players[0]!.resources.grain).toBe(0)
  })
})

describe("A151 command boundaries", () => {
  const CARD = 'A151_Minstrel'
  function save(id: string, value: unknown) {
    sessionEvidence.record(id, value)
  }
  function ok(r: SessionResponse) {
    assert.equal(r.ok, true, r.error)
    return r
  }
  function setup(played = true, configure: (state: GameState) => void = () => {
  }) {
    const s = sessionEvidence.track(createWorkSession({ seed: 4242, options: { playerCount: 4 }, configure(state) {
        state.round = 5
        state.roundActionOrder.splice(0, 4, 'sheep-market', 'grain-utilization', 'fencing', 'major-improvement')
        state.availableMajorImprovements = ['Major_Fireplace1']
        for (const p of state.players) {
          Object.assign(p.resources, { food: 60, wood: 4, clay: 2, reed: 0, stone: 0, grain: 1, vegetable: 0, sheep: 0, boar: 0, cattle: 0 })
          p.fields = [{ row: 0, col: 4, stacks: [] }]
        }
        const p = state.players[0]!
        p.occupationPlayed = played ? [CARD] : []
        p.occupationHand = played ? ['__test_placeholder__'] : [CARD, 'A110_Roughcaster']
        p.stableTiles = [{ row: 0, col: 1 }]
        state.actionSpaces.find(a => a.id === 'sheep-market')!.resources.sheep = 1
        configure(state)
      } }))
    return s
  }
  function turn(s: GameSession, actor: number, space: string) {
    let r = s.getState()
    if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'confirm-next-player')
      r = confirmNext(s, r)
    assert.equal(r.interaction.stateId, 'idle')
    assert.equal(r.state.currentPlayerIndex, actor)
    return ok(s.takeAction(actor, space))
  }
  function drive(s: GameSession, r: SessionResponse, acceptCard = false) {
    for (let n = 0; n < 24 && r.interaction.stateId === 'wait' && r.interaction.request.kind !== 'confirm-next-player'; n++) {
      const i = r.interaction
      if (i.request.kind === 'animal-reorg')
        r = ok(s.resolveChoice(i.playerIndex, 'confirm', { zones: i.request.zones }))
      else if (i.request.kind === 'confirm-player-switch')
        r = ok(s.resolveChoice(i.request.fromPlayerIndex, 'confirm'))
      else if (i.request.kind === 'farm-select') {
        if (i.request.farm.farmType === 'fence')
          r = ok(s.commitSelectionChoice(i.playerIndex, { edges: ['H-0-2', 'H-1-2', 'V-0-2', 'V-0-3'], extraWood: 0 }))
        else if (i.request.farm.farmType === 'sow')
          r = ok(s.commitSelectionChoice(i.playerIndex, { crops: [{ row: 0, col: 4, crop: 'grain' }] }))
        else
          assert.fail(JSON.stringify(i))
      }
      else if (i.request.kind === 'choice' || i.request.kind === 'select-trigger') {
        const o = i.request.options.find(o => o.value === 'Major_Fireplace1' || o.value === 'major:Major_Fireplace1' || ('labelKey' in o && o.labelKey === 'actions.sow.name')) ?? i.request.options.find(o => i.sourceCard === CARD && !acceptCard ? o.value === '__skip__' || o.value === '__done__' : o.value !== '__skip__' && o.value !== '__done__')
        assert.ok(o, JSON.stringify(i))
        r = ok(s.resolveChoice(i.playerIndex, o.value))
      }
      else
        assert.fail(JSON.stringify(i))
    }
    assert.ok(r.interaction.stateId === 'idle' || (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'confirm-next-player'), JSON.stringify(r.interaction))
    return r
  }
  function end(s: GameSession, spaces: string[], acceptCard = false, expectOffer = true) {
    let r = s.getState()
    for (const [n, space] of spaces.entries())
      r = drive(s, turn(s, n % 4, space))
    assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'confirm-next-player')
    const pending = confirmNext(s, r)
    if (expectOffer) {
      assert.ok(pending.interaction.stateId === 'wait' && pending.interaction.request.kind === 'choice', JSON.stringify(pending.interaction))
      assert.equal(pending.interaction.sourceCard, CARD)
      assert.equal(pending.interaction.playerIndex, 0)
      assert.ok(pending.interaction.request.options.some(option => option.sourceCard === CARD && !option.disabled && option.value !== '__skip__'))
    }
    else {
      assert.equal(pending.interaction.stateId, 'idle', JSON.stringify(pending.interaction))
      assert.equal(pending.state.round, 6)
      assert.equal(pending.state.roundPhase, 'work')
      assert.equal(pending.state.currentPlayerIndex, 0)
    }
    const done = drive(s, pending, acceptCard)
    assert.equal(done.interaction.stateId, 'idle', JSON.stringify(done.interaction))
    assert.equal(done.state.currentPlayerIndex, 0)
    assert.equal(done.state.roundPhase, 'work')
    assert.equal(done.state.round, 6)
    return { pending, r: done }
  }
  const EIGHT = ['day-laborer', 'fencing', 'major-improvement', 'grain-utilization', 'forest', 'reed-bank', 'clay-pit', 'fishing']
  it("real eight placements leave one vacant stage one space for workerless return home use", () => {
    const s = setup()
    const workers = structuredClone(s.getState().state.players.map(player => player.workers))
    const { pending, r } = end(s, EIGHT, true)
    assert.deepEqual(r.state.players.map(player => player.workers), workers)
    assert.ok(!r.state.events.some(event => event.type === 'worker.placed' && event.viaCardId === CARD))
    assert.equal(r.state.round, 6)
    assert.equal(r.state.players[0]!.resources.sheep, 1)
    assertAnimalPlacement(s, r, [1, 0, 0], [{ id: 'house:2-0', animalType: 'sheep', animalCount: 1, capacity: 1 }])
    assert.equal(r.state.players[0]!.workers.filter(w => w.isActive).length, 2)
    assert.equal(r.state.actionSpaces.find(a => a.id === 'sheep-market')!.resources.sheep, 1)
    assert.equal(r.state.actionSpaces.find(a => a.id === 'sheep-market')!.takenBy.length, 0)
    save('A151-N1', { pending, r })
  })
  it("decline and hand leave vacant sheep accumulation untouched until next refill", () => {
    for (const played of [true, false]) {
      const s = setup(played)
      const { pending, r } = end(s, EIGHT, false, played)
      assert.equal(r.state.players[0]!.resources.sheep, 0)
      assertAnimalPlacement(s, r, [0, 0, 0], [])
      assert.equal(r.state.actionSpaces.find(a => a.id === 'sheep-market')!.resources.sheep, 2)
      save(`A151-N2-${played}`, { pending, r })
    }
  })
  it("zero and two vacant stage one spaces cannot offer extra action", () => {
    for (const spaces of [['sheep-market', 'fencing', 'major-improvement', 'grain-utilization', 'forest', 'reed-bank', 'clay-pit', 'fishing'], ['day-laborer', 'fencing', 'major-improvement', 'traveling-players', 'forest', 'reed-bank', 'clay-pit', 'fishing']]) {
      const s = setup()
      const { pending, r } = end(s, spaces, true, false)
      assert.equal(r.state.players[0]!.resources.sheep, spaces[0] === 'sheep-market' ? 1 : 0)
      assert.ok(pending.interaction.stateId !== 'wait' || pending.interaction.sourceCard !== CARD)
      save(`A151-N3-${spaces[0]}`, { pending, r })
    }
  })
  it("sole unaffordable major target cannot offer unpaid action or stale return use", () => {
    const s = setup(true, state => state.players[0]!.resources.clay = 0)
    const spaces = ['day-laborer', 'fencing', 'sheep-market', 'grain-utilization', 'forest', 'reed-bank', 'grove', 'fishing']
    const { pending, r } = end(s, spaces, true, false)
    assert.ok(pending.interaction.stateId !== 'wait' || pending.interaction.sourceCard !== CARD)
    assert.equal(r.state.players[0]!.improvements.length, 0)
    assertRejectedUnchanged(s, () => s.resolveChoice(0, 'reuse-return-home'))
    const replaySession = setup()
    const { pending: issued, r: completed } = end(replaySession, EIGHT, true)
    assert.ok(issued.interaction.stateId === 'wait' && issued.interaction.request.kind === 'choice')
    const reuse = getChoiceOptions(issued).find(option => !option.disabled && option.sourceCard === CARD && option.value !== '__skip__')
    assert.ok(reuse)
    assert.equal(completed.state.players[0]!.resources.sheep, 1)
    assertAnimalPlacement(replaySession, completed, [1, 0, 0], [{ id: 'house:2-0', animalType: 'sheep', animalCount: 1, capacity: 1 }])
    assert.equal(completed.state.round, 6)
    assertStaleRejected(replaySession, () => replaySession.resolveChoice(0, reuse.value))
    save('A151-N4', { pending, r })
  })
})
