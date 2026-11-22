import { describe, expect, it } from 'vitest'
import { collectCardStatePresentation } from '../../shared/cards/card-state-presentation'
import { getClassicAdjacentSpaceIds } from '../../shared/cards/helpers/classic-board-topology'
import type { GameState } from '../../shared/contract/types'
import type { GameSession, SessionResponse } from '../game/authoritative-session'
import { playMinor, playOccupation, sessionOptions } from './_helpers/card-regression-session'
import {
  wmAction,
  wmBonus,
  wmChoose,
  wmConfirmations,
  wmEndRound,
  wmEvent,
  wmId as id,
  wmOk,
  wmPayment,
  wmSession,
} from './_helpers/classic-wm-session'

// Plan: new four-player work games with explicit hands and zero resources.
// Each card relies only on card-level helpers: printed board adjacency, a farmyard
// token, or markers on rooms. Drive public commands and assert resources, farm
// state, markers, scores and the cases that must not trigger.
function anytime(session: GameSession, n: number) {
  const action = session
    .getState()
    .interaction.anytimeActions.find((action) => action.sourceCard === id(n))
  expect(action, JSON.stringify(session.getState().interaction)).toBeDefined()
  return wmOk(session.takeAnytimeAction(0, action!.id))
}
const markers = (session: GameSession, n: number) =>
  session.withCtx(() => collectCardStatePresentation(session.state.players[0]!))[id(n)]?.farmTerrainMarkers
const chooseOffered = (session: GameSession, response: SessionResponse) =>
  wmChoose(session, response, sessionOptions(response).find((o) => !o.disabled && o.value !== '__skip__')!.value)
const sheepPasture = (state: GameState, sheep: number) => {
  const p = state.players[0]!
  p.resources.sheep = sheep
  p.pastures = [{
    id: 'pasture-1',
    tiles: [{ row: 0, col: 1 }, { row: 0, col: 2 }],
    animalType: 'sheep',
    animalCount: sheep,
    stableCount: 0,
  }]
  p.fenceSegments = ['H-0-1', 'H-0-2', 'H-1-1', 'H-1-2', 'V-0-1', 'V-0-3'].map((edge) => ({
    edge,
    type: 'fence',
    source: { kind: 'own', ownerPlayerId: p.id },
  }))
}
/** Reveal `spaceId` in `round`, keeping the reveal order a permutation. */
const reveal = (state: GameState, round: number, spaceId: string) => {
  const order = state.roundActionOrder
  const from = order.indexOf(spaceId)
  if (from >= 0) order[from] = order[round - 1]!
  order[round - 1] = spaceId
}

describe('WM cards built on card-level helpers in four-player sessions', () => {
  it.each(['reed-bank', 'day-laborer', 'vegetable-seeds'])('Fish Hook may take one food after using the printed neighbour %s', space => {
    const session = wmSession([80], state => {
      state.round = 4
      state.roundActionOrder[3] = 'vegetable-seeds'
      state.actionSpaces.find(s => s.id === 'fishing')!.resources.food = 3
    })
    let response = wmOk(session.takeAction(0, space))
    response = wmAction(session, response, 'actions.collect.name')
    expect(response.state.players[0]!.resources.food).toBe(space === 'day-laborer' ? 3 : 1)
    expect(response.state.actionSpaces.find(s => s.id === 'fishing')!.resources.food).toBe(2)
  })
  it('Fish Hook can be declined and the printed round-four neighbour must first be revealed', () => {
    const session = wmSession([80], state => {
      state.roundActionOrder[3] = 'vegetable-seeds'
      state.actionSpaces.find(s => s.id === 'fishing')!.resources.food = 2
    })
    expect(getClassicAdjacentSpaceIds(session.state, 'fishing')).not.toContain('vegetable-seeds')
    const response = wmChoose(session, wmOk(session.takeAction(0, 'reed-bank')), '__skip__')
    expect(response.state.players[0]!.resources.food).toBe(0)
    expect(response.state.actionSpaces.find(s => s.id === 'fishing')!.resources.food).toBe(2)
  })
  it('Fish Hook collects the actual fishing food through an adjacent space without draining other goods', () => {
    const session = wmSession([80], (state) => {
      state.actionSpaces.find((s) => s.id === 'fishing')!.resources.food = 3
    })
    const response = wmAction(session, wmOk(session.takeAction(0, 'day-laborer')), 'actions.collect.name')
    expect(response.state.players[0]!.resources.food).toBe(3)
    expect(response.state.actionSpaces.find((s) => s.id === 'fishing')!.resources.food).toBe(2)
    wmEvent(response, 80)
    const empty = wmSession([80], (state) => {
      state.actionSpaces.find((s) => s.id === 'fishing')!.resources.food = 0
    })
    expect(wmOk(empty.takeAction(0, 'day-laborer')).state.players[0]!.resources.food).toBe(2)
  })
  it('Free Range Chickens requires a planted grain field, grows at round start and scores retained food', () => {
    const session = wmSession([83], (state) => {
      state.players[0]!.fields = [{ row: 0, col: 1, stacks: [{ kind: 'grain', remaining: 3 }] }]
      state.players[0]!.cardStates[id(83)] = { counters: { food: 5 } }
    })
    let response = wmConfirmations(session, wmEndRound(session, 1))
    expect(response.state.players[0]!.cardStates[id(83)]!.counters!.food).toBe(6)
    expect(wmBonus(response, 83)).toBe(2)
    response = anytime(session, 83)
    const four = sessionOptions(response).find(
      (option) =>
        option.effectPreview?.kind === 'resourceMovement' &&
        option.effectPreview.resources.food === 4,
    )!
    response = wmChoose(session, response, four.value)
    expect(wmBonus(response, 83)).toBe(0)
    const empty = wmSession([83])
    expect(wmEndRound(empty, 1).state.players[0]!.cardStates[id(83)]?.counters?.food ?? 0).toBe(0)
  })
  it('Farm School Graduate must be the first occupation and bars Lessons after it is played', () => {
    const session = wmSession([20], undefined, false)
    let response = wmPayment(session, playOccupation(session, id(20)))
    expect(response.state.players[0]!.occupationPlayed).toContain(id(20))
    session.state.players[0]!.occupationHand = [id(3)]
    session.loadState(session.state)
    expect(session.takeAction(0, 'lessons-4').ok).toBe(false)
    response = wmConfirmations(session, wmEndRound(session, 4))
    response = wmAction(session, response, 'actions.lessons.name')
    expect(response.state.players[0]!.occupationPlayed).toContain(id(3))
    expect(response.state.players[0]!.resources.food).toBe(34)
    const late = wmSession(
      [20],
      (state) => {
        state.players[0]!.occupationPlayed = [id(3)]
        state.players[0]!.resources.food = 3
      },
      false,
    )
    expect(playOccupation(late, id(20)).state.players[0]!.occupationHand).toContain(id(20))
  })
  const godfather = (occupied: boolean) =>
    wmSession([25], (state) => {
      state.round = 6
      reveal(state, 5, 'wish-children')
      reveal(state, 6, 'western-quarry')
      state.actionSpaces.find((s) => s.id === 'western-quarry')!.resources.stone = 1
      if (occupied) {
        const other = state.players[1]!
        state.actionSpaces.find((s) => s.id === 'wish-children')!.takenBy.push({ playerId: other.id, workerId: other.workers[0]!.id })
      }
    })
  it('Godfather grants grain before using a printed neighbour of an occupied Wish for Children', () => {
    const session = godfather(true)
    expect(getClassicAdjacentSpaceIds(session.state, 'wish-children')).toContain('western-quarry')
    const response = wmOk(session.takeAction(0, 'western-quarry'))
    expect(response.state.players[0]!.resources).toMatchObject({ grain: 1, stone: 1 })
    wmEvent(response, 25)
  })
  it('Godfather gives nothing when Wish for Children is empty or the space is not adjacent', () => {
    const empty = godfather(false)
    expect(wmOk(empty.takeAction(0, 'western-quarry')).state.players[0]!.resources).toMatchObject({ grain: 0, stone: 1 })
    const far = godfather(true)
    expect(getClassicAdjacentSpaceIds(far.state, 'wish-children')).not.toContain('forest')
    expect(wmOk(far.takeAction(0, 'forest')).state.players[0]!.resources.grain).toBe(0)
  })
  it('Bonfire places its wood on one unused farmyard space when played', () => {
    const session = wmSession([64], (state) => sheepPasture(state, 2), false)
    wmPayment(session, playMinor(session, id(64)))
    expect(session.commitSelectionChoice(0, { positions: ['0-1'] }).ok).toBe(false)
    const response = wmOk(session.commitSelectionChoice(0, { positions: ['2-3'] }))
    expect(response.state.players[0]!.farmyardSpaceStates).toEqual([
      expect.objectContaining({ spaceKey: '2-3', sourceCardId: id(64), resources: { wood: 1 }, blocksPlacement: true }),
    ])
  })
  it('Bonfire offers cooking only after its wood is returned, and only for that round', () => {
    const session = wmSession([64], (state) => {
      sheepPasture(state, 2)
      state.players[0]!.resources.cattle = 1
      state.players[0]!.houseAnimals = { '1-0': 'cattle' }
      state.players[0]!.farmyardSpaceStates = [{
        spaceKey: '2-3', sourceCardId: id(64), kind: 'blocked-farmyard-space', resources: { wood: 1 }, blocksPlacement: true,
      }]
    })
    expect(session.getState().interaction.anytimeActions.map((a) => a.id)).not.toContain('exchange')
    let response = anytime(session, 64)
    expect(response.state.players[0]!.farmyardSpaceStates ?? []).toEqual([])
    expect(response.interaction.anytimeActions.map((a) => a.sourceCard)).not.toContain(id(64))
    response = wmOk(session.takeAnytimeAction(0, 'exchange'))
    expect(sessionOptions(response).find((o) => o.sourceCard === id(64))?.effectPreview)
      .toMatchObject({ kind: 'resourceExchange', resourcesPaid: { sheep: 2 }, resourcesGained: { food: 2 } })
    expect(sessionOptions(response).find((o) => o.sourceCard === id(64) && o.value !== 'trade:0:2')?.effectPreview)
      .toMatchObject({ kind: 'resourceExchange', resourcesPaid: { cattle: 1 }, resourcesGained: { food: 3 } })
    response = wmChoose(session, response, 'trade:0:2')
    expect(response.state.players[0]!.resources).toMatchObject({ sheep: 0, cattle: 1, food: 2 })
    wmEvent(response, 64)
    response = wmConfirmations(session, wmEndRound(session, 1))
    expect([response.state.round, response.interaction.stateId]).toEqual([2, 'idle'])
    expect(response.interaction.anytimeActions.map((a) => a.id)).not.toContain('exchange')
  })
  it('Tapestry Weaver marks one room per harvest with at least three sheep and scores each marked room', () => {
    const session = wmSession([50], (state) => sheepPasture(state, 3))
    let response = wmEndRound(session, 4)
    expect(response.interaction.sourceCard).toBe(id(50))
    response = chooseOffered(session, response)
    expect(response.interaction.stateId === 'wait' && response.interaction.request.kind === 'selection'
      ? response.interaction.request.selection : undefined).toMatchObject({ maxSelections: 1, selectablePositions: [{ row: 2, col: 0 }, { row: 1, col: 0 }] })
    response = wmOk(session.commitSelectionChoice(0, { positions: ['2-0'] }))
    expect(wmBonus(response, 50)).toBe(1)
    expect(response.state.players[0]!.resources.food).toBe(40 - 4)
    expect(markers(session, 50)).toEqual([{ row: 2, col: 0, kind: 'food' }])
    const few = wmSession([50], (state) => sheepPasture(state, 2))
    response = wmConfirmations(few, wmEndRound(few, 4))
    expect(response.interaction.stateId === 'wait' ? response.interaction.sourceCard : undefined).not.toBe(id(50))
    expect(wmBonus(response, 50)).toBe(0)
  })
  const cookies = () => wmSession([71], (state) => {
    state.players[0]!.improvements = ['Major_ClayOven']
    Object.assign(state.players[0]!.resources, { grain: 2, food: 3 })
    state.roundActionOrder[0] = 'grain-utilization'
  })
  it('Cookies pays one food per baked grain onto an unmarked room for a bonus point', () => {
    const session = cookies()
    let response = chooseOffered(session, wmOk(session.takeAction(0, 'grain-utilization')))
    expect(response.state.players[0]!.resources).toMatchObject({ grain: 1, food: 8 })
    expect(response.interaction.stateId === 'wait' && response.interaction.request.kind === 'selection'
      ? response.interaction.request.selection : undefined).toMatchObject({ maxSelections: 1 })
    response = wmOk(session.commitSelectionChoice(0, { positions: ['1-0'] }))
    expect(response.state.players[0]!.resources.food).toBe(7)
    expect(wmBonus(response, 71)).toBe(1)
    expect(markers(session, 71)).toEqual([{ row: 1, col: 0, kind: 'food' }])
  })
  it('Cookies can be declined and then keeps the food and scores nothing', () => {
    const session = cookies()
    const response = wmChoose(session, wmOk(session.takeAction(0, 'grain-utilization')), '__skip__')
    expect(response.state.players[0]!.resources).toMatchObject({ grain: 1, food: 8 })
    expect(wmBonus(response, 71)).toBe(0)
  })
  it('Attic marks only the newly built room and charges its wood', () => {
    const session = wmSession([60], (state) => {
      Object.assign(state.players[0]!.resources, { wood: 7, reed: 2 })
    })
    const entered = wmOk(session.takeAction(0, 'farm-expansion'))
    if (sessionOptions(entered).some((o) => o.labelKey === 'actions.construct.name')) wmAction(session, entered, 'actions.construct.name')
    chooseOffered(session, wmPayment(session, wmOk(session.commitSelectionChoice(0, { rooms: [{ row: 0, col: 0 }] }))))
    expect(session.commitSelectionChoice(0, { positions: ['1-0'] }).ok).toBe(false)
    const response = wmOk(session.commitSelectionChoice(0, { positions: ['0-0'] }))
    expect(response.state.players[0]!.resources.wood).toBe(1)
    expect(wmBonus(response, 60)).toBe(1)
    expect(markers(session, 60)).toEqual([{ row: 0, col: 0, kind: 'wood' }])
  })
})
