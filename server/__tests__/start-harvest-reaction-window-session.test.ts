import { afterEach, describe, expect, it } from 'vitest'
import type { GameSession, SessionResponse } from '../game/authoritative-session'
import type { GameState } from '../../shared/contract/types'
import { markAllWorkersUsed } from '../../shared/domain/player'
import { scheduleNextHarvestSkip } from '../../shared/cards/helpers/harvest-skip'
import { createWorkSession } from './_helpers/session-fixtures'
import { orderReactionsManually } from './_helpers/trigger-select'
import { assertRejectedUnchanged } from './_helpers/session-assertions'

// #2039 PR1: the start-of-Harvest window is a frozen-order reaction window.
const TRAPPIST = 'CFL027_TrappistBeer'
const CHICKEN = 'CFL061_BlacklegChicken'
const RAISED_BED = 'E061_RaisedBed'
const sessions: GameSession[] = []
afterEach(() => sessions.splice(0).forEach(session => session.dispose()))

const harvest = (configure: (state: GameState) => void, options?: Parameters<typeof createWorkSession>[0]['options']) => {
  const session = createWorkSession({ seed: 2039, options, configure: state => {
    state.round = 4
    for (const player of state.players) {
      markAllWorkersUsed(state, player)
      Object.assign(player.resources, { food: 10, grain: 0, wood: 0, clay: 0 })
    }
    configure(state)
  } })
  sessions.push(session)
  return session
}

const waiting = (response: SessionResponse) => {
  expect(response.ok, response.error).toBe(true)
  expect(response.interaction.stateId).toBe('wait')
  if (response.interaction.stateId !== 'wait') throw new Error('expected a waiting interaction')
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
/** Skips anytime windows and feeds without conversions until the next round starts. */
const finishHarvest = (session: GameSession, response: SessionResponse) => {
  for (let step = 0; step < 12 && response.state.round === 4; step += 1) {
    const interaction = waiting(response)
    const value = interaction.request.kind === 'feed' ? 'confirm' : '__skip__'
    response = session.resolveChoice(interaction.playerIndex, value, value === 'confirm' ? { selections: [] } : undefined)
    expect(response.ok, response.error).toBe(true)
  }
  expect(response.state.round).toBe(5)
  return response
}
const chickenFood = (response: SessionResponse, seat = 0) =>
  response.state.players[seat]!.cardStates[CHICKEN]?.counters?.food ?? 0
const triggerOrder = (response: SessionResponse, cards: string[]) => response.state.events
  .filter(event => event.type === 'card.triggered' && cards.includes(event.sourceCardId ?? '') && event.round === 4)
  .map(event => event.sourceCardId)

const trappistAndChicken = (configure?: (state: GameState) => void) => harvest(state => {
  const [owner, other] = state.players
  owner!.minorPlayed = [TRAPPIST, CHICKEN]
  owner!.cardStates[CHICKEN] = { counters: { food: 2 } }
  owner!.resources.grain = 1
  other!.minorPlayed = [RAISED_BED]
  configure?.(state)
})

/** The owner skipped the whole Harvest; the other seat harvested and fed normally. */
const expectOwnerSkippedHarvest = (response: SessionResponse) => {
  expect(response.state.round).toBe(5)
  expect(response.state.players[0]!.resources).toMatchObject({ food: 10, grain: 0, begging: 0 })
  expect(chickenFood(response)).toBe(3)
  expect(response.state.events.some(event => event.type === 'harvest.feedPaid' && event.playerId === 'p1')).toBe(false)
  expect(response.state.players[1]!.resources.food).toBe(10 + 4 - 4)
}

describe('#2033 Trappist Beer and Blackleg Chicken share the start-of-Harvest window', () => {
  it('auto-resolve on (default): the Chicken settles first, then Trappist Beer waits for its owner', () => {
    const session = trappistAndChicken()
    let response = session.performRoundEnd()
    expect(response.state.roundPhase).toBe('harvest')
    expect(chickenFood(response)).toBe(3)
    expect(waiting(response).playerIndex).toBe(0)
    expect(values(response)).toEqual([TRAPPIST, '__pass__'])
    expect(passDisabled(response)).toBe(false)
    // Selecting the card uses it: it pays the grain and schedules the skip.
    response = choose(session, response, TRAPPIST)
    expectOwnerSkippedHarvest(response)
    expect(triggerOrder(response, [TRAPPIST, CHICKEN])).toEqual([CHICKEN, TRAPPIST])
  })

  it.each([
    [CHICKEN, TRAPPIST],
    [TRAPPIST, CHICKEN],
  ])('auto-resolve off: %s first, and both still take effect', (first, second) => {
    const session = trappistAndChicken(orderReactionsManually)
    let response = session.performRoundEnd()
    expect(chickenFood(response)).toBe(2)
    expect(values(response)).toEqual([TRAPPIST, CHICKEN, '__pass__'])
    expect(passDisabled(response)).toBe(true)
    assertRejectedUnchanged(session, () => session.resolveChoice(0, '__pass__'))
    response = choose(session, response, first)
    if (first === CHICKEN) {
      expect(chickenFood(response)).toBe(3)
      // Trappist Beer, the remaining optional source, keeps its own [card, Pass] choice.
      expect(values(response)).toEqual([TRAPPIST, '__pass__'])
      response = choose(session, response, TRAPPIST)
    }
    // After Trappist Beer the skip is only scheduled, so the Chicken, the last
    // mandatory source, still adds its food before the skip takes effect.
    expectOwnerSkippedHarvest(response)
    expect(triggerOrder(response, [first, second])).toEqual([first, second])
  })

  it('undoStep restores the same selector after the first choice', () => {
    const session = trappistAndChicken(orderReactionsManually)
    const offered = session.performRoundEnd()
    const selector = structuredClone(offered.interaction)
    choose(session, offered, CHICKEN)
    const undone = session.undoStep()
    expect(undone.ok, undone.error).toBe(true)
    expect(undone.interaction).toEqual(selector)
    expect(chickenFood(undone)).toBe(2)
  })

  it('a declined Trappist Beer leaves the Harvest whole; the Chicken still adds its food', () => {
    const session = trappistAndChicken()
    let response = session.performRoundEnd()
    response = choose(session, response, '__pass__')
    expect(chickenFood(response)).toBe(3)
    expect(response.state.players[0]!.resources.grain).toBe(1)
    // The owner takes part in the whole Harvest and feeds the family.
    response = finishHarvest(session, response)
    expect(response.state.players[0]!.resources).toMatchObject({ food: 10 - 4, grain: 1, begging: 0 })
  })

  it('with the Chicken dormant, Trappist Beer is the only option beside Pass in either setting', () => {
    for (const manual of [false, true]) {
      const session = trappistAndChicken(state => {
        state.players[0]!.cardStates[CHICKEN] = { counters: { food: 1 } }
        if (manual) orderReactionsManually(state)
      })
      const response = session.performRoundEnd()
      expect(values(response)).toEqual([TRAPPIST, '__pass__'])
      expect(passDisabled(response)).toBe(false)
      expect(chickenFood(response)).toBe(1)
    }
  })

  it('Trappist Beer as the only source opens its own pay-or-skip choice', () => {
    const session = harvest(state => {
      state.players[0]!.minorPlayed = [TRAPPIST]
      state.players[0]!.resources.grain = 1
    })
    const response = session.performRoundEnd()
    expect(waiting(response)).toMatchObject({ playerIndex: 0, request: { kind: 'choice' } })
    expect(values(response)).toContain('__skip__')
    expect(response.state.players[0]!.resources.grain).toBe(1)
  })

  it('without grain Trappist Beer cannot be paid, so the Chicken resolves alone', () => {
    const session = trappistAndChicken(state => { state.players[0]!.resources.grain = 0 })
    let response = session.performRoundEnd()
    expect(chickenFood(response)).toBe(3)
    expect(response.state.events.some(event => event.type === 'card.triggered' && event.sourceCardId === TRAPPIST)).toBe(false)
    response = finishHarvest(session, response)
    expect(response.state.players[0]!.resources.food).toBe(10 - 4)
  })
})

describe('start-of-Harvest window', () => {
  it('leaves out the Layabout owner, who skips the whole Harvest from before it starts', () => {
    const session = harvest(state => {
      const owner = state.players[0]!
      owner.occupationPlayed = ['C108_Layabout']
      owner.minorPlayed = [CHICKEN, RAISED_BED]
      owner.cardStates[CHICKEN] = { counters: { food: 2 } }
      scheduleNextHarvestSkip(owner, 'C108_Layabout')
    })
    const response = session.performRoundEnd()
    expect(response.state.round).toBe(5)
    expect(chickenFood(response)).toBe(2)
    expect(response.state.players[0]!.resources.food).toBe(10)
    expect(response.state.events.some(event => event.type === 'card.triggered'
      && [CHICKEN, RAISED_BED].includes(event.sourceCardId ?? ''))).toBe(false)
  })

  it('asks the start player first', () => {
    const session = harvest(state => {
      state.players.forEach((player, index) => {
        player.startPlayer = index === 1
        player.occupationPlayed = ['E110_Dentist']
        player.resources.wood = 1
      })
    })
    const response = session.performRoundEnd()
    expect(waiting(response)).toMatchObject({ playerIndex: 1, sourceCard: 'E110_Dentist' })
  })

  it('lets two optional sources be passed together, or ordered with live re-evaluation', () => {
    const dentist = 'E110_Dentist', virtuoso = 'D129_LumberVirtuoso'
    const setup = () => harvest(state => {
      state.players[0]!.occupationPlayed = [dentist, virtuoso]
      state.players[0]!.resources.wood = 5
    })
    let response = setup().performRoundEnd()
    expect(values(response)).toEqual([dentist, virtuoso, '__pass__'])
    expect(passDisabled(response)).toBe(false)

    let session = setup()
    response = choose(session, session.performRoundEnd(), '__pass__')
    expect(response.state.players[0]!.resources.wood).toBe(5)
    expect(response.state.events.some(event => event.type === 'card.triggered'
      && [dentist, virtuoso].includes(event.sourceCardId ?? ''))).toBe(false)

    // The Dentist's wood leaves 4, so the Lumber Virtuoso no longer applies and the window ends.
    session = setup()
    response = choose(session, session.performRoundEnd(), dentist)
    expect(response.state.players[0]!.resources.wood).toBe(4)
    expect(response.state.players[0]!.cardStates[dentist]?.stack).toEqual(['wood'])
    expect(response.state.events.some(event => event.type === 'card.triggered' && event.sourceCardId === virtuoso)).toBe(false)

    // Selecting the Virtuoso uses it: with no reed for wood rooms, it goes straight to building stables.
    session = setup()
    response = choose(session, session.performRoundEnd(), virtuoso)
    expect(waiting(response)).toMatchObject({ sourceCard: virtuoso, request: { kind: 'farm-select' } })
  })

  it('settles an independent gain first when on, and orders it with a choice when off', () => {
    const reverend = 'C178_OnSiteReverend'
    const setup = (manual: boolean) => harvest(state => {
      state.players[0]!.minorPlayed = [RAISED_BED]
      state.players[0]!.occupationPlayed = [reverend]
      if (manual) orderReactionsManually(state)
    })
    let session = setup(false)
    let response = session.performRoundEnd()
    // Raised Bed settles; the Reverend, now the last mandatory source, opens its own choice.
    expect(response.state.players[0]!.resources.food).toBe(14)
    expect(waiting(response)).toMatchObject({ sourceCard: reverend, request: { kind: 'choice' } })

    for (const first of [reverend, RAISED_BED]) {
      session = setup(true)
      response = session.performRoundEnd()
      expect(values(response)).toEqual([RAISED_BED, reverend, '__pass__'])
      expect(passDisabled(response)).toBe(true)
      response = choose(session, response, first)
      if (first === reverend) response = choose(session, response, values(response).find(value => value !== '__skip__')!)
      else expect(waiting(response).sourceCard).toBe(reverend)
      if (first === RAISED_BED) response = choose(session, response, values(response).find(value => value !== '__skip__')!)
      // Both settled; the Harvest then fed the family from the Raised Bed food.
      expect(response.state.round).toBe(5)
      expect(response.state.players[0]!.resources.food).toBe(10 + 4 - 4)
      expect(triggerOrder(response, [RAISED_BED, reverend])).toEqual(first === reverend ? [reverend, RAISED_BED] : [RAISED_BED, reverend])
    }
  })

  it('draws the Savings Deposit start card only when the source runs, after the order is chosen', () => {
    const deposit = 'M102_SavingsDeposit', reverend = 'C178_OnSiteReverend'
    const session = harvest(state => {
      state.players[0]!.minorPlayed = [deposit]
      state.players[0]!.occupationPlayed = [reverend]
    }, { enableFarmersOfTheMoor: true, allowIncompleteFarmersOfTheMoorMinorDeal: true })
    let response = session.performRoundEnd()
    const tick = response.state.rngTick ?? 0
    // Neither source is independent, so both wait for the owner's order; offering them drew nothing.
    expect(values(response)).toEqual([deposit, reverend, '__pass__'])
    expect(response.state.players[0]!.cardStates[deposit]?.extraData?.['harvest-4']).toBeUndefined()
    response = choose(session, response, reverend)
    response = choose(session, response, values(response).find(value => value !== '__skip__')!)
    // The Savings Deposit, now the last mandatory source, draws, then passes itself left.
    expect(response.state.rngTick).toBe(tick + 1)
    expect(response.state.players[1]!.minorHand).toContain(deposit)
    expect(response.state.players[0]!.minorPlayed).not.toContain(deposit)
    expect(response.state.players[0]!.cardStates[deposit]?.extraData?.['harvest-4']).toBeUndefined()
  })

  it('draws the Wild Harvest start card as the last mandatory source and keeps an undo boundary', () => {
    const wild = 'M104_WildHarvest'
    const session = harvest(state => {
      state.players[0]!.minorPlayed = [RAISED_BED, wild]
    }, { enableFarmersOfTheMoor: true, allowIncompleteFarmersOfTheMoorMinorDeal: true })
    const response = session.performRoundEnd()
    expect(response.state.players[0]!.cardStates[wild]?.extraData?.['harvest-4']).toBeDefined()
    expect(triggerOrder(response, [RAISED_BED, wild])).toEqual([RAISED_BED, wild])
    const undone = session.undoAction()
    expect(undone.state.players[0]!.cardStates[wild]?.extraData?.['harvest-4']).toBeDefined()
  })

  it('pays Peat Iron at the start of the Harvest, before the field phase, and not again later', () => {
    const peatIron = 'M088_PeatIron'
    const session = harvest(state => {
      const owner = state.players[0]!
      owner.minorPlayed = [peatIron, RAISED_BED]
      owner.farmTerrain = [{ row: 0, col: 3, kind: 'moor' }, { row: 0, col: 4, kind: 'moor' }]
    }, { enableFarmersOfTheMoor: true, allowIncompleteFarmersOfTheMoorMinorDeal: true })
    const response = session.performRoundEnd()
    const peat = response.state.events.filter(event => event.type === 'card.triggered' && event.sourceCardId === peatIron && event.round === 4)
    expect(peat).toHaveLength(1)
    const field = response.state.events.find(event => event.type === 'harvest.phaseStarted' && event.harvestPhase === 'field' && event.round === 4)!
    expect(peat[0]!.seq).toBeLessThan(field.seq)
  })

  it('keeps the Cookery Extension bookkeeping out of the window', () => {
    const session = harvest(state => {
      state.players[0]!.minorPlayed = ['C062_CookeryExtension', RAISED_BED]
      orderReactionsManually(state)
    })
    const response = session.performRoundEnd()
    expect(response.state.players[0]!.resources.food).toBeGreaterThanOrEqual(14 - 4)
    expect(response.state.events.some(event => event.type === 'card.triggered' && event.sourceCardId === 'C062_CookeryExtension')).toBe(false)
    expect(triggerOrder(response, [RAISED_BED])).toEqual([RAISED_BED])
  })
})

describe('Game Provider before the Harvest', () => {
  it('is offered immediately before the Harvest beside Haydryer, and not again at the field phase', () => {
    const provider = 'B165_GameProvider', haydryer = 'A166_Haydryer'
    const session = harvest(state => {
      const owner = state.players[0]!
      owner.occupationPlayed = [provider, haydryer]
      owner.fields = [{ row: 0, col: 3, stacks: [{ kind: 'grain', remaining: 2 }] }]
    })
    let response = session.performRoundEnd()
    expect(response.state.roundPhase).toBe('harvest')
    expect(values(response)).toEqual(expect.arrayContaining([provider, haydryer, '__pass__']))
    response = choose(session, response, provider)
    expect(waiting(response).request.kind).toBe('selection')
    const offered = session.performRoundEnd()
    expect(offered.ok).toBe(false)

    const without = harvest(state => { state.players[0]!.occupationPlayed = [provider] })
    const noGrain = without.performRoundEnd()
    expect(noGrain.state.events.some(event => event.type === 'card.triggered' && event.sourceCardId === provider)).toBe(false)
  })
})

describe('seat auto-resolve setting', () => {
  const three = () => harvest(state => {
    const owner = state.players[0]!
    owner.minorPlayed = [RAISED_BED, CHICKEN]
    owner.occupationPlayed = ['E117_PipeSmoker']
    owner.cardStates[CHICKEN] = { counters: { food: 2 } }
    owner.fields = [{ row: 0, col: 3, stacks: [{ kind: 'grain', remaining: 2 }] }]
    orderReactionsManually(state)
  })

  it('changes only the seat, survives undo, and applies from the next selector', () => {
    const session = three()
    let response = session.performRoundEnd()
    expect(values(response)).toEqual([RAISED_BED, CHICKEN, 'E117_PipeSmoker', '__pass__'])
    response = session.setPlayerPreferences(0, { autoResolveIndependentReactions: true })
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.preferences).toEqual({ autoResolveIndependentReactions: true })
    expect(response.state.players[1]!.preferences).toEqual({ autoResolveIndependentReactions: false })
    // The open selector froze "off" when it opened: two independent gains still wait.
    response = choose(session, response, RAISED_BED)
    expect(values(response)).toEqual([CHICKEN, 'E117_PipeSmoker', '__pass__'])
    const undone = session.undoStep()
    expect(undone.ok, undone.error).toBe(true)
    expect(undone.state.players[0]!.preferences).toEqual({ autoResolveIndependentReactions: true })
  })

  it('rejects malformed settings without changing anything', () => {
    const session = three()
    session.performRoundEnd()
    for (const preferences of [{}, { autoResolveIndependentReactions: 'yes' }, { autoResolveIndependentReactions: true, other: 1 }, null]) {
      assertRejectedUnchanged(session, () => session.setPlayerPreferences(0, preferences))
    }
    assertRejectedUnchanged(session, () => session.setPlayerPreferences(5, { autoResolveIndependentReactions: true }))
  })
})
