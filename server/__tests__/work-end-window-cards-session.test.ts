import { afterEach, describe, expect, it } from 'vitest'
import type { GameSession, SessionResponse } from '../game/authoritative-session'
import type { GameState, InteractionState } from '../../shared/contract/types'
import { markAllWorkersUsed, setActiveWorkerCount } from '../../shared/domain/player'
import { isCardFlagged } from '../../shared/cards/helpers/card-state'
import { createWorkSession } from './_helpers/session-fixtures'
import { orderReactionsManually } from './_helpers/trigger-select'
import { confirmNextPlayer, confirmPlayerSwitch } from './_helpers/pending-confirms'

// #2039 PR4+5: cards printed "at the end of each work phase" resolve in the
// work-end window (`onAllWorkersPlaced`), with `roundPhase = 'work'`.
const IRON_HOE = 'E020_IronHoe'
const APIARY = 'E023_Apiary'
const STONE_CUSTODIAN = 'E158_StoneCustodian'
const PIGGY_BANK = 'E027_PiggyBank'
const CARPENTER = 'D130_RecreationalCarpenter'
const LOVE_GARDEN = 'CFL020_LoveGarden'
const RENOVATOR = 'E087_MasterRenovator'
const SUNDIAL = 'E026_Sundial'
const FARMYARD_WORKER = 'B140_FarmyardWorker'
const TOOLBOX = 'B027_Toolbox'
const CLAYPIPE = 'A053_Claypipe'
const HEWER = 'E143_Hewer'
const STRAW_HAT = 'E010_StrawHat'

const sessions: GameSession[] = []
afterEach(() => sessions.splice(0).forEach(session => session.dispose()))

/** Places each listed seat's people on the given spaces, then parks the rest. */
const workEnd = (round: number, configure: (state: GameState) => void, occupy: Record<number, string[]> = {}) => {
  const session = createWorkSession({ seed: 2039, configure: state => {
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

type Wait = Extract<InteractionState, { stateId: 'wait' }>
const waiting = (response: SessionResponse): Wait => {
  expect(response.ok, response.error).toBe(true)
  if (response.interaction.stateId !== 'wait') throw new Error(`expected a waiting interaction, got ${response.interaction.stateId}`)
  return response.interaction
}
const values = (response: SessionResponse) => waiting(response).request.options?.map(option => option.value) ?? []
const option = (response: SessionResponse, value: string) => waiting(response).request.options?.find(entry => entry.value === value)
const isSelector = (response: SessionResponse) => waiting(response).request.kind === 'select-trigger'
const passDisabled = (response: SessionResponse) => option(response, '__pass__')?.disabled === true
const choose = (session: GameSession, response: SessionResponse, value: string) => {
  const interaction = waiting(response)
  expect(values(response), JSON.stringify(interaction)).toContain(value)
  const next = session.resolveChoice(interaction.playerIndex, value)
  expect(next.ok, next.error).toBe(true)
  return next
}
const commit = (session: GameSession, response: SessionResponse, payload: Parameters<GameSession['commitSelectionChoice']>[1]) => {
  const next = session.commitSelectionChoice(waiting(response).playerIndex, payload)
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
const stacks = (response: SessionResponse) => response.state.players[0]!.fields.map(field => ({ row: field.row, col: field.col, stacks: field.stacks }))

describe('the work-end window orders cards printed "at the end of each work phase"', () => {
  const hoeAndApiary = (manual: boolean) => workEnd(3, state => {
    const owner = state.players[0]!
    owner.minorPlayed = [IRON_HOE, APIARY]
    owner.fields = [{ row: 0, col: 1, stacks: [] }]
    Object.assign(owner.resources, { grain: 1, vegetable: 1 })
    if (manual) orderReactionsManually(state)
  }, { 0: ['grain-seeds', 'vegetable-seeds'] })

  it.each([false, true])('Iron Hoe and Apiary share one selector with Pass (manual order: %s)', (manual) => {
    const response = hoeAndApiary(manual).performRoundEnd()
    expect(response.state.roundPhase).toBe('work')
    expect(isSelector(response)).toBe(true)
    expect(waiting(response).playerIndex).toBe(0)
    expect(values(response)).toEqual([IRON_HOE, APIARY, '__pass__'])
    expect(passDisabled(response)).toBe(false)
  })

  it('Apiary first sows the existing field, then Iron Hoe plows a new one', () => {
    const session = hoeAndApiary(false)
    let response = choose(session, session.performRoundEnd(), APIARY)
    expect(waiting(response).request.kind).toBe('farm-select')
    response = commit(session, response, { crops: [{ row: 0, col: 1, crop: 'grain' }] })
    expect(values(response)).toEqual([IRON_HOE, '__pass__'])
    response = choose(session, response, IRON_HOE)
    response = commit(session, response, { tile: { row: 0, col: 2 } })
    response = toNextRound(session, response, 3)
    expect(stacks(response)).toEqual([
      { row: 0, col: 1, stacks: [{ kind: 'grain', remaining: 3 }] },
      { row: 0, col: 2, stacks: [] },
    ])
    expect(triggered(response, [IRON_HOE, APIARY], 3)).toEqual([APIARY, IRON_HOE])
  })

  it('Iron Hoe first plows a field that Apiary can then sow', () => {
    const session = hoeAndApiary(false)
    let response = choose(session, session.performRoundEnd(), IRON_HOE)
    response = commit(session, response, { tile: { row: 0, col: 2 } })
    expect(values(response)).toEqual([APIARY, '__pass__'])
    response = choose(session, response, APIARY)
    response = commit(session, response, { crops: [{ row: 0, col: 2, crop: 'vegetable' }] })
    response = toNextRound(session, response, 3)
    expect(stacks(response)).toEqual([
      { row: 0, col: 1, stacks: [] },
      { row: 0, col: 2, stacks: [{ kind: 'vegetable', remaining: 2 }] },
    ])
    expect(triggered(response, [IRON_HOE, APIARY], 3)).toEqual([IRON_HOE, APIARY])
  })

  it('one Pass declines both, and Apiary is not offered again when returning home', () => {
    const session = hoeAndApiary(false)
    let response = choose(session, session.performRoundEnd(), '__pass__')
    response = toNextRound(session, response, 3)
    expect(stacks(response)).toEqual([{ row: 0, col: 1, stacks: [] }])
    expect(triggered(response, [IRON_HOE, APIARY], 3)).toEqual([])
  })
})

describe('the work-end window follows the seat setting', () => {
  // Round 6: no Harvest follows, so food changes only through these cards.
  const custodianAndPiggyBank = (manual: boolean) => workEnd(6, state => {
    const owner = state.players[0]!
    owner.occupationPlayed = [STONE_CUSTODIAN]
    owner.minorPlayed = [PIGGY_BANK]
    owner.resources.food = 1
    for (const space of state.actionSpaces) {
      if (space.id === 'eastern-quarry') space.resources.stone = 2
      if (space.id === 'western-quarry') space.resources.stone = 0
    }
    if (manual) orderReactionsManually(state)
  })
  const piggyFood = (response: SessionResponse) => response.state.players[0]!.cardStates[PIGGY_BANK]?.counters?.food ?? 0

  it('auto-resolve on: Stone Custodian settles first, then Piggy Bank keeps [card, Pass]', () => {
    const session = custodianAndPiggyBank(false)
    let response = session.performRoundEnd()
    expect(response.state.players[0]!.resources.food).toBe(2)
    expect(values(response)).toEqual([PIGGY_BANK, '__pass__'])
    response = choose(session, response, PIGGY_BANK)
    expect(response.state.players[0]!.resources.food).toBe(1)
    expect(piggyFood(response)).toBe(1)
    expect(triggered(response, [PIGGY_BANK, STONE_CUSTODIAN], 6)).toEqual([STONE_CUSTODIAN, PIGGY_BANK])
  })

  it.each([
    [STONE_CUSTODIAN, PIGGY_BANK],
    [PIGGY_BANK, STONE_CUSTODIAN],
  ])('auto-resolve off: %s first gives the same result', (first, second) => {
    const session = custodianAndPiggyBank(true)
    let response = session.performRoundEnd()
    expect(response.state.players[0]!.resources.food).toBe(1)
    expect(values(response)).toEqual([PIGGY_BANK, STONE_CUSTODIAN, '__pass__'])
    expect(passDisabled(response)).toBe(true)
    response = choose(session, response, first)
    if (first === STONE_CUSTODIAN) response = choose(session, response, PIGGY_BANK)
    expect(response.state.players[0]!.resources.food).toBe(1)
    expect(piggyFood(response)).toBe(1)
    expect(triggered(response, [PIGGY_BANK, STONE_CUSTODIAN], 6)).toEqual([first, second])
  })

  it('undoStep restores the same selector after the first choice', () => {
    const session = custodianAndPiggyBank(true)
    const offered = session.performRoundEnd()
    const selector = structuredClone(offered.interaction)
    choose(session, offered, STONE_CUSTODIAN)
    const undone = session.undoStep()
    expect(undone.ok, undone.error).toBe(true)
    expect(undone.interaction).toEqual(selector)
    expect(undone.state.players[0]!.resources.food).toBe(1)
  })
})

describe('moved cards that depend on the order inside the window', () => {
  it('Recreational Carpenter builds the room that Love Garden then needs for a Family Growth', () => {
    const session = workEnd(7, state => {
      const owner = state.players[0]!
      owner.occupationPlayed = [CARPENTER]
      owner.minorPlayed = [LOVE_GARDEN]
      Object.assign(owner.resources, { wood: 5, reed: 2 })
    }, { 0: ['farm-expansion', 'forest'], 1: ['wish-children', 'clay-pit'] })
    let response = session.performRoundEnd()
    expect(isSelector(response)).toBe(true)
    expect(values(response)).toEqual([LOVE_GARDEN, CARPENTER, '__pass__'])
    expect(option(response, LOVE_GARDEN)?.disabled).toBe(true)
    response = choose(session, response, CARPENTER)
    for (let step = 0; step < 3 && waiting(response).request.kind !== 'farm-select'; step += 1) {
      response = choose(session, response, values(response).find(value => !['__skip__', '__pass__'].includes(value))!)
    }
    const farm = waiting(response).request
    if (farm.kind !== 'farm-select') throw new Error('expected the room selection')
    response = commit(session, response, { rooms: farm.farm.selectableTiles.slice(0, 1) })
    expect(response.state.players[0]!.rooms).toBe(3)
    expect(values(response)).toEqual([LOVE_GARDEN, '__pass__'])
    response = choose(session, response, LOVE_GARDEN)
    // The round then runs on through its Harvest, so the newborn is already grown up.
    expect(response.state.players[0]!.workers.filter(worker => worker.isActive)).toHaveLength(3)
    expect(triggered(response, [CARPENTER, LOVE_GARDEN], 7)).toEqual([CARPENTER, LOVE_GARDEN])
  })

  it('Recreational Carpenter stays silent after its owner used the Meeting Place', () => {
    const session = workEnd(7, state => {
      const owner = state.players[0]!
      owner.occupationPlayed = [CARPENTER]
      owner.minorPlayed = [LOVE_GARDEN]
      Object.assign(owner.resources, { wood: 5, reed: 2 })
    }, { 0: ['farm-expansion', 'meeting-place'], 1: ['wish-children', 'clay-pit'] })
    let response = session.performRoundEnd()
    // Love Garden is the sole source but has no room: nothing to accept.
    response = toNextRound(session, response, 7)
    expect(response.state.players[0]!.rooms).toBe(2)
    expect(response.state.players[0]!.workers.filter(worker => worker.isActive)).toHaveLength(2)
  })

  it('Master Renovator and Sundial, once split across two hooks, share the round-7 window', () => {
    const configure = (state: GameState) => {
      const owner = state.players[0]!
      owner.occupationPlayed = [RENOVATOR]
      owner.minorPlayed = [SUNDIAL]
      owner.fields = [{ row: 0, col: 1, stacks: [] }]
      Object.assign(owner.resources, { grain: 1, clay: 1, reed: 1 })
    }
    const session = workEnd(7, configure)
    const response = session.performRoundEnd()
    expect(isSelector(response)).toBe(true)
    expect(values(response)).toEqual([SUNDIAL, RENOVATOR, '__pass__'])
    // Round 8 offers neither.
    const later = workEnd(8, configure)
    const next = later.performRoundEnd()
    expect(next.interaction.stateId === 'wait' && values(next).includes(SUNDIAL)).toBe(false)
    expect(triggered(next, [SUNDIAL, RENOVATOR], 8)).toEqual([])
  })

  it('Farmyard Worker counts the good that Apiary sows in the same window', () => {
    const session = workEnd(5, state => {
      const owner = state.players[0]!
      owner.minorPlayed = [APIARY]
      owner.occupationPlayed = [FARMYARD_WORKER]
      owner.fields = [{ row: 0, col: 1, stacks: [] }]
      owner.resources.grain = 1
    })
    let response = session.performRoundEnd()
    // Farmyard Worker waits hidden: no good was placed on the farmyard this round yet.
    expect(values(response)).toEqual([APIARY, '__pass__'])
    response = choose(session, response, APIARY)
    response = commit(session, response, { crops: [{ row: 0, col: 1, crop: 'grain' }] })
    // Rechecked after the sowing, Farmyard Worker is now a mandatory independent source.
    expect(response.state.players[0]!.resources.food).toBe(12)
    expect(triggered(response, [APIARY, FARMYARD_WORKER], 5)).toEqual([APIARY, FARMYARD_WORKER])
  })

  it('Farmyard Worker stays silent when Apiary is declined', () => {
    const session = workEnd(5, state => {
      const owner = state.players[0]!
      owner.minorPlayed = [APIARY]
      owner.occupationPlayed = [FARMYARD_WORKER]
      owner.fields = [{ row: 0, col: 1, stacks: [] }]
      owner.resources.grain = 1
    })
    const response = toNextRound(session, session.performRoundEnd(), 5)
    expect(response.state.players[0]!.resources.food).toBe(10)
    expect(triggered(response, [FARMYARD_WORKER], 5)).toEqual([])
  })

  it('a room built in the work-end window leaves Toolbox unflagged for the next Turn', () => {
    const session = workEnd(5, state => {
      const owner = state.players[0]!
      owner.occupationPlayed = [CARPENTER]
      owner.minorPlayed = [TOOLBOX]
      Object.assign(owner.resources, { wood: 5, reed: 2 })
    }, { 0: ['forest', 'clay-pit'] })
    let response = session.performRoundEnd()
    for (let step = 0; step < 4 && waiting(response).request.kind !== 'farm-select'; step += 1) {
      response = choose(session, response, values(response).find(value => !['__skip__', '__pass__'].includes(value))!)
    }
    const farm = waiting(response).request
    if (farm.kind !== 'farm-select') throw new Error('expected the room selection')
    response = commit(session, response, { rooms: farm.farm.selectableTiles.slice(0, 1) })
    expect(response.state.players[0]!.rooms).toBe(3)
    expect(isCardFlagged(response.state.players[0]!, TOOLBOX)).toBe(false)
    response = toNextRound(session, response, 5)
    // The owner's first Turn of round 6 builds nothing: no Toolbox purchase at its end.
    response = session.takeAction(response.state.currentPlayerIndex, 'day-laborer')
    expect(response.ok, response.error).toBe(true)
    expect(response.interaction.stateId === 'wait' ? response.interaction.promptKey : undefined)
      .not.toBe('ui.interactionToolboxImprovement')
  })

  it('Hewer\'s stone at the end of the work phase counts toward Claypipe', () => {
    const session = workEnd(5, state => {
      const owner = state.players[0]!
      owner.occupationPlayed = [HEWER]
      owner.minorPlayed = [CLAYPIPE]
      state.workPhaseObtainedResources[owner.id] = { wood: 6 }
    }, { 0: ['forest', 'reed-bank'] })
    const response = toNextRound(session, session.performRoundEnd(), 5)
    // Hewer: 1 stone and 1 food; Claypipe: 7 building resources this work phase, 2 food.
    expect(response.state.players[0]!.resources).toMatchObject({ stone: 1, food: 13 })
    expect(triggered(response, [HEWER, CLAYPIPE], 5)).toEqual([HEWER, CLAYPIPE])
  })

  it('Straw Hat is offered at the end of the work phase of round 3 only', () => {
    const configure = (state: GameState) => { state.players[0]!.minorPlayed = [STRAW_HAT] }
    const session = workEnd(3, configure, { 0: ['farmland', 'forest'] })
    let response = session.performRoundEnd()
    expect(response.state.roundPhase).toBe('work')
    expect(waiting(response).sourceCard).toBe(STRAW_HAT)
    const food = waiting(response).request.options?.find(entry => entry.labelKey === 'actions.gain.name')
    response = choose(session, response, food!.value)
    expect(response.state.players[0]!.resources.food).toBe(11)
    toNextRound(session, response, 3)
    const later = workEnd(4, configure, { 0: ['farmland', 'forest'] })
    expect(triggered(later.performRoundEnd(), [STRAW_HAT], 4)).toEqual([])
  })
})
