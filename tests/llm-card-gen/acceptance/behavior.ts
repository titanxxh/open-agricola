import assert from 'node:assert/strict'
import { fixtures, type CardFixture } from '../fixtures'
import { Driver } from '../driver'
import { ALL_ZERO_RESOURCES, autoAdvanceRoundEnd, buildSessionWithLLMCard, markAllWorkersUsed, setActiveWorkerCount, setHand, setWorkersAtHome } from '../session-helpers'
import type { GameSession } from '../../../server/game/authoritative-session'
import type { FixtureContext } from '../fixtures/types'
import type { GameState } from '../../../shared/contract/types'
import { FOLLOWUP_ID, type AcceptanceInput } from './inputs'

export type BehaviorEvidence = { ok: boolean; checks: string[]; reason?: string }
type Scenario = (session: GameSession, driver: Driver, ctx: FixtureContext) => void

function fresh(fixture: CardFixture, source: string, scenario: Scenario, cattle?: number): void {
  const { session, ctx } = fixture.setup(source, { cattle })
  try { scenario(session, new Driver(session, ctx), ctx) } finally { session.dispose() }
}

function assertSourceGain(state: GameState, id: string, resource: string, amount: number, ownerId: string): void {
  const events = state.events.filter(event => event.type === 'resource.moved' && event.sourceCardId === id)
  assert.ok(events.length > 0, 'Missing resource event attributed to the generated card')
  const serialized = JSON.stringify(events)
  assert.ok(serialized.includes(ownerId), 'Source event must identify the card owner')
  assert.ok(events.some(event => event.type === 'resource.moved' && event.resources[resource as keyof typeof event.resources] === amount), 'Source event has the wrong reward')
  assert.ok(state.log.some(entry => JSON.stringify(entry.params ?? {}).includes(id)), 'Missing visible log attribution')
}

function room(driver: Driver, player = 0): void {
  let result = driver.takeActionRaw(player, 'farm-expansion')
  if (result.interaction.request?.kind === 'choice') {
    const choice = result.interaction.request.options?.find(option => option.value.includes('construct'))
    assert.ok(choice, 'Room construction must be offered explicitly')
    result = driver.resolveChoiceRaw(player, choice.value)
  }
  assert.equal(result.interaction.request?.farm?.farmType, 'room')
  const tile = result.interaction.request?.farm?.selectableTiles?.[0]
  assert.ok(tile, 'Room construction needs a legal tile')
  driver.commitSelectionRaw(player, { rooms: [tile] })
}

function actionCase(fixture: CardFixture, source: string, actor: number, space: string, played: boolean, expectedOwnerWood: number, expectedActorWood: number): void {
  fresh(fixture, source, (session, driver) => {
    const state = session.getState().state
    state.actionSpaces.forEach(item => { item.takenBy = [] })
    state.players.forEach((player, index) => {
      player.resources = { ...ALL_ZERO_RESOURCES }
      setActiveWorkerCount(player, index === actor ? 2 : 0)
      setWorkersAtHome(state, player, index === actor ? 2 : 0)
    })
    if (!played) { state.players[0].occupationPlayed = []; state.players[0].minorPlayed = [] }
    state.currentPlayerIndex = actor
    state.actionSpaces.find(item => item.id === 'forest')!.resources.wood = 3
    state.actionSpaces.find(item => item.id === 'clay-pit')!.resources.clay = 2
    session.loadState(state)
    const before = session.getState()
    driver.takeAction(actor, space)
    const after = session.getState()
    assert.equal(after.state.players[0].resources.wood, expectedOwnerWood)
    assert.equal(after.state.players[actor].resources.wood, expectedActorWood)
    assert.equal(after.state.actionSpaces.find(item => item.id === space)!.takenBy.length, 1)
    assert.equal(after.scores?.[1]?.total, before.scores?.[1]?.total)
    if (expectedOwnerWood > (actor === 0 ? 3 : 0)) assertSourceGain(after.state, fixture.cardId, 'wood', 1, state.players[0].id)
    else assert.equal(after.state.events.filter(event => event.type === 'resource.moved' && event.sourceCardId === fixture.cardId).length, 0)
  })
}

function additionalChecks(fixture: CardFixture, source: string, checks: string[]): void {
  if (fixture.id.startsWith('M1-')) {
    for (const [occupations, wood] of [[2, 1], [3, 0]]) fresh(fixture, source, (session, driver) => {
      const state = session.getState().state
      state.players[0].occupationPlayed = Array.from({ length: occupations }, (_, i) => `__occupation_${i}`)
      state.players[0].resources = { ...ALL_ZERO_RESOURCES, wood }
      session.loadState(state)
      const response = driver.openMinorChoice(0)
      if (response.interaction.request?.options?.some(option => option.value === fixture.cardId)) {
        assert.equal(session.resolveChoice(0, fixture.cardId).ok, false, 'Unavailable card was accepted')
      }
      const after = session.getState().state
      assert.equal(after.players[0].minorPlayed.includes(fixture.cardId), false)
      assert.equal(after.players[0].resources.wood, wood)
      assert.equal(after.players[0].resources.food, 0)
      checks.push(`M1 rejects ${occupations} occupations / ${wood} wood`)
    })
  }
  if (fixture.id.startsWith('M2-')) {
    actionCase(fixture, source, 1, 'forest', true, 0, 3)
    actionCase(fixture, source, 0, 'clay-pit', true, 0, 0)
    actionCase(fixture, source, 0, 'forest', false, 3, 3)
    fresh(fixture, source, (session, driver, ctx) => {
      fixture.scenario(driver, ctx)
      const state = session.getState().state
      state.players.forEach(player => markAllWorkersUsed(state, player))
      autoAdvanceRoundEnd(session)
      const before = session.getState().state.players[0].resources.wood
      driver.takeAction(0, 'forest')
      assert.equal(session.getState().state.players[0].resources.wood - before, 4)
    })
    checks.push('M2 rejects opponents, other actions and unplayed ownership; repeats next round')
  }
  if (fixture.id.startsWith('M5-')) {
    fresh(fixture, source, (session, driver) => {
      const state = session.getState().state
      state.players[0].occupationPlayed = []
      session.loadState(state)
      driver.takeAction(0, 'house-redevelopment')
      assert.equal(session.getState().state.players[0].resources.reed, 0, 'Unplayed card discounted renovation')
    })
    fresh(fixture, source, (session, driver) => {
      const state = session.getState().state
      state.players[0].houseType = 'clay'
      state.players[0].resources = { ...ALL_ZERO_RESOURCES, stone: 3, reed: 1 }
      session.loadState(state)
      driver.takeAction(0, 'house-redevelopment')
      const after = session.getState().state
      assert.equal(after.players[0].houseType, 'stone')
      assert.equal(after.players[0].resources.reed, 1)
      assert.equal(after.players[0].resources.stone, 0)
      const payment = after.events.find(event => event.type === 'resource.paid' && event.paymentFor === 'renovation')
      assert.ok(payment?.type === 'resource.paid')
      assert.equal(payment.resources.reed ?? 0, 0)
    })
    fresh(fixture, source, (session, driver) => {
      const state = session.getState().state
      state.players[0].resources = { ...ALL_ZERO_RESOURCES, wood: 10, reed: 2 }
      session.loadState(state)
      room(driver)
      assert.equal(session.getState().state.players[0].resources.reed, 0, 'Renovation discount leaked into room construction')
    })
    checks.push('M5 unplayed, other action and second renovation; actual discounted payment')
  }
  if (fixture.id.startsWith('M8-')) {
    actionCase(fixture, source, 0, 'forest', true, 4, 4)
    actionCase(fixture, source, 1, 'clay-pit', true, 0, 0)
    actionCase(fixture, source, 1, 'forest', false, 0, 3)
    checks.push('M8 own and opposing actors, wrong action and unplayed owner')
  }
  if (fixture.id.startsWith('M11-')) fresh(fixture, source, (session, driver) => {
    const state = session.getState().state
    setHand(state, 0, { minor: ['B016_MiningHammer'] })
    session.loadState(state)
    let result = driver.takeActionRaw(0, 'major-improvement')
    if (!session.getState().state.players[0].minorPlayed.includes('B016_MiningHammer')) {
      assert.ok(result.interaction.request?.options?.some(option => option.value === 'B016_MiningHammer'))
      result = driver.resolveChoiceRaw(0, 'B016_MiningHammer')
      if (!session.getState().state.players[0].minorPlayed.includes('B016_MiningHammer')) {
        const free = result.interaction.request?.options?.find(option => option.labelParams?.resourcesPaid && Object.values(option.labelParams.resourcesPaid).every(amount => amount === 0))
        assert.ok(free, 'A one-wood improvement should be free with the capped two-wood discount')
        driver.resolveChoice(0, free.value)
      }
    }
    const player = session.getState().state.players[0]
    assert.ok(player.minorPlayed.includes('B016_MiningHammer'))
    assert.equal(player.resources.wood, 3, 'The excess discount must not generate wood')
    assert.equal(player.resources.clay, 2)
    assert.equal(player.resources.reed, 2)
    assert.equal(player.resources.food, 1) // The builtin card's own onBuy.
    checks.push('M11 discount larger than purchase cost neither charges nor creates wood')
  })
}

function combined(source: string, checks: string[]): void {
  const id = 'CUSTOM_M12_ForestRecorder'
  for (const variant of ['six-rounds', 'opponent', 'other-action', 'unplayed'] as const) {
    const built = buildSessionWithLLMCard(source, { cardId: id, cardType: 'occupation', cardName: 'Forest Recorder' })
    const { session } = built
    const ctx: FixtureContext = { cardId: id, cardData: built.cardData, manifest: built.manifest }
    const driver = new Driver(session, ctx)
    try {
      const state = session.getState().state
      const actor = variant === 'opponent' ? 1 : 0
      state.players.forEach((player, index) => {
        player.resources = { ...ALL_ZERO_RESOURCES, food: 30 }
        setActiveWorkerCount(player, index === actor ? 2 : 0)
        setWorkersAtHome(state, player, index === actor ? 2 : 0)
      })
      if (variant !== 'unplayed') state.players[0].occupationPlayed.push(id)
      state.currentPlayerIndex = actor
      session.loadState(state)
      for (let index = 1; index <= (variant === 'six-rounds' ? 6 : 1); index++) {
        const before = session.getState()
        const food = before.state.players[0].resources.food
        const score = before.scores![0].total
        const eventsBefore = before.state.events.length
        driver.takeAction(actor, variant === 'other-action' ? 'clay-pit' : 'forest')
        const after = session.getState()
        const triggers = variant === 'six-rounds'
        assert.equal(after.state.players[0].resources.food - food, triggers ? 1 : 0)
        assert.equal(after.scores![0].total - score, triggers && index % 3 === 0 ? 1 : 0)
        const newEvents = after.state.events.slice(eventsBefore).filter(event => event.type === 'resource.moved' && event.sourceCardId === id)
        assert.equal(newEvents.length, triggers ? 1 : 0)
        if (triggers) assertSourceGain(after.state, id, 'food', 1, after.state.players[0].id)
        if (triggers && index < 6) {
          after.state.players.forEach(player => markAllWorkersUsed(after.state, player))
          autoAdvanceRoundEnd(session)
          assert.equal(session.getState().state.round, index + 1)
        }
      }
      checks.push(`M12 ${variant}`)
    } finally { session.dispose() }
  }
}

function followup(source: string, checks: string[]): void {
  const { session, cardData, manifest } = buildSessionWithLLMCard(source, { cardId: FOLLOWUP_ID, cardType: 'minor', cardName: 'Workshop Mallet' })
  try {
    const meta = cardData.cardJson
    assert.equal(meta.id, FOLLOWUP_ID)
    assert.equal(meta.name, 'Workshop Mallet')
    assert.deepEqual(meta.cost, { wood: 1 })
    assert.equal(meta.vp, 1)
    assert.ok(Array.isArray(meta.desc) && meta.desc.length > 0)
    const locales = meta.locales as Record<string, { name?: string; desc?: string[] }> | undefined
    assert.equal(locales?.zh?.name, '工坊木槌')
    assert.ok(locales?.zh?.desc?.length)
    const state = session.getState().state
    state.players.forEach((player, index) => {
      setActiveWorkerCount(player, index === 0 ? 3 : 0)
      setWorkersAtHome(state, player, index === 0 ? 3 : 0)
      player.resources = { ...ALL_ZERO_RESOURCES }
    })
    Object.assign(state.players[0].resources, { wood: 4, clay: 2 })
    setHand(state, 0, { minor: [FOLLOWUP_ID] })
    session.loadState(state)
    const ctx = { cardId: FOLLOWUP_ID, cardData, manifest }
    const driver = new Driver(session, ctx)
    driver.playMinorViaMeetingPlace(0, { wood: 1 })
    assert.equal(session.getState().state.players[0].resources.wood, 3)
    assert.equal(session.getState().state.players[0].resources.food, 2, 'Follow-up lost B onBuy or used adopted A/chat C')
    assertSourceGain(session.getState().state, FOLLOWUP_ID, 'food', 2, state.players[0].id)
    setHand(session.getState().state, 0, { minor: ['B043_Chophouse', 'D059_EarthOven'] })
    const choices = driver.takeActionRaw(0, 'major-improvement')
    assert.ok(choices.interaction.request?.options?.some(option => option.value === 'B043_Chophouse'))
    assert.ok(!choices.interaction.request?.options?.some(option => option.value === 'D059_EarthOven'))
    const payment = driver.resolveChoiceRaw(0, 'B043_Chophouse')
    const options = payment.interaction.request?.options as Array<{ value: string; labelParams?: { resourcesPaid?: Record<string, number> } }>
    assert.ok(options?.length)
    const free = options.find(option => option.labelParams?.resourcesPaid && Object.values(option.labelParams.resourcesPaid).every(amount => amount === 0))
    assert.ok(free, 'Selected B discount did not increase from one to two wood')
    driver.resolveChoice(0, free.value)
    const after = session.getState().state.players[0]
    assert.equal(after.resources.wood, 3, 'Capped discount produced resources or charged wood')
    assert.equal(after.resources.clay, 2)
    assert.equal(after.resources.food, 2)
    assert.ok(after.minorPlayed.includes('B043_Chophouse'))
    checks.push('M13 preserves B identity, cost, VP, locales and onBuy; mandatory bounded purchase discount')
  } finally { session.dispose() }
}

export function evaluateBehavior(input: AcceptanceInput, source: string): BehaviorEvidence {
  const checks: string[] = []
  try {
    if (input.oracle === 'M12') combined(source, checks)
    else if (input.oracle === 'M13') followup(source, checks)
    else {
      const fixture = fixtures.find(item => item.id === input.oracle)
      assert.ok(fixture, `Unknown behavior oracle ${input.oracle}`)
      for (const cattle of fixture.id.startsWith('M4-') ? [1, 2, 4, 6] : [undefined]) fresh(fixture, source, (session, driver, ctx) => {
        fixture.scenario(driver, ctx)
        const result = fixture.assert(session, ctx)
        assert.ok(result.ok, result.reason)
        assert.ok(driver.steps.length > 0 && driver.steps.every(step => step.ok))
        checks.push(`${fixture.id}${cattle === undefined ? '' : ` cattle=${cattle}`}: state/interaction/log/scores`)
      }, cattle)
      additionalChecks(fixture, source, checks)
    }
    return { ok: true, checks }
  } catch (error) { return { ok: false, checks, reason: error instanceof Error ? error.message : String(error) } }
}
