import { afterEach, describe, expect, it } from 'vitest'
import type { GameSession, SessionResponse } from '../game/authoritative-session'
import type { GameState, InteractionState } from '../../shared/contract/types'
import type { CardImpl } from '../../shared/cards/registry'
import { markAllWorkersUsed, setActiveWorkerCount } from '../../shared/domain/player'
import { createPlayerActionSpaces } from '../../shared/cards/player-action-space'
import { createWorkSession } from './_helpers/session-fixtures'
import { orderReactionsManually } from './_helpers/trigger-select'
import { testCardImpl } from './_helpers/test-card-impl'
import { confirmNextPlayer, confirmPlayerSwitch } from './_helpers/pending-confirms'

// #2039 PR4+5: the return-home windows are frozen-order reaction windows.
// "At the start of the returning home phase" → onStartReturnHome; "in the
// returning home phase" → onReturnHome; "immediately after" → onAfterReturnHome.
const BELLFOUNDER = 'D107_Bellfounder'
const ROLLING_PIN = 'D052_RollingPin'
const ALE_BENCHES = 'A029_AleBenches'
const SILAGE = 'A084_Silage'
const BOHEMIAN = 'A157_Bohemian'
const TURNIP_FARMER = 'A141_TurnipFarmer'
const INFORMANT = 'B117_Informant'
const ARCHWAY = 'D051_Archway'
const FOREST_FARMER = 'CWM023_ForestFarmer'
const STEAM_PLOW = 'D018_SteamPlow'
const FIREWOOD = 'C075_Firewood'
const TRIMMER = 'B124_Trimmer'
const AFTER_RETURN_FOOD = 'TEST_AfterReturnHomeFood'
const afterReturnCards: Record<string, CardImpl> = {
  [AFTER_RETURN_FOOD]: testCardImpl(AFTER_RETURN_FOOD, '{ effect: { id: CARD_ID, onAfterReturnHome: () => gainLeaf(CARD_ID, { food: 1 }) } }'),
}

const sessions: GameSession[] = []
afterEach(() => sessions.splice(0).forEach(session => session.dispose()))

const returnHome = (
  round: number,
  configure: (state: GameState) => void,
  occupy: Record<number, string[]> = {},
  cardImpls?: Record<string, CardImpl>,
) => {
  const session = createWorkSession({ seed: 2039, cardImpls, configure: state => {
    state.round = round
    for (const player of state.players) {
      player.fields = []
      Object.assign(player.resources, { food: 10, grain: 0, vegetable: 0, wood: 0, clay: 0, reed: 0, stone: 0 })
    }
    configure(state)
    for (const [seat, spaceIds] of Object.entries(occupy)) {
      const player = state.players[Number(seat)]!
      if (spaceIds.length > 2) setActiveWorkerCount(player, spaceIds.length)
      const workers = player.workers.filter(worker => worker.isActive)
      spaceIds.forEach((spaceId, index) => {
        state.actionSpaces.find(space => space.id === spaceId)!.takenBy.push({ playerId: player.id, workerId: workers[index]!.id })
      })
    }
    for (const player of state.players) markAllWorkersUsed(state, player)
  } })
  sessions.push(session)
  return session
}
const startPlayer = (state: GameState, seat: number) => state.players.forEach((player, index) => { player.startPlayer = index === seat })

type Wait = Extract<InteractionState, { stateId: 'wait' }>
const waiting = (response: SessionResponse): Wait => {
  expect(response.ok, response.error).toBe(true)
  if (response.interaction.stateId !== 'wait') throw new Error(`expected a waiting interaction, got ${response.interaction.stateId}`)
  return response.interaction
}
const values = (response: SessionResponse) => waiting(response).request.options?.map(option => option.value) ?? []
const isSelector = (response: SessionResponse) => waiting(response).request.kind === 'select-trigger'
const passDisabled = (response: SessionResponse) =>
  waiting(response).request.options?.find(option => option.value === '__pass__')?.disabled === true
const windowOf = (response: SessionResponse) => waiting(response).spaceId
const choose = (session: GameSession, response: SessionResponse, value: string) => {
  const interaction = waiting(response)
  expect(values(response), JSON.stringify(interaction)).toContain(value)
  const next = session.resolveChoice(interaction.playerIndex, value)
  expect(next.ok, next.error).toBe(true)
  return next
}
/** Declines optional windows and confirms hand-offs until the next round's work phase. */
const toNextRound = (session: GameSession, response: SessionResponse, round: number) => {
  for (let step = 0; step < 40 && !(response.state.round === round + 1 && response.interaction.stateId === 'idle'); step += 1) {
    const interaction = waiting(response)
    const kind = interaction.request.kind
    if (kind === 'confirm-next-player') response = confirmNextPlayer(session)
    else if (kind === 'confirm-player-switch') response = confirmPlayerSwitch(session)
    else if (kind === 'feed') response = session.resolveChoice(interaction.playerIndex, 'confirm', { selections: [] })
    else if (kind === 'animal-reorg') response = session.resolveChoice(interaction.playerIndex, 'confirm', { zones: interaction.request.zones })
    else response = session.resolveChoice(interaction.playerIndex, kind === 'select-trigger' ? '__pass__' : '__skip__')
    expect(response.ok, response.error).toBe(true)
  }
  expect(response.state.round).toBe(round + 1)
  return response
}
const triggered = (response: SessionResponse, cards: string[], round: number) => response.state.events
  .filter(event => event.type === 'card.triggered' && cards.includes(event.sourceCardId ?? '') && event.round === round)
  .map(event => event.sourceCardId)
  .filter((cardId, index, list) => list.indexOf(cardId) === index)

describe('the returning home window merges cards printed "in the returning home phase"', () => {
  // Bellfounder sat in onStartReturnHome and Rolling Pin in onReturnHome: the order was fixed.
  const bellAndPin = (manual: boolean) => returnHome(2, state => {
    const owner = state.players[0]!
    owner.minorPlayed = [ROLLING_PIN]
    owner.occupationPlayed = [BELLFOUNDER]
    Object.assign(owner.resources, { clay: 2, wood: 0, food: 0 })
    if (manual) orderReactionsManually(state)
  })
  const bellForFood = (session: GameSession, response: SessionResponse) => {
    const food = waiting(response).request.options?.find(option => option.effectPreview?.kind === 'resourceExchange'
      && option.effectPreview.resourcesGained?.food === 3)
    expect(food, JSON.stringify(waiting(response).request.options)).toBeDefined()
    return choose(session, response, food!.value)
  }

  it('auto-resolve on: Rolling Pin settles first, then Bellfounder keeps [card, Pass]', () => {
    const session = bellAndPin(false)
    let response = session.performRoundEnd()
    expect(windowOf(response)).toBe('__stage:onReturnHome')
    expect(response.state.players[0]!.resources.food).toBe(1)
    expect(values(response)).toEqual([BELLFOUNDER, '__pass__'])
    response = bellForFood(session, choose(session, response, BELLFOUNDER))
    expect(response.state.round).toBe(3)
    expect(response.state.players[0]!.resources).toMatchObject({ clay: 0, food: 4 })
    expect(triggered(response, [ROLLING_PIN, BELLFOUNDER], 2)).toEqual([ROLLING_PIN, BELLFOUNDER])
  })

  it('auto-resolve off: Rolling Pin first keeps both effects', () => {
    const session = bellAndPin(true)
    let response = session.performRoundEnd()
    expect(values(response)).toEqual([ROLLING_PIN, BELLFOUNDER, '__pass__'])
    expect(passDisabled(response)).toBe(true)
    response = choose(session, response, ROLLING_PIN)
    expect(values(response)).toEqual([BELLFOUNDER, '__pass__'])
    response = bellForFood(session, choose(session, response, BELLFOUNDER))
    expect(response.state.players[0]!.resources).toMatchObject({ clay: 0, food: 4 })
    expect(triggered(response, [ROLLING_PIN, BELLFOUNDER], 2)).toEqual([ROLLING_PIN, BELLFOUNDER])
  })

  it('auto-resolve off: Bellfounder first discards the clay, so Rolling Pin no longer applies', () => {
    const session = bellAndPin(true)
    let response = session.performRoundEnd()
    response = bellForFood(session, choose(session, response, BELLFOUNDER))
    expect(response.state.round).toBe(3)
    expect(response.state.players[0]!.resources).toMatchObject({ clay: 0, food: 3 })
    expect(triggered(response, [ROLLING_PIN, BELLFOUNDER], 2)).toEqual([BELLFOUNDER])
  })

  it('undoStep restores the same selector after the first choice', () => {
    const session = bellAndPin(true)
    const offered = session.performRoundEnd()
    const selector = structuredClone(offered.interaction)
    choose(session, offered, ROLLING_PIN)
    const undone = session.undoStep()
    expect(undone.ok, undone.error).toBe(true)
    expect(undone.interaction).toEqual(selector)
    expect(undone.state.players[0]!.resources.food).toBe(0)
  })
})

describe('the returning home window lets optional sources compete for one grain', () => {
  const benchesAndSilage = (round: number) => returnHome(round, state => {
    const owner = state.players[0]!
    owner.minorPlayed = [ALE_BENCHES, SILAGE]
    owner.fields = [{ row: 0, col: 1, stacks: [] }, { row: 0, col: 2, stacks: [] }]
    owner.pastures = [{ id: 'sheep', tiles: [{ row: 0, col: 3 }, { row: 0, col: 4 }], animalType: 'sheep', animalCount: 2 }]
    owner.fenceSegments = ['H-0-3', 'H-0-4', 'H-1-3', 'H-1-4', 'V-0-3', 'V-0-5'].map(edge => ({ edge, type: 'fence' as const }))
    Object.assign(owner.resources, { grain: 1, sheep: 2 })
  })

  it('Ale Benches first spends the grain, so Silage no longer applies', () => {
    const session = benchesAndSilage(2)
    let response = session.performRoundEnd()
    expect(isSelector(response)).toBe(true)
    expect(values(response)).toEqual([ALE_BENCHES, SILAGE, '__pass__'])
    expect(passDisabled(response)).toBe(false)
    response = choose(session, response, ALE_BENCHES)
    response = toNextRound(session, response, 2)
    expect(response.state.players[0]!.resources).toMatchObject({ grain: 0, sheep: 2 })
    expect(response.state.players[1]!.resources.food).toBe(11)
    expect(triggered(response, [ALE_BENCHES, SILAGE], 2)).toEqual([ALE_BENCHES])
  })

  it('Silage first breeds a sheep with the grain, so Ale Benches no longer applies', () => {
    const session = benchesAndSilage(2)
    let response = choose(session, session.performRoundEnd(), SILAGE)
    if (response.interaction.stateId === 'wait' && response.interaction.sourceCard === SILAGE && !isSelector(response)) {
      response = choose(session, response, values(response).find(value => value !== '__skip__')!)
    }
    response = toNextRound(session, response, 2)
    expect(response.state.players[0]!.resources).toMatchObject({ grain: 0, sheep: 3 })
    expect(response.state.players[1]!.resources.food).toBe(10)
    expect(triggered(response, [ALE_BENCHES, SILAGE], 2)).toEqual([SILAGE])
  })

  it('one Pass declines both; in a Harvest round Silage is not offered', () => {
    const session = benchesAndSilage(2)
    const declined = toNextRound(session, choose(session, session.performRoundEnd(), '__pass__'), 2)
    expect(declined.state.players[0]!.resources).toMatchObject({ grain: 1, sheep: 2 })
    // Silage stays a hidden, inapplicable source after which a Harvest follows.
    const harvest = benchesAndSilage(4).performRoundEnd()
    expect(values(harvest)).toEqual([ALE_BENCHES, '__pass__'])
  })
})

describe('return-home windows go clockwise from the Start Player', () => {
  it('asks the Start Player P1 before P0', () => {
    const session = returnHome(2, state => {
      startPlayer(state, 1)
      for (const player of state.players) {
        player.occupationPlayed = [BELLFOUNDER]
        player.resources.clay = 1
      }
    })
    let response = session.performRoundEnd()
    expect(waiting(response).playerIndex).toBe(1)
    expect(waiting(response).sourceCard).toBe(BELLFOUNDER)
    response = session.resolveChoice(1, '__skip__')
    expect(response.ok, response.error).toBe(true)
    if (waiting(response).request.kind === 'confirm-player-switch') response = confirmPlayerSwitch(session)
    expect(waiting(response).playerIndex).toBe(0)
    expect(waiting(response).sourceCard).toBe(BELLFOUNDER)
  })
})

describe('the start-of-return-home window', () => {
  const bohemianAndTurnip = (manual: boolean) => returnHome(2, state => {
    state.players[0]!.occupationPlayed = [TURNIP_FARMER, BOHEMIAN]
    if (manual) orderReactionsManually(state)
  }, { 0: ['grain-seeds', 'forest'], 1: ['day-laborer', 'clay-pit'] })

  it('auto-resolve on: both independent sources settle without asking', () => {
    const response = bohemianAndTurnip(false).performRoundEnd()
    expect(response.state.round).toBe(3)
    expect(response.interaction.stateId).toBe('idle')
    expect(response.state.players[0]!.resources).toMatchObject({ food: 11, vegetable: 1 })
    expect(triggered(response, [TURNIP_FARMER, BOHEMIAN], 2)).toEqual([TURNIP_FARMER, BOHEMIAN])
  })

  it.each([
    [TURNIP_FARMER, BOHEMIAN],
    [BOHEMIAN, TURNIP_FARMER],
  ])('auto-resolve off: %s first gives the same result', (first, second) => {
    const session = bohemianAndTurnip(true)
    let response = session.performRoundEnd()
    expect(windowOf(response)).toBe('__stage:onStartReturnHome')
    expect(values(response)).toEqual([TURNIP_FARMER, BOHEMIAN, '__pass__'])
    expect(passDisabled(response)).toBe(true)
    response = choose(session, response, first)
    expect(response.state.round).toBe(3)
    expect(response.state.players[0]!.resources).toMatchObject({ food: 11, vegetable: 1 })
    expect(triggered(response, [TURNIP_FARMER, BOHEMIAN], 2)).toEqual([first, second])
  })
})

describe('the window just before returning home', () => {
  const informantAndArchway = (manual: boolean) => returnHome(2, state => {
    const owner = state.players[0]!
    owner.minorPlayed = [ARCHWAY]
    owner.occupationPlayed = [INFORMANT]
    owner.resources.stone = 2
    state.actionSpaces.push(...createPlayerActionSpaces(state))
    if (manual) orderReactionsManually(state)
  }, { 0: [ARCHWAY, 'forest'] })

  it('auto-resolve on: Informant settles first, then Archway runs as the sole mandatory source with its own skip', () => {
    const session = informantAndArchway(false)
    let response = session.performRoundEnd()
    expect(windowOf(response)).toBe('__stage:onBeforeReturnHome')
    expect(response.state.events.some(event => event.round === 2 && event.type === 'work.ended')).toBe(false)
    expect(response.state.players[0]!.resources.wood).toBe(1)
    expect(waiting(response).sourceCard).toBe(ARCHWAY)
    expect(values(response)).toContain('__skip__')
    response = toNextRound(session, response, 2)
    expect(response.state.players[0]!.resources.wood).toBe(1)
  })

  it.each([
    [INFORMANT, ARCHWAY],
    [ARCHWAY, INFORMANT],
  ])('auto-resolve off: %s first, Informant still gives its wood', (first) => {
    const session = informantAndArchway(true)
    let response = session.performRoundEnd()
    expect(values(response)).toEqual([ARCHWAY, INFORMANT, '__pass__'])
    expect(passDisabled(response)).toBe(true)
    response = choose(session, response, first)
    response = toNextRound(session, response, 2)
    expect(response.state.players[0]!.resources.wood).toBe(1)
  })

  it('Forest Farmer now waits with Informant just before returning home', () => {
    const session = returnHome(2, state => {
      const owner = state.players[0]!
      owner.occupationPlayed = [FOREST_FARMER, INFORMANT]
      owner.cardStates[FOREST_FARMER] = { counters: { uses: 3 } }
      Object.assign(owner.resources, { wood: 1, stone: 2 })
    }, { 0: ['farmland', 'forest'] })
    let response = session.performRoundEnd()
    expect(windowOf(response)).toBe('__stage:onBeforeReturnHome')
    expect(response.state.roundPhase).toBe('returning-home')
    expect(response.state.players[0]!.resources.wood).toBe(2)
    expect(values(response)).toEqual([FOREST_FARMER, '__pass__'])
    response = toNextRound(session, choose(session, response, '__pass__'), 2)
    expect(response.state.players[0]!.cardStates[FOREST_FARMER]?.counters?.uses).toBe(3)
  })
})

describe('the window after the workers return home', () => {
  const plowAndFood = (round: number, manual: boolean, wood = 2) => returnHome(round, state => {
    const owner = state.players[0]!
    owner.minorPlayed = [STEAM_PLOW, AFTER_RETURN_FOOD]
    Object.assign(owner.resources, { wood, food: 1 })
    if (manual) orderReactionsManually(state)
  }, { 0: ['farmland', 'forest'] }, afterReturnCards)
  const plowFirstField = (session: GameSession, response: SessionResponse) => {
    for (let step = 0; step < 3 && waiting(response).request.kind !== 'farm-select'; step += 1) {
      response = choose(session, response, values(response).find(value => !['__skip__', '__pass__'].includes(value))!)
    }
    const next = session.commitSelectionChoice(waiting(response).playerIndex, { tile: { row: 0, col: 1 } })
    expect(next.ok, next.error).toBe(true)
    return next
  }

  it('auto-resolve on: the plain gain settles, then Steam Plow uses the emptied Farmland', () => {
    const session = plowAndFood(2, false)
    let response = session.performRoundEnd()
    expect(windowOf(response)).toBe('__stage:onAfterReturnHome')
    expect(response.state.roundPhase).toBe('returning-home')
    expect(response.state.actionSpaces.every(space => space.takenBy.length === 0)).toBe(true)
    expect(response.state.events.some(event => event.round === 2 && event.type === 'worker.returned' && event.to === 'home')).toBe(true)
    expect(response.state.players[0]!.resources.food).toBe(2)
    expect(values(response)).toEqual([STEAM_PLOW, '__pass__'])
    response = plowFirstField(session, choose(session, response, STEAM_PLOW))
    expect(response.state.round).toBe(3)
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 0, food: 1 })
    expect(response.state.players[0]!.fields).toEqual([{ row: 0, col: 1, stacks: [] }])
  })

  it.each([
    [STEAM_PLOW, AFTER_RETURN_FOOD],
    [AFTER_RETURN_FOOD, STEAM_PLOW],
  ])('auto-resolve off: %s first gives the same result', (first, second) => {
    const session = plowAndFood(2, true)
    let response = session.performRoundEnd()
    expect(values(response)).toEqual([STEAM_PLOW, AFTER_RETURN_FOOD, '__pass__'])
    expect(passDisabled(response)).toBe(true)
    response = choose(session, response, first)
    if (first === STEAM_PLOW) response = plowFirstField(session, response)
    else response = plowFirstField(session, choose(session, response, STEAM_PLOW))
    expect(response.state.round).toBe(3)
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 0, food: 1 })
    expect(triggered(response, [STEAM_PLOW, AFTER_RETURN_FOOD], 2)).toEqual([first, second])
  })

  it('Steam Plow is not offered without 2 wood, and in a Harvest round it waits before the Harvest', () => {
    const poor = plowAndFood(2, false, 1).performRoundEnd()
    expect(poor.state.round).toBe(3)
    expect(triggered(poor, [STEAM_PLOW], 2)).toEqual([])
    const harvest = plowAndFood(4, false).performRoundEnd()
    expect(windowOf(harvest)).toBe('__stage:onAfterReturnHome')
    expect(harvest.state.roundPhase).toBe('returning-home')
    expect(harvest.state.events.some(event => event.round === 4 && event.type === 'harvest.phaseStarted')).toBe(false)
  })
})

describe('return-home bookkeeping is no source', () => {
  const firewoodAndPin = (manual: boolean) => returnHome(2, state => {
    const owner = state.players[0]!
    owner.minorPlayed = [FIREWOOD, ROLLING_PIN]
    owner.occupationPlayed = [TRIMMER]
    Object.assign(owner.resources, { clay: 1, wood: 0 })
    if (manual) orderReactionsManually(state)
  })
  const firewood = (response: SessionResponse) => response.state.players[0]!.cardStates[FIREWOOD]?.counters?.wood ?? 0

  it('auto-resolve on: Firewood stores its wood through a standard leaf without asking', () => {
    const response = firewoodAndPin(false).performRoundEnd()
    expect(response.state.round).toBe(3)
    expect(firewood(response)).toBe(1)
    expect(response.state.players[0]!.resources.food).toBe(11)
  })

  it.each([
    [FIREWOOD, ROLLING_PIN],
    [ROLLING_PIN, FIREWOOD],
  ])('auto-resolve off: only Firewood and Rolling Pin are offered (Trimmer is no source), %s first', (first, second) => {
    const session = firewoodAndPin(true)
    let response = session.performRoundEnd()
    expect(values(response)).toEqual([FIREWOOD, ROLLING_PIN, '__pass__'])
    response = choose(session, response, first)
    expect(response.state.round).toBe(3)
    expect(firewood(response)).toBe(1)
    expect(response.state.players[0]!.resources.food).toBe(11)
    expect(triggered(response, [FIREWOOD, ROLLING_PIN], 2)).toEqual([first, second])
  })
})
