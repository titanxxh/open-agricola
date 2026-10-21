import { afterEach, describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { createWorkSession } from './_helpers/session-fixtures'
import { requireActiveCardRegistry } from '../../shared/cards/active-registry'
import { rehydrateState, serializeSessionSnapshot } from '../../shared/session/serialization'
import { setWorkersAtHome } from '../../shared/domain/player'

const STEAM = 'C025_SteamMachine'
const COLLECT_REACTION = 'TEST_CollectReaction'
const sessions: GameSession[] = []
afterEach(() => sessions.splice(0).forEach(session => session.dispose()))
const options = (r: SessionResponse) => r.interaction.stateId === 'wait' ? r.interaction.request.options ?? [] : []
function choose(session: GameSession, r: SessionResponse, value: string) {
  expect(options(r).some(o => o.value === value && !o.disabled), JSON.stringify(r.interaction)).toBe(true)
  if (r.interaction.stateId !== 'wait') throw new Error('Expected choice')
  const next = session.resolveChoice(r.interaction.playerIndex, value)
  expect(next.ok, next.error).toBe(true)
  return next
}
function collectReaction(session: GameSession) {
  session.withCtx(() => requireActiveCardRegistry('space-use-lifecycle-test').registerListener({
    id: 'test-collect-reaction', cardIds: [COLLECT_REACTION], actions: ['collect'], phases: ['after'],
    handler: () => ({ sourceCard: COLLECT_REACTION, flow: {
      type: 'leaf', actionId: 'gain', sourceCard: COLLECT_REACTION, params: { food: 1 }, optional: true,
    } }),
  }))
}

describe('complete action-space use reactions', () => {
  it.each([
    { card: 'A124_Knapper', round: 5, from: 'clay', to: 'stone', stone: 1, clay: 0 },
    { card: 'B120_Sweep', round: 8, from: 'wood', to: 'clay', stone: 0, clay: 0 },
  ] as const)('$card pays the current renovation with its before reward, including undo and exact retry', scenario => {
    const session = createWorkSession({ configure: state => {
      state.round = scenario.round
      state.roundActionOrder[4] = 'house-redevelopment'
      const p = state.players[0]!
      p.occupationPlayed = [scenario.card]
      p.houseType = scenario.from
      Object.assign(p.resources, { stone: scenario.stone, clay: scenario.clay, reed: 1, food: 0 })
    } })
    sessions.push(session)
    const use = () => {
      let r = session.takeAction(0, 'house-redevelopment')
      expect(r.ok, r.error).toBe(true)
      for (let step = 0; step < 8 && r.interaction.stateId === 'wait'; step++) {
        const skip = options(r).find(o => o.value === '__skip__')
        if (!skip) break
        r = choose(session, r, skip.value)
      }
      expect(r.state.players[0]!.houseType, JSON.stringify(r.interaction)).toBe(scenario.to)
      expect(r.state.players[0]!.resources).toMatchObject({ stone: 0, clay: 0, reed: 0 })
      const events = r.state.events
      const gain = events.findIndex(e => e.type === 'resource.moved' && e.sourceCardId === scenario.card)
      const pay = events.findIndex(e => e.type === 'resource.paid' && e.paymentFor === 'renovation')
      expect(gain).toBeGreaterThanOrEqual(0)
      expect(pay).toBeGreaterThan(gain)
      expect(events.filter(e => e.type === 'card.triggered' && e.sourceCardId === scenario.card)).toHaveLength(1)
      expect(r.state.log.length).toBeGreaterThan(0)
      expect(r.scores).toHaveLength(2)
    }
    use()
    expect(session.undoAction().ok).toBe(true)
    expect(session.getState().state.players[0]!.houseType).toBe(scenario.from)
    expect(session.getState().state.players[0]!.resources).toMatchObject({ stone: scenario.stone, clay: scenario.clay, reed: 1 })
    use()
  })

  it('finishes Steam Machine baking before a collecting reaction once across JSON restore', () => {
    let session = createWorkSession({ configure: state => {
      const p = state.players[0]!
      state.actionSpaces.find(s => s.id === 'grain-seeds')!.takenBy = [{ playerId: p.id, workerId: p.workers[1]!.id }]
      p.minorPlayed = [STEAM, COLLECT_REACTION]
      p.improvements = ['Major_Fireplace1']
      Object.assign(p.resources, { grain: 1, food: 0 })
      state.actionSpaces.find(s => s.id === 'forest')!.resources.wood = 1
    } })
    sessions.push(session)
    collectReaction(session)
    let r = session.takeAction(0, 'forest')
    expect(r.ok, r.error).toBe(true)
    expect(r.interaction.stateId === 'wait' && r.interaction.sourceCard).toBe(STEAM)
    expect(r.state.players[0]!.resources).toMatchObject({ grain: 1, food: 0, wood: 1 })
    session = new GameSession(rehydrateState(JSON.parse(JSON.stringify(serializeSessionSnapshot(session.state, session)))))
    sessions.push(session)
    collectReaction(session)
    r = choose(session, session.getState(), options(session.getState()).find(o => o.value !== '__skip__')!.value)
    if (r.interaction.stateId === 'wait' && r.interaction.promptKey === 'ui.interactionBakeBreadChoice') {
      r = choose(session, r, 'Major_Fireplace1')
    }
    expect(r.state.players[0]!.resources).toMatchObject({ grain: 0, food: 2, wood: 1 })
    expect(r.interaction.stateId === 'wait' && r.interaction.sourceCard).toBe(COLLECT_REACTION)
    r = choose(session, r, options(r).find(o => o.value !== '__skip__')!.value)
    expect(r.state.players[0]!.resources).toMatchObject({ grain: 0, food: 3, wood: 1 })
    expect(r.state.events.filter(e => e.type === 'card.triggered' && e.sourceCardId === STEAM && 'triggerActionId' in e)).toHaveLength(1)
    expect(r.interaction.stateId === 'wait' && r.interaction.sourceCard).not.toBe(STEAM)
  }, 30_000)
})

describe('space and rule reaction timing', () => {
  function opening({ minors = [], occupation = [], hand = ['__test_placeholder__'], occupationHand = ['__test_placeholder__'], wood = 0, clay = 0, food = 0, playerCount = 2 }: {
    minors?: string[]; occupation?: string[]; hand?: string[]; occupationHand?: string[]; wood?: number; clay?: number; food?: number; playerCount?: number
  }) {
    const session = createWorkSession({ seed: 42, options: { playerCount }, configure: state => {
      state.round = 8
      for (const player of state.players) {
        player.minorHand = ['__test_placeholder__']
        player.occupationHand = ['__test_placeholder__']
        player.minorPlayed = []
        player.occupationPlayed = []
        player.cardStates = {}
        for (const resource of Object.keys(player.resources)) Reflect.set(player.resources, resource, 0)
        setWorkersAtHome(state, player, 2)
      }
      for (const space of state.actionSpaces) space.takenBy = []
      const player = state.players[0]!
      player.minorPlayed = minors
      player.occupationPlayed = occupation
      player.minorHand = hand
      player.occupationHand = occupationHand
      Object.assign(player.resources, { wood, clay, food })
      state.actionSpaces.find(space => space.id === 'forest')!.resources.wood = 3
    } })
    sessions.push(session)
    return session
  }
  function accept(session: GameSession, response: SessionResponse, card: string) {
    let current = response
    if (current.interaction.stateId === 'wait' && current.interaction.request.kind === 'select-trigger') {
      const trigger = options(current).find(option => option.sourceCard === card || option.value === card)
      expect(trigger, JSON.stringify(current.interaction)).toBeDefined()
      current = choose(session, current, trigger!.value)
    }
    expect(current.interaction.stateId === 'wait' && current.interaction.sourceCard, JSON.stringify(current.interaction)).toBe(card)
    const offered = options(current).filter(option => option.value !== '__skip__' && !option.disabled)
    expect(offered).toHaveLength(1)
    expect(options(current).some(option => option.value === '__skip__')).toBe(true)
    return choose(session, current, offered[0]!.value)
  }
  it('checks Woodcraft before an ordinary obtain-wood reaction changes the inventory', () => {
    const session = opening({ minors: ['C058_Woodcraft', 'A048_ShavingHorse'], wood: 3 })
    const beforeScores = session.getState().scores
    const response = accept(session, session.takeAction(0, 'forest'), 'A048_ShavingHorse')
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 5, food: 3 })
    expect(response.scores).toEqual(beforeScores)
    expect(response.state.events.filter(event => event.sourceCardId === 'C058_Woodcraft' && event.type === 'resource.moved')).toEqual([])
    expect(response.state.events.filter(event => event.sourceCardId === 'A048_ShavingHorse' && event.type === 'resource.paid')).toHaveLength(1)
    expect(response.interaction.stateId === 'wait' && response.interaction.request.kind).toBe('confirm-next-player')
  })
  it('spends only the three collected wood at the Bench before Shaving Horse checks the remaining inventory', () => {
    const session = opening({ minors: ['B015_CarpentersBench', 'A048_ShavingHorse'], wood: 4 })
    const pending = accept(session, session.takeAction(0, 'forest'), 'B015_CarpentersBench')
    expect(pending.interaction.stateId === 'wait' && pending.interaction.request.kind).toBe('farm-select')
    const response = session.commitSelectionChoice(0, {
      edges: ['H-0-1', 'H-1-1', 'V-0-1', 'V-0-2'], palisadeEdges: [], extraWood: 0,
    })
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 4, food: 0 })
    expect(response.state.players[0]!.pastures).toHaveLength(1)
    expect(response.state.players[0]!.fenceSegments).toHaveLength(4)
    expect(response.state.events.filter(event => event.sourceCardId === 'A048_ShavingHorse' && event.type === 'resource.paid')).toEqual([])
    expect(response.interaction.stateId === 'wait' && response.interaction.request.kind).toBe('confirm-next-player')
  })
  function playByEquipper(session: GameSession, card: string) {
    let response = accept(session, session.takeAction(0, 'forest'), 'B131_Equipper')
    if (response.interaction.stateId === 'wait' && response.interaction.promptKey === 'ui.interactionChooseImprovement') {
      response = choose(session, response, card)
    }
    expect(response.state.players[0]!.minorPlayed).toContain(card)
    return response
  }
  const playedOnce = (response: SessionResponse, card: string) =>
    expect(response.state.events.filter(event => event.type === 'card.played' && event.cardId === card)).toHaveLength(1)
  it.each([
    // A space before source: this use's before window has already passed when Equipper plays it.
    { card: 'A042_ForestLakeHut', wood: 0, clay: 2, finalWood: 3, finalFood: 0 },
    { card: 'A048_ShavingHorse', wood: 6, clay: 0, finalWood: 8, finalFood: 0 },
  ])('does not replay passed before windows or earlier rule reactions for a card played immediately after: $card', example => {
    const session = opening({ playerCount: 3, occupation: ['B131_Equipper'], hand: [example.card], wood: example.wood, clay: example.clay })
    const response = playByEquipper(session, example.card)
    expect(response.state.players[0]!.resources).toMatchObject({ wood: example.finalWood, clay: 0, food: example.finalFood })
    expect(response.state.events.filter(event => event.type === 'resource.moved' && event.sourceCardId === example.card)).toEqual([])
    expect(response.interaction.stateId === 'wait' && response.interaction.request.kind).toBe('confirm-next-player')
    playedOnce(response, example.card)
  })
  it('discovers a new space-after source played immediately after and offers it on the same use', () => {
    const studies = 'B028_ForestryStudies'
    const occupation = 'A110_Roughcaster'
    const session = opening({ playerCount: 3, occupation: ['B131_Equipper'], hand: [studies], occupationHand: [occupation], food: 2 })
    let response = playByEquipper(session, studies)
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 3, food: 0 })
    response = accept(session, response, studies)
    if (options(response).some(option => option.value === occupation)) response = choose(session, response, occupation)
    expect(response.state.players[0]!.occupationPlayed).toEqual(['B131_Equipper', occupation])
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 1, food: 0 })
    expect(response.state.actionSpaces.find(space => space.id === 'forest')!.resources.wood).toBe(2)
    expect(response.interaction.stateId === 'wait' && response.interaction.request.kind).toBe('confirm-next-player')
    playedOnce(response, studies)
    expect(response.state.events.filter(event => event.type === 'card.triggered' && event.sourceCardId === studies)).toHaveLength(1)
  })
})
