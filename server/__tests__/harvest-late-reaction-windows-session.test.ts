import { afterEach, describe, expect, it } from 'vitest'
import type { GameSession, SessionResponse } from '../game/authoritative-session'
import type { GameState, InteractionState } from '../../shared/contract/types'
import type { CardImpl } from '../../shared/cards/registry'
import { markAllWorkersUsed } from '../../shared/domain/player'
import { scheduleNextHarvestSkip } from '../../shared/cards/helpers/harvest-skip'
import { createWorkSession } from './_helpers/session-fixtures'
import { orderReactionsManually } from './_helpers/trigger-select'
import { testCardImpl } from './_helpers/test-card-impl'
import { confirmNextPlayer, confirmPlayerSwitch } from './_helpers/pending-confirms'

// #2039 PR3: the after-reap, Harvest-exchange, feeding, end-of-Harvest and
// after-Harvest windows use the frozen-order reaction window. Each window has
// a pair of same-timing cards ordered both ways, with the auto-resolve setting
// off (manual) and on (the default).
const sessions: GameSession[] = []
afterEach(() => sessions.splice(0).forEach(session => session.dispose()))

const AFTER_REAP_FOOD = 'TEST_AfterReapFood'
const testCards: Record<string, CardImpl> = {
  [AFTER_REAP_FOOD]: testCardImpl(AFTER_REAP_FOOD, '{ effect: { id: CARD_ID, onAfterReap: () => gainLeaf(CARD_ID, { food: 1 }) } }'),
}

/** A fresh 2-player game at the end of round 4's work phase: everyone placed, 10 food, nothing else. */
const harvest = (configure: (state: GameState) => void, options: Parameters<typeof createWorkSession>[0] = {}) => {
  const session = createWorkSession({ seed: 2039, ...options, configure: state => {
    state.round = 4
    for (const player of state.players) {
      markAllWorkersUsed(state, player)
      player.fields = []
      Object.assign(player.resources, { food: 10, grain: 0, vegetable: 0, wood: 0, clay: 0, reed: 0, stone: 0, sheep: 0 })
    }
    configure(state)
  } })
  sessions.push(session)
  return session
}
const manual = (state: GameState) => orderReactionsManually(state)
const startPlayer = (state: GameState, seat: number) => state.players.forEach((player, index) => { player.startPlayer = index === seat })

type Wait = Extract<InteractionState, { stateId: 'wait' }>
const waiting = (response: SessionResponse): Wait => {
  expect(response.ok, response.error).toBe(true)
  if (response.interaction.stateId !== 'wait') throw new Error(`expected a waiting interaction, got ${response.interaction.stateId}`)
  return response.interaction
}
const values = (response: SessionResponse) => waiting(response).request.options?.map(option => option.value) ?? []
const passDisabled = (response: SessionResponse) =>
  waiting(response).request.options?.find(option => option.value === '__pass__')?.disabled === true
const choose = (session: GameSession, response: SessionResponse, value: string) => {
  const interaction = waiting(response)
  expect(values(response), JSON.stringify(interaction)).toContain(value)
  const next = session.resolveChoice(interaction.playerIndex, value)
  expect(next.ok, next.error).toBe(true)
  return next
}
/** Accepts a card's own prompt: its first enabled option that is not a skip. */
const accept = (session: GameSession, response: SessionResponse, card: string) => {
  expect(waiting(response), JSON.stringify(response.interaction)).toMatchObject({ sourceCard: card })
  const option = waiting(response).request.options?.find(entry => !entry.disabled && entry.value !== '__skip__')
  expect(option, JSON.stringify(response.interaction)).toBeDefined()
  return choose(session, response, option!.value)
}
const inWindow = (hook: string) => (response: SessionResponse) =>
  response.interaction.stateId === 'wait' && response.interaction.spaceId === `__stage:${hook}`
const atSelector = (hook: string) => (response: SessionResponse) =>
  inWindow(hook)(response) && waiting(response).request.kind === 'select-trigger'

/** Settles feeding, animals, confirmations and the post-reap anytime window until `stop` holds. */
const advanceUntil = (session: GameSession, response: SessionResponse, stop: (response: SessionResponse) => boolean) => {
  for (let step = 0; step < 40; step += 1) {
    if (stop(response)) return response
    const interaction = waiting(response)
    if (interaction.request.kind === 'feed') response = session.resolveChoice(interaction.playerIndex, 'confirm', { selections: [] })
    else if (interaction.request.kind === 'animal-reorg') response = session.resolveChoice(interaction.playerIndex, 'confirm', { zones: interaction.request.zones })
    else if (interaction.request.kind === 'confirm-next-player') response = confirmNextPlayer(session)
    else if (interaction.request.kind === 'confirm-player-switch') response = confirmPlayerSwitch(session)
    else if (session.peekEnginePendingEnvelope()?.syntheticKind === 'post-reap-anytime') response = session.resolveChoice(interaction.playerIndex, '__skip__')
    else throw new Error(`unexpected interaction: ${JSON.stringify(interaction)}`)
    expect(response.ok, response.error).toBe(true)
  }
  throw new Error('did not reach the expected step')
}
/**
 * Declines every remaining offer and finishes the Harvest of `round`; records each stage window
 * prompt as `hook:seat`. A Harvest whose sources all resolve without asking has already finished.
 */
const finishHarvest = (session: GameSession, response: SessionResponse, prompts: string[] = [], round = 4) => {
  for (let step = 0; step < 60 && response.state.round === round; step += 1) {
    const interaction = waiting(response)
    const { request } = interaction
    if (interaction.spaceId?.startsWith('__stage:')) prompts.push(`${interaction.spaceId.slice('__stage:'.length)}:${interaction.playerIndex}`)
    if (request.kind === 'select-trigger') response = session.resolveChoice(interaction.playerIndex, '__pass__')
    else if (request.kind === 'choice' && request.options?.some(option => option.value === '__skip__')) response = session.resolveChoice(interaction.playerIndex, '__skip__')
    else if (request.selection?.kind === 'farm-position') response = session.resolveChoice(interaction.playerIndex, '__skip__')
    else {
      response = advanceUntil(session, response, next => next !== response)
      continue
    }
    expect(response.ok, response.error).toBe(true)
  }
  expect(response.state.round).toBe(round + 1)
  return response
}

// Events are committed when a command ends; while a window still waits, tests read resources instead.
const triggered = (response: SessionResponse, cards: string[], round = 4) => response.state.events
  .filter(event => event.type === 'card.triggered' && cards.includes(event.sourceCardId ?? '') && event.round === round)
  .map(event => event.sourceCardId)
const paid = (response: SessionResponse, card: string) => response.state.events
  .filter(event => event.type === 'resource.paid' && event.sourceCardId === card)
  .map(event => event.type === 'resource.paid' ? event.resources : null)
const gained = (response: SessionResponse, card: string, round = 4) => response.state.events
  .filter(event => event.type === 'resource.moved' && event.sourceCardId === card && event.round === round)
  .map(event => event.type === 'resource.moved' ? { player: event.actorPlayerId, resources: event.resources } : null)
const bonusVp = (response: SessionResponse, card: string, seat = 0) =>
  response.state.players[seat]!.cardStates[card]?.counters?.bonusVp ?? 0

describe('after reap: Potato Ridger and Food Merchant share the after-reap window', () => {
  const RIDGER = 'A059_PotatoRidger'
  const MERCHANT = 'D113_FoodMerchant'
  const BARLEY_MILL = 'A064_BarleyMill'
  // After the reap: 3 vegetables (so Potato Ridger is optional), 1 grain from a field that keeps 2 (it costs 3 food).
  const fields = (configure?: (state: GameState) => void) => harvest(state => {
    const owner = state.players[0]!
    owner.minorPlayed = [RIDGER]
    owner.occupationPlayed = [MERCHANT]
    owner.fields = [
      { row: 0, col: 2, stacks: [{ kind: 'vegetable', remaining: 2 }] },
      { row: 0, col: 3, stacks: [{ kind: 'grain', remaining: 3 }] },
    ]
    Object.assign(owner.resources, { vegetable: 2, food: 3 })
    configure?.(state)
  })

  it.each([false, true])('Potato Ridger first: Food Merchant stays optional (manual=%s)', manualOrder => {
    const session = fields(state => { if (manualOrder) manual(state) })
    let response = advanceUntil(session, session.performRoundEnd(), atSelector('onAfterReap'))
    // Neither card is independent (both pay), so the setting changes nothing.
    expect(waiting(response).playerIndex).toBe(0)
    expect(values(response)).toEqual([RIDGER, MERCHANT, '__pass__'])
    expect(passDisabled(response)).toBe(false)
    response = choose(session, response, RIDGER)
    expect(response.state.players[0]!.resources).toMatchObject({ vegetable: 2, food: 9, grain: 1 })
    expect(values(response)).toEqual([MERCHANT, '__pass__'])
    response = choose(session, response, MERCHANT)
    expect(inWindow('onAfterReap')(response)).toBe(false)
    expect(triggered(response, [RIDGER, MERCHANT])).toEqual([RIDGER, MERCHANT])
    expect(paid(response, MERCHANT)).toEqual([{ food: 3 }])
    response = finishHarvest(session, response)
    // 9 - 3 food, then 4 eaten.
    expect(response.state.players[0]!.resources).toMatchObject({ vegetable: 3, food: 2, begging: 0 })
  })

  it('Food Merchant first: the fourth vegetable makes Potato Ridger mandatory, and it runs without asking', () => {
    const session = fields(manual)
    let response = advanceUntil(session, session.performRoundEnd(), atSelector('onAfterReap'))
    response = choose(session, response, MERCHANT)
    // 4 vegetables: Potato Ridger is now the sole mandatory source and resolves at once.
    expect(inWindow('onAfterReap')(response)).toBe(false)
    expect(triggered(response, [RIDGER, MERCHANT])).toEqual([MERCHANT, RIDGER])
    expect(paid(response, RIDGER)).toEqual([{ vegetable: 1 }])
    response = finishHarvest(session, response)
    expect(response.state.players[0]!.resources).toMatchObject({ vegetable: 3, food: 2, begging: 0 })
  })

  it('an independent Barley Mill resolves first with the setting on and is ordered with the setting off', () => {
    const add = (state: GameState) => { state.players[0]!.minorPlayed.push(BARLEY_MILL) }
    const on = fields(add)
    let response = advanceUntil(on, on.performRoundEnd(), atSelector('onAfterReap'))
    // One harvested grain field: 1 food, already added while the selector waits.
    expect(response.state.players[0]!.resources.food).toBe(4)
    expect(values(response)).toEqual([RIDGER, MERCHANT, '__pass__'])

    const off = fields(state => { manual(state); add(state) })
    response = advanceUntil(off, off.performRoundEnd(), atSelector('onAfterReap'))
    expect(response.state.players[0]!.resources.food).toBe(3)
    expect(values(response)).toEqual([RIDGER, BARLEY_MILL, MERCHANT, '__pass__'])
    expect(passDisabled(response)).toBe(true)
  })

  it('does not offer Potato Ridger below 3 vegetables', () => {
    const session = fields(state => { state.players[0]!.resources.vegetable = 1 })
    const response = advanceUntil(session, session.performRoundEnd(), atSelector('onAfterReap'))
    expect(values(response)).toEqual([MERCHANT, '__pass__'])
  })
})

describe('Harvest exchanges: Joinery and Pottery share one window', () => {
  const crafts = (configure?: (state: GameState) => void) => harvest(state => {
    const owner = state.players[0]!
    owner.improvements = ['Major_Joinery', 'Major_Pottery']
    Object.assign(owner.resources, { wood: 1, clay: 1 })
    configure?.(state)
  })
  const exchanged = (response: SessionResponse) => response.state.events
    .filter(event => event.type === 'resource.exchanged' && event.round === 4)
    .map(event => event.type === 'resource.exchanged' ? event.exchangeSource : null)

  it.each([
    [false, 'Major_Joinery', 'Major_Pottery'],
    [false, 'Major_Pottery', 'Major_Joinery'],
    [true, 'Major_Joinery', 'Major_Pottery'],
    [true, 'Major_Pottery', 'Major_Joinery'],
  ])('manual=%s: %s then %s; the order changes only the log', (manualOrder, first, second) => {
    const session = crafts(state => { if (manualOrder) manual(state) })
    let response = advanceUntil(session, session.performRoundEnd(), atSelector('onHarvest'))
    expect(values(response)).toEqual(['Major_Joinery', 'Major_Pottery', '__pass__'])
    expect(passDisabled(response)).toBe(false)
    response = choose(session, response, first)
    expect(values(response)).toEqual([second, '__pass__'])
    response = choose(session, response, second)
    expect(exchanged(response)).toEqual([first, second])
    response = finishHarvest(session, response)
    // 2 + 2 food from the conversions, then 4 eaten.
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 0, clay: 0, food: 10 })
  })

  it('one Pass declines both conversions', () => {
    const session = crafts()
    let response = advanceUntil(session, session.performRoundEnd(), atSelector('onHarvest'))
    response = choose(session, response, '__pass__')
    expect(inWindow('onHarvest')(response)).toBe(false)
    expect(exchanged(response)).toEqual([])
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 1, clay: 1 })
  })

  it('a sole affordable building shows its own conversion prompt', () => {
    const session = harvest(state => {
      state.players[0]!.improvements = ['Major_Pottery']
      state.players[0]!.resources.clay = 1
    })
    const response = advanceUntil(session, session.performRoundEnd(), inWindow('onHarvest'))
    expect(waiting(response)).toMatchObject({ sourceCard: 'Major_Pottery', request: { kind: 'choice' } })
    expect(values(response)).toContain('__skip__')
  })
})

describe('start of feeding: Open Gate and Cubbyhole share one window', () => {
  const OPEN_GATE = 'CWM097_OpenGate'
  const CUBBYHOLE = 'E052_Cubbyhole'
  const gate = (configure?: (state: GameState) => void) => harvest(state => {
    const owner = state.players[0]!
    owner.minorPlayed = [OPEN_GATE, CUBBYHOLE]
    owner.cardStates[CUBBYHOLE] = { counters: { food: 2 } }
    owner.resources.sheep = 1
    owner.houseAnimals = { '1-0': 'sheep' }
    configure?.(state)
  })

  it('auto-resolve on: Cubbyhole settles first, then Open Gate keeps [card, Pass]', () => {
    const session = gate()
    const response = advanceUntil(session, session.performRoundEnd(), atSelector('onStartHarvestFeedingPhase'))
    expect(response.state.players[0]!.resources.food).toBe(12)
    expect(values(response)).toEqual([OPEN_GATE, '__pass__'])
  })

  it.each([
    [CUBBYHOLE, OPEN_GATE],
    [OPEN_GATE, CUBBYHOLE],
  ])('auto-resolve off: %s first', (first, second) => {
    const session = gate(manual)
    let response = advanceUntil(session, session.performRoundEnd(), atSelector('onStartHarvestFeedingPhase'))
    expect(values(response)).toEqual([OPEN_GATE, CUBBYHOLE, '__pass__'])
    expect(passDisabled(response)).toBe(true)
    response = choose(session, response, first)
    // Cubbyhole is the last mandatory source and runs without asking; Open Gate keeps its choice.
    if (first === CUBBYHOLE) response = choose(session, response, OPEN_GATE)
    expect(inWindow('onStartHarvestFeedingPhase')(response)).toBe(false)
    expect(triggered(response, [first, second])).toEqual([first, second])
    expect(paid(response, OPEN_GATE)).toEqual([{ sheep: 1 }])
    expect(bonusVp(response, OPEN_GATE)).toBe(1)
    expect(gained(response, CUBBYHOLE)).toEqual([{ player: 'p1', resources: { food: 2 } }])
  })
})

describe('feeding: Studio and Beer Tent Operator compete for the only wood', () => {
  const STUDIO = 'C055_Studio'
  const BEER_TENT = 'D133_BeerTentOperator'
  const BEE_KEEPER = 'CWM005_BeeKeeper'
  const BRAZIER = 'CWM066_Brazier'
  const tent = (configure?: (state: GameState) => void) => harvest(state => {
    const owner = state.players[0]!
    owner.minorPlayed = [STUDIO]
    owner.occupationPlayed = [BEER_TENT]
    Object.assign(owner.resources, { wood: 1, grain: 1 })
    configure?.(state)
  })

  it.each([false, true])('Studio first takes the wood; Beer Tent Operator is no longer offered (manual=%s)', manualOrder => {
    const session = tent(state => { if (manualOrder) manual(state) })
    let response = advanceUntil(session, session.performRoundEnd(), atSelector('onHarvestFeedingPhase'))
    expect(values(response)).toEqual([STUDIO, BEER_TENT, '__pass__'])
    expect(passDisabled(response)).toBe(false)
    response = choose(session, response, STUDIO)
    if (inWindow('onHarvestFeedingPhase')(response)) response = accept(session, response, STUDIO)
    expect(inWindow('onHarvestFeedingPhase')(response)).toBe(false)
    expect(paid(response, STUDIO)).toEqual([{ wood: 1 }])
    expect(paid(response, BEER_TENT)).toEqual([])
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 0, grain: 1 })
  })

  it('Beer Tent Operator first takes the wood and grain; Studio is no longer offered', () => {
    const session = tent(manual)
    let response = advanceUntil(session, session.performRoundEnd(), atSelector('onHarvestFeedingPhase'))
    response = choose(session, response, BEER_TENT)
    expect(inWindow('onHarvestFeedingPhase')(response)).toBe(false)
    expect(paid(response, BEER_TENT)).toEqual([{ wood: 1, grain: 1 }])
    expect(paid(response, STUDIO)).toEqual([])
    expect(bonusVp(response, BEER_TENT)).toBe(1)
  })

  it('Bee Keeper now pays out in this window: first with the setting on, ordered with it off', () => {
    const add = (state: GameState) => { state.players[0]!.occupationPlayed.push(BEE_KEEPER) }
    const on = tent(add)
    let response = advanceUntil(on, on.performRoundEnd(), atSelector('onHarvestFeedingPhase'))
    expect(response.state.players[0]!.resources.food).toBe(11)
    expect(values(response)).toEqual([STUDIO, BEER_TENT, '__pass__'])

    const off = tent(state => { manual(state); add(state) })
    response = advanceUntil(off, off.performRoundEnd(), atSelector('onHarvestFeedingPhase'))
    expect(values(response)).toEqual([STUDIO, BEER_TENT, BEE_KEEPER, '__pass__'])
    expect(passDisabled(response)).toBe(true)
    expect(response.state.players[0]!.resources.food).toBe(10)
    response = choose(off, response, BEE_KEEPER)
    expect(response.state.players[0]!.resources.food).toBe(11)
    expect(values(response)).toEqual([STUDIO, BEER_TENT, '__pass__'])
  })

  it('Bee Keeper is not part of the start-of-feeding window and pays out once per Harvest', () => {
    const OPEN_GATE = 'CWM097_OpenGate'
    const session = harvest(state => {
      const owner = state.players[0]!
      orderReactionsManually(state)
      owner.minorPlayed = [OPEN_GATE]
      owner.occupationPlayed = [BEE_KEEPER]
      owner.resources.sheep = 1
      owner.houseAnimals = { '1-0': 'sheep' }
    })
    let response = advanceUntil(session, session.performRoundEnd(), inWindow('onStartHarvestFeedingPhase'))
    // Open Gate is the start-of-feeding window's only source: its own prompt, and no food from Bee Keeper yet.
    expect(waiting(response)).toMatchObject({ sourceCard: OPEN_GATE, request: { kind: 'choice' } })
    expect(response.state.players[0]!.resources.food).toBe(10)
    response = choose(session, response, '__skip__')
    response = finishHarvest(session, response)
    expect(gained(response, BEE_KEEPER)).toEqual([{ player: 'p1', resources: { food: 1 } }])
    expect(response.state.players[0]!.resources).toMatchObject({ food: 10 + 1 - 4, sheep: 1 })
  })

  it('Brazier is ordered with Studio in the feeding window', () => {
    const session = harvest(state => {
      const owner = state.players[0]!
      orderReactionsManually(state)
      owner.minorPlayed = [BRAZIER, STUDIO]
      Object.assign(owner.resources, { vegetable: 1, wood: 1 })
    })
    let response = advanceUntil(session, session.performRoundEnd(), atSelector('onHarvestFeedingPhase'))
    expect(values(response)).toEqual([BRAZIER, STUDIO, '__pass__'])
    response = choose(session, response, BRAZIER)
    if (waiting(response).sourceCard === BRAZIER) response = accept(session, response, BRAZIER)
    // 1 vegetable for 3 food; Studio keeps its own [card, Pass].
    expect(response.state.players[0]!.resources).toMatchObject({ vegetable: 0, food: 13 })
    expect(values(response)).toEqual([STUDIO, '__pass__'])
  })
})

describe('end of feeding: Social Benefits and Almshouse share one window', () => {
  const SOCIAL = 'D076_SocialBenefits'
  const ALMSHOUSE = 'CWM056_Almshouse'
  const FARM_STORE = 'C041_FarmStore'
  // 2 food against a need of 4: the owner ends feeding with 0 food and 2 begging cards.
  const short = (configure?: (state: GameState) => void) => harvest(state => {
    const owner = state.players[0]!
    owner.minorPlayed = [ALMSHOUSE, SOCIAL]
    owner.resources.food = 2
    configure?.(state)
  })

  it('auto-resolve on: Social Benefits settles first, then Almshouse keeps [card, Pass]', () => {
    const session = short()
    const response = advanceUntil(session, session.performRoundEnd(), atSelector('onEndHarvestFeedingPhase'))
    expect(response.state.players[0]!.resources).toMatchObject({ food: 0, begging: 2, wood: 1, clay: 1 })
    expect(values(response)).toEqual([ALMSHOUSE, '__pass__'])
  })

  it.each([
    [SOCIAL, ALMSHOUSE],
    [ALMSHOUSE, SOCIAL],
  ])('auto-resolve off: %s first', (first, second) => {
    const session = short(manual)
    let response = advanceUntil(session, session.performRoundEnd(), atSelector('onEndHarvestFeedingPhase'))
    expect(values(response)).toEqual([ALMSHOUSE, SOCIAL, '__pass__'])
    expect(passDisabled(response)).toBe(true)
    response = choose(session, response, first)
    if (first === SOCIAL) {
      expect(values(response)).toEqual([ALMSHOUSE, '__pass__'])
      response = choose(session, response, ALMSHOUSE)
    }
    expect(inWindow('onEndHarvestFeedingPhase')(response)).toBe(false)
    expect(triggered(response, [first, second])).toEqual([first, second])
    expect(response.state.players[0]!.resources).toMatchObject({ food: 0, wood: 1, clay: 1, begging: 1 })
  })

  it('a source applicable only after a sibling: spending the last food on Farm Store brings in Social Benefits', () => {
    // 5 food against 4: one food is left, so Social Benefits does not apply on entry.
    const store = (manualOrder: boolean) => harvest(state => {
      const owner = state.players[0]!
      if (manualOrder) manual(state)
      owner.minorPlayed = [FARM_STORE, SOCIAL]
      owner.resources.food = 5
    })
    for (const manualOrder of [false, true]) {
      const session = store(manualOrder)
      let response = advanceUntil(session, session.performRoundEnd(), atSelector('onEndHarvestFeedingPhase'))
      expect(values(response)).toEqual([FARM_STORE, '__pass__'])
      response = choose(session, response, FARM_STORE)
      if (inWindow('onEndHarvestFeedingPhase')(response)) response = accept(session, response, FARM_STORE)
      expect(paid(response, FARM_STORE)).toEqual([{ food: 1 }])
      expect(gained(response, SOCIAL)).toEqual([{ player: 'p1', resources: { wood: 1, clay: 1 } }])
      expect(inWindow('onEndHarvestFeedingPhase')(response)).toBe(false)
    }
    const declined = store(false)
    let response = advanceUntil(declined, declined.performRoundEnd(), atSelector('onEndHarvestFeedingPhase'))
    response = choose(declined, response, '__pass__')
    expect(gained(response, SOCIAL)).toEqual([])
    expect(response.state.players[0]!.resources.food).toBe(1)
  })
})

describe('end of the Harvest: Winter Caretaker and Birdcage compete for the food', () => {
  const CARETAKER = 'C113_WinterCaretaker'
  const BIRDCAGE = 'CWM063_Birdcage'
  const ROPEMAKER = 'A145_Ropemaker'
  // 6 food, 4 eaten: 2 food left at the end of the Harvest.
  const cage = (configure?: (state: GameState) => void) => harvest(state => {
    const owner = state.players[0]!
    owner.minorPlayed = [BIRDCAGE]
    owner.occupationPlayed = [CARETAKER]
    owner.resources.food = 6
    configure?.(state)
  })

  it.each([false, true])('Winter Caretaker first spends both food; Birdcage is not asked (manual=%s)', manualOrder => {
    const session = cage(state => { if (manualOrder) manual(state) })
    let response = advanceUntil(session, session.performRoundEnd(), atSelector('onEndHarvest'))
    expect(values(response)).toEqual([BIRDCAGE, CARETAKER, '__pass__'])
    expect(passDisabled(response)).toBe(false)
    response = choose(session, response, CARETAKER)
    expect(response.state.round).toBe(5)
    expect(response.state.players[0]!.resources).toMatchObject({ food: 0, vegetable: 1 })
    expect(paid(response, BIRDCAGE)).toEqual([])
  })

  it('Birdcage first leaves 1 food; Winter Caretaker is not offered', () => {
    const session = cage(manual)
    let response = advanceUntil(session, session.performRoundEnd(), atSelector('onEndHarvest'))
    response = choose(session, response, BIRDCAGE)
    expect(response.state.round).toBe(5)
    expect(response.state.players[0]!.resources).toMatchObject({ food: 1, vegetable: 0 })
    expect(bonusVp(response, BIRDCAGE)).toBe(1)
    expect(paid(response, CARETAKER)).toEqual([])
  })

  it('an independent Ropemaker resolves first with the setting on and is ordered with it off', () => {
    const add = (state: GameState) => { state.players[0]!.occupationPlayed.push(ROPEMAKER) }
    const on = cage(add)
    let response = advanceUntil(on, on.performRoundEnd(), atSelector('onEndHarvest'))
    expect(response.state.players[0]!.resources.reed).toBe(1)
    expect(values(response)).toEqual([BIRDCAGE, CARETAKER, '__pass__'])

    const off = cage(state => { manual(state); add(state) })
    response = advanceUntil(off, off.performRoundEnd(), atSelector('onEndHarvest'))
    expect(response.state.players[0]!.resources.reed).toBe(0)
    expect(values(response)).toEqual([BIRDCAGE, CARETAKER, ROPEMAKER, '__pass__'])
    expect(passDisabled(response)).toBe(true)
  })
})

describe('after the Harvest: storing grain on Omnifarmer changes Eternal Rye Cultivation', () => {
  const RYE = 'C066_EternalRyeCultivation'
  const OMNIFARMER = 'E134_Omnifarmer'
  // 2 grain plus 1 reaped from a 3-grain field: 3 grain after the Harvest.
  const rye = (configure?: (state: GameState) => void) => harvest(state => {
    const owner = state.players[0]!
    owner.minorPlayed = [RYE]
    owner.occupationPlayed = [OMNIFARMER]
    owner.resources.grain = 2
    owner.fields = [{ row: 0, col: 2, stacks: [{ kind: 'grain', remaining: 3 }] }]
    configure?.(state)
  })
  const deposit = (session: GameSession, response: SessionResponse) => {
    if (response.interaction.stateId === 'wait' && response.interaction.sourceCard === OMNIFARMER
      && response.interaction.request.kind !== 'select-trigger') {
      return accept(session, response, OMNIFARMER)
    }
    return response
  }

  it('auto-resolve on: Eternal Rye Cultivation gives the third-tier grain first, then Omnifarmer keeps [card, Pass]', () => {
    const session = rye()
    let response = advanceUntil(session, session.performRoundEnd(), atSelector('onAfterHarvest'))
    expect(response.state.players[0]!.resources.grain).toBe(4)
    expect(values(response)).toEqual([OMNIFARMER, '__pass__'])
    response = deposit(session, choose(session, response, OMNIFARMER))
    expect(response.state.round).toBe(5)
    expect(response.state.players[0]!.resources).toMatchObject({ grain: 3, food: 6 })
    expect(response.state.players[0]!.cardStates[OMNIFARMER]?.extraData?.storedGoods).toEqual(['grain'])
  })

  it.each([
    [RYE, { grain: 3, food: 6 }],
    [OMNIFARMER, { grain: 2, food: 7 }],
  ])('auto-resolve off: %s first', (first, resources) => {
    const session = rye(manual)
    let response = advanceUntil(session, session.performRoundEnd(), atSelector('onAfterHarvest'))
    expect(values(response)).toEqual([RYE, OMNIFARMER, '__pass__'])
    expect(passDisabled(response)).toBe(true)
    response = deposit(session, choose(session, response, first))
    if (first === RYE) {
      expect(values(response)).toEqual([OMNIFARMER, '__pass__'])
      response = deposit(session, choose(session, response, OMNIFARMER))
    }
    // Omnifarmer first leaves 2 grain, so Eternal Rye Cultivation, the last mandatory source, gives food instead.
    expect(response.state.round).toBe(5)
    expect(response.state.players[0]!.resources).toMatchObject(resources)
    expect(triggered(response, [RYE, OMNIFARMER])).toEqual(first === RYE ? [RYE, OMNIFARMER] : [OMNIFARMER, RYE])
  })

  it('undoStep restores the same selector after the first choice', () => {
    const session = rye(manual)
    const offered = advanceUntil(session, session.performRoundEnd(), atSelector('onAfterHarvest'))
    const selector = structuredClone(offered.interaction)
    choose(session, offered, RYE)
    const undone = session.undoStep()
    expect(undone.ok, undone.error).toBe(true)
    expect(undone.interaction).toEqual(selector)
    expect(undone.state.players[0]!.resources.grain).toBe(3)
  })
})

describe('player order and excluded players', () => {
  // One optional source per window for both seats; every window must ask the Start Player first.
  const allWindows = (state: GameState) => {
    for (const player of state.players) {
      player.improvements = ['Major_Joinery']
      player.minorPlayed = ['CWM097_OpenGate', 'C041_FarmStore', 'C034_ElephantgrassPlant']
      player.occupationPlayed = ['D113_FoodMerchant', 'D133_BeerTentOperator', 'C113_WinterCaretaker']
      player.fields = [{ row: 0, col: 3, stacks: [{ kind: 'grain', remaining: 3 }] }]
      Object.assign(player.resources, { food: 12, wood: 2, grain: 1, reed: 1, sheep: 1 })
      player.houseAnimals = { '1-0': 'sheep' }
    }
  }

  it.each([0, 1])('every late Harvest window asks the Start Player first (start player = P%i)', first => {
    const session = harvest(state => { allWindows(state); startPlayer(state, first) })
    const prompts: string[] = []
    finishHarvest(session, session.performRoundEnd(), prompts)
    const hooks = ['onAfterReap', 'onHarvest', 'onStartHarvestFeedingPhase', 'onHarvestFeedingPhase',
      'onEndHarvestFeedingPhase', 'onEndHarvest', 'onAfterHarvest']
    expect(prompts.filter(prompt => hooks.includes(prompt.split(':')[0]!)))
      .toEqual(hooks.flatMap(hook => [`${hook}:${first}`, `${hook}:${1 - first}`]))
  })

  it('a player skipping the whole Harvest takes part in none of these windows', () => {
    const session = harvest(state => {
      scheduleNextHarvestSkip(state.players[0]!, 'C108_Layabout')
      for (const player of state.players) {
        player.minorPlayed = ['D012_MilkingPlace']
        player.occupationPlayed = ['C113_WinterCaretaker']
      }
    })
    const prompts: string[] = []
    const response = finishHarvest(session, session.performRoundEnd(), prompts)
    expect(gained(response, 'D012_MilkingPlace')).toEqual([{ player: 'p2', resources: { food: 1 } }])
    expect(prompts.filter(prompt => prompt.endsWith(':0'))).toEqual([])
    expect(prompts).toContain('onEndHarvest:1')
  })

  it('a player skipping the field and breeding phases misses the after-reap window but still feeds', () => {
    const session = harvest(state => {
      state.players[0]!.minorPlayed = ['E058_LunchtimeBeer', AFTER_REAP_FOOD, 'D012_MilkingPlace']
      state.players[1]!.minorPlayed = [AFTER_REAP_FOOD]
    }, { cardImpls: testCards })
    let response = session.performRoundEnd()
    // Lunchtime Beer is the owner's only start-of-Harvest source: its own optional plan is the prompt.
    response = accept(session, response, 'E058_LunchtimeBeer')
    response = finishHarvest(session, response)
    expect(gained(response, AFTER_REAP_FOOD)).toEqual([{ player: 'p2', resources: { food: 1 } }])
    expect(gained(response, 'D012_MilkingPlace')).toEqual([{ player: 'p1', resources: { food: 1 } }])
  })
})

describe('per-Harvest bookkeeping lives in round-keyed card state', () => {
  /** Moves the finished game to the end of round 7's work phase, the next Harvest. */
  const toRoundSeven = (session: GameSession, configure: (state: GameState) => void) => {
    const state = session.state
    state.round = 7
    for (const player of state.players) markAllWorkersUsed(state, player)
    configure(state)
    session.loadState(state)
    return session.performRoundEnd()
  }

  it('Plow Builder plows once in each Harvest in which the Joinery was used', () => {
    const PLOW = 'E91-plow-builder-anytime'
    const session = harvest(state => {
      const owner = state.players[0]!
      owner.improvements = ['Major_Joinery']
      owner.occupationPlayed = ['E091_PlowBuilder']
      owner.resources.wood = 1
    })
    let response = advanceUntil(session, session.performRoundEnd(), inWindow('onHarvest'))
    expect(response.interaction.anytimeActions.map(action => action.id)).not.toContain(PLOW)
    response = accept(session, response, 'Major_Joinery')
    expect(response.interaction.anytimeActions.map(action => action.id)).toContain(PLOW)
    response = session.takeAnytimeAction(0, PLOW)
    expect(response.ok, response.error).toBe(true)
    response = session.commitSelectionChoice(0, { tile: waiting(response).request.farm!.selectableTiles[0]! })
    expect(response.ok, response.error).toBe(true)
    expect(response.interaction.anytimeActions.map(action => action.id)).not.toContain(PLOW)
    response = finishHarvest(session, response)
    expect(response.state.players[0]!.fields).toHaveLength(1)

    // The next Harvest starts unarmed until the Joinery is used again.
    response = advanceUntil(session, toRoundSeven(session, state => { state.players[0]!.resources.wood = 1 }), inWindow('onHarvest'))
    expect(response.interaction.anytimeActions.map(action => action.id)).not.toContain(PLOW)
    response = accept(session, response, 'Major_Joinery')
    expect(response.interaction.anytimeActions.map(action => action.id)).toContain(PLOW)
  })

  it('Scythe Worker adds grain only in the Harvest of its selection; the end of the Harvest asks nothing for it', () => {
    const session = harvest(state => {
      const owner = state.players[0]!
      orderReactionsManually(state)
      owner.occupationPlayed = ['A112_ScytheWorker', 'C113_WinterCaretaker']
      owner.fields = [{ row: 0, col: 2, stacks: [{ kind: 'grain', remaining: 3 }] }]
    })
    accept(session, advanceUntil(session, session.performRoundEnd(), inWindow('onStartHarvestFieldPhase')), 'A112_ScytheWorker')
    let response = session.commitSelectionChoice(0, { positions: [{ row: 0, col: 2 }] })
    expect(response.ok, response.error).toBe(true)
    response = advanceUntil(session, response, inWindow('onEndHarvest'))
    expect(response.state.players[0]!.resources.grain).toBe(2)
    // Winter Caretaker is the window's only source: its own prompt, with no bookkeeping beside it.
    expect(waiting(response)).toMatchObject({ sourceCard: 'C113_WinterCaretaker', request: { kind: 'choice' } })
    finishHarvest(session, response)

    response = toRoundSeven(session, state => {
      state.players[0]!.fields = [{ row: 0, col: 2, stacks: [{ kind: 'grain', remaining: 3 }] }]
      state.players[0]!.resources.grain = 0
    })
    response = advanceUntil(session, response, inWindow('onStartHarvestFieldPhase'))
    response = choose(session, response, '__skip__')
    response = advanceUntil(session, response, inWindow('onEndHarvest'))
    expect(response.state.players[0]!.resources.grain).toBe(1)
  })

  it('Hayloft Barn releases its food through leaves: the selector preview changes nothing', () => {
    const BARN = 'B021_HayloftBarn'
    const MERCHANT = 'D113_FoodMerchant'
    const barn = (manualOrder: boolean) => harvest(state => {
      const owner = state.players[0]!
      if (manualOrder) manual(state)
      owner.minorPlayed = [BARN]
      owner.occupationPlayed = [MERCHANT]
      owner.cardStates[BARN] = { extraData: { foodCount: 2 } }
      owner.fields = [{ row: 0, col: 2, stacks: [{ kind: 'grain', remaining: 3 }] }]
    })
    const off = barn(true)
    let response = advanceUntil(off, off.performRoundEnd(), atSelector('onAfterReap'))
    expect(values(response)).toEqual([BARN, MERCHANT, '__pass__'])
    expect(passDisabled(response)).toBe(true)
    expect(response.state.players[0]!.cardStates[BARN]?.extraData?.foodCount).toBe(2)
    response = choose(off, response, BARN)
    expect(response.state.players[0]!.cardStates[BARN]).toMatchObject({ extraData: { foodCount: 1 }, infobox: '1 Food' })
    expect(response.state.players[0]!.resources.food).toBe(11)
    expect(values(response)).toEqual([MERCHANT, '__pass__'])

    const on = barn(false)
    response = advanceUntil(on, on.performRoundEnd(), atSelector('onAfterReap'))
    expect(response.state.players[0]!.cardStates[BARN]?.extraData?.foodCount).toBe(1)
    expect(response.state.players[0]!.resources.food).toBe(11)
    expect(values(response)).toEqual([MERCHANT, '__pass__'])
  })
})
