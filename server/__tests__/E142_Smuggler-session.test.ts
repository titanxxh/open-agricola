import { setWorkersAtHome, markAllWorkersUsed, setActiveWorkerCount } from '../../shared/domain/player'
import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { type ActionChoiceOption, type Resource, type GameState } from '../../shared/contract/types'
import '../../shared/cards/B/B021_HayloftBarn'
import '../../shared/cards/E/E142_Smuggler'
import assert from 'node:assert/strict'
import { createWorkSession } from './_helpers/session-fixtures'
import { assertRejectedUnchanged, getChoiceOptions } from './_helpers/session-assertions'
import { createScenarioEvidence } from './_helpers/scenario-evidence'

const evidence = createScenarioEvidence(import.meta.url)

const CARD_ID = 'E142_Smuggler'
const HAYLOFT_BARN = 'B021_HayloftBarn'

const setup = () => {
  const session = evidence.track(createWorkSession({ seed: 42, options: { playerCount: 2 } }))
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.round = 4
  state.currentPlayerIndex = 0
  state.players.forEach((player) => {
    setActiveWorkerCount(player, 1)
    markAllWorkersUsed(state, player)
    player.resources.food = 10
  })

  const player = state.players[0]!
  player.occupationPlayed.push(CARD_ID)
  player.minorPlayed.push(HAYLOFT_BARN)
  player.cardStates[HAYLOFT_BARN] = {
    extraData: { foodCount: 2 },
    infobox: '2 Food',
  }
  player.resources.wood = 1
  player.resources.grain = 0
  player.resources.stone = 0

  session.loadState(state)
  return session
}

const exchangeOption = (
  resp: SessionResponse,
  resourcesPaid: Partial<Resource>,
  resourcesGained: Partial<Resource>,
): ActionChoiceOption => {
  expect(resp.interaction.stateId).toBe('wait')
  if (resp.interaction.stateId !== 'wait') throw new Error('expected Smuggler choice')
  const option = getChoiceOptions(resp)?.find((entry) =>
    entry.sourceCard === CARD_ID
    && entry.effectPreview?.kind === 'resourceExchange'
    && JSON.stringify(entry.effectPreview.resourcesPaid) === JSON.stringify(resourcesPaid)
    && JSON.stringify(entry.effectPreview.resourcesGained) === JSON.stringify(resourcesGained)
  )
  expect(option).toBeDefined()
  return option!
}

describe('E142_Smuggler session', () => {
  it('chains wood to grain and the gained grain to stone as two exchanges', () => {
    const session = setup()
    let resp = session.performRoundEnd()

    resp = session.resolveChoice(0, exchangeOption(resp, { wood: 1 }, { grain: 1 }).value)
    expect(resp.state.players[0]!.cardStates[HAYLOFT_BARN]?.extraData?.foodCount).toBe(1)
    resp = session.resolveChoice(0, exchangeOption(resp, { grain: 1 }, { stone: 1 }).value)

    const player = resp.state.players[0]!
    expect(player.resources).toMatchObject({ wood: 0, grain: 0, stone: 1 })
    expect(resp.state.events.filter((event) =>
      event.type === 'resource.exchanged' && event.exchangeSource === CARD_ID
    )).toEqual([
      expect.objectContaining({ paid: { wood: 1 }, gained: { grain: 1 } }),
      expect.objectContaining({ paid: { grain: 1 }, gained: { stone: 1 } }),
    ])
  })

  it('allows passing both exchange stages', () => {
    const session = setup()
    let resp = session.performRoundEnd()

    expect(exchangeOption(resp, { wood: 1 }, { grain: 1 })).toBeDefined()
    resp = session.resolveChoice(0, '__skip__')
    expect(exchangeOption(resp, { wood: 1 }, { grain: 1 })).toBeDefined()
    resp = session.resolveChoice(0, '__skip__')

    expect(resp.state.players[0]!.resources).toMatchObject({ wood: 1, grain: 0, stone: 0 })
    expect(resp.state.events.some((event) =>
      event.type === 'resource.exchanged' && event.exchangeSource === CARD_ID
    )).toBe(false)
  })
})

describe('E142 Smuggler parity', () => {
  const CARD_ID = 'E142_Smuggler'

  const FILLER = '__test_placeholder__'

  const setup = ({
    played = true, wood = 0, grain = 0, stone = 0,
  }: {
    played?: boolean
    wood?: number
    grain?: number
    stone?: number
  } = {}) => {
    const session = evidence.track(createWorkSession({ seed: 6142, options: { playerCount: 3 } }))
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.currentPlayerIndex = 0
    state.round = 4
    state.roundPhase = 'work'
    state.actionSpaces.forEach((space) => { space.takenBy = [] })
    state.players.forEach((player, index) => {
      setWorkersAtHome(state, player, index === 0 ? 2 : 0)
      player.minorHand = [FILLER]
      player.occupationHand = [FILLER]
      player.minorPlayed = []
      player.occupationPlayed = []
      player.improvements = []
      player.cardStates = {}
      Object.assign(player.resources, {
        wood: 0, clay: 0, reed: 0, stone: 0, food: 20, grain: 0, vegetable: 0,
        sheep: 0, boar: 0, cattle: 0, begging: 0,
      })
    })
    const owner = state.players[0]!
    owner.occupationHand = played ? [FILLER] : [CARD_ID]
    owner.occupationPlayed = played ? [CARD_ID] : []
    Object.assign(owner.resources, { wood, grain, stone })
    if (played) state.players.forEach((player) => markAllWorkersUsed(state, player))
    session.loadState(state)
    return session
  }

  const options = (response: SessionResponse) => response.interaction.stateId === 'wait'
    ? getChoiceOptions(response) ?? []
    : []

  const exchangeOption = (
    response: SessionResponse,
    resourcesPaid: Partial<Resource>,
    resourcesGained: Partial<Resource>,
  ): ActionChoiceOption => {
    expect(response.interaction.stateId).toBe('wait')
    if (response.interaction.stateId !== 'wait') throw new Error('expected Smuggler choice')
    const option = options(response).find((entry) =>
      entry.sourceCard === CARD_ID
      && entry.effectPreview?.kind === 'resourceExchange'
      && JSON.stringify(entry.effectPreview.resourcesPaid) === JSON.stringify(resourcesPaid)
      && JSON.stringify(entry.effectPreview.resourcesGained) === JSON.stringify(resourcesGained)
    )
    expect(option, JSON.stringify(response.interaction)).toBeDefined()
    return option!
  }

  const exchange = (
    session: GameSession, response: SessionResponse,
    resourcesPaid: Partial<Resource>, resourcesGained: Partial<Resource>,
  ) => session.resolveChoice(
    response.interaction.stateId === 'wait' ? response.interaction.playerIndex : 0,
    exchangeOption(response, resourcesPaid, resourcesGained).value,
  )

  it('E142 S4: both stages may perform wood-to-grain when two wood are available', () => {
    const session = setup({ wood: 2 })
    let response = session.performRoundEnd()
    response = exchange(session, response, { wood: 1 }, { grain: 1 })
    response = exchange(session, response, { wood: 1 }, { grain: 1 })

    expect(response.state.players[0]!.resources).toMatchObject({ wood: 0, grain: 2, stone: 0 })
  })

  it('E142 S5: without wood or grain Smuggler performs no exchange', () => {
    const response = setup().performRoundEnd()

    expect(response.state.players[0]!.resources).toMatchObject({ wood: 0, grain: 0, stone: 0 })
  })
})

describe('E142 rule boundaries', () => {

  const SMUGGLER = 'E142_Smuggler'

  function setup(configure: (state: GameState) => void = () => { }) {
    const session = evidence.track(createWorkSession({
      seed: 4242, options: { playerCount: 3 }, configure(state) {
        state.round = 4
        for (const p of state.players)
          Object.assign(p.resources, { wood: 0, clay: 0, reed: 0, stone: 0, grain: 0, vegetable: 0, food: 20 })
        const owner = state.players[0]!
        owner.occupationPlayed = [SMUGGLER]
        configure(state)
      }
    }))
    return session
  }

  function ok(r: SessionResponse) { assert.equal(r.ok, true, r.error); return r }

  function wait(r: SessionResponse) { ok(r); assert(r.interaction.stateId === 'wait'); return r.interaction }

  function options(r: SessionResponse) { const request = wait(r).request; assert(request.kind === 'choice'); return request.options }

  function harvest(wood: number, grain: number) {
    const s = setup(state => {
      state.players[0]!.resources.wood = wood
      state.players[0]!.resources.grain = grain
      for (const p of state.players)
        markAllWorkersUsed(state, p)
    })
    return { s, r: ok(s.performRoundEnd()) }
  }

  function trade(r: SessionResponse, paid: Partial<Resource>, gained: Partial<Resource>) {
    const choice = options(r).find(o => o.sourceCard === SMUGGLER
      && o.effectPreview?.kind === 'resourceExchange'
      && JSON.stringify(o.effectPreview.resourcesPaid) === JSON.stringify(paid)
      && JSON.stringify(o.effectPreview.resourcesGained) === JSON.stringify(gained))
    assert(choice, JSON.stringify(r.interaction))
    return choice.value
  }

  function stocks(r: SessionResponse) {
    const p = r.state.players[0]!
    return {
      wood: p.resources.wood, grain: p.resources.grain, stone: p.resources.stone,
      exchanges: r.state.events.filter(e => e.type === 'resource.exchanged' && e.exchangeSource === SMUGGLER).length
    }
  }

  it("unaffordable first branch and wrong actor are rejected before a legal wood-to-stone chain", () => {
    const control = harvest(0, 1)
    const unavailable = trade(control.r, { grain: 1 }, { stone: 1 })
    const { s, r } = harvest(1, 0)
    assert(!options(r).some(o => o.value === unavailable))
    assertRejectedUnchanged(s, () => s.resolveChoice(0, unavailable))
    const first = trade(r, { wood: 1 }, { grain: 1 })
    assertRejectedUnchanged(s, () => s.resolveChoice(1, first))
    const step = ok(s.resolveChoice(0, first))
    assert.deepEqual(stocks(step), { wood: 0, grain: 1, stone: 0, exchanges: 1 })
    const final = ok(s.resolveChoice(0, trade(step, { grain: 1 }, { stone: 1 })))
    assert.deepEqual(stocks(final), { wood: 0, grain: 0, stone: 1, exchanges: 2 })
    assertRejectedUnchanged(s, () => s.resolveChoice(0, first))
  })

  it("two identical exchanges consume two goods and a stale third request cannot spend another", () => {
    const { s, r } = harvest(3, 0)
    const first = trade(r, { wood: 1 }, { grain: 1 })
    const second = ok(s.resolveChoice(0, first))
    const final = ok(s.resolveChoice(0, trade(second, { wood: 1 }, { grain: 1 })))
    assert.deepEqual(stocks(final), { wood: 1, grain: 2, stone: 0, exchanges: 2 })
    assertRejectedUnchanged(s, () => s.resolveChoice(0, first))
  })

  it("declining one or both stages never invents a good or expands the remaining quota", () => {
    for (const { exchangeSecond, expected } of [
      { exchangeSecond: false, expected: { wood: 1, grain: 0, stone: 0, exchanges: 0 } },
      { exchangeSecond: true, expected: { wood: 0, grain: 1, stone: 0, exchanges: 1 } },
    ]) {
      const { s, r } = harvest(1, 0)
      assert.equal(wait(r).sourceCard, SMUGGLER)
      const second = ok(s.resolveChoice(0, '__skip__'))
      const final = ok(s.resolveChoice(0, exchangeSecond ? trade(second, { wood: 1 }, { grain: 1 }) : '__skip__'))
      assert.deepEqual(stocks(final), expected)
    }
  })

  it("exchanges cannot be requested from the ordinary work phase", () => {
    const s = setup(state => { state.players[0]!.resources.wood = 1 })
    const control = harvest(1, 0)
    assertRejectedUnchanged(s, () => s.resolveChoice(0, trade(control.r, { wood: 1 }, { grain: 1 })))
    assert.deepEqual(stocks(s.getState()), { wood: 1, grain: 0, stone: 0, exchanges: 0 })
    ok(s.takeAction(0, 'grain-seeds'))
    assert.equal(s.state.players[0]!.resources.grain, 1)
  })

  it("a later controlled harvest restores exactly two exchanges", () => {
    const { s, r } = harvest(4, 0)
    let next = ok(s.resolveChoice(0, trade(r, { wood: 1 }, { grain: 1 })))
    next = ok(s.resolveChoice(0, trade(next, { wood: 1 }, { grain: 1 })))
    assert.deepEqual(stocks(next), { wood: 2, grain: 2, stone: 0, exchanges: 2 })
    assert.equal(next.state.round, 5)
    for (const round of [5, 6, 7]) {
      assert.equal(s.state.round, round)
      for (const p of s.state.players)
        markAllWorkersUsed(s.state, p)
      next = ok(s.performRoundEnd())
    }
    next = ok(s.resolveChoice(0, trade(next, { wood: 1 }, { grain: 1 })))
    const second = trade(next, { wood: 1 }, { grain: 1 })
    next = ok(s.resolveChoice(0, second))
    assert.deepEqual(stocks(next), { wood: 0, grain: 4, stone: 0, exchanges: 4 })
    assertRejectedUnchanged(s, () => s.resolveChoice(0, second))
  })
})
