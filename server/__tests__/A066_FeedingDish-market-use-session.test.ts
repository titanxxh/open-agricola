import { afterEach, describe, expect, it } from 'vitest'
import { type GameSession, type SessionResponse } from '../game/authoritative-session'
import { createWorkSession } from './_helpers/session-fixtures'
import { markAllWorkersUsed } from '../../shared/domain/player'
import type { GameState } from '../../shared/contract/types'

/**
 * Confirmed PR1144 regressions use public Session commands because replacement,
 * reaction choices and partial collection must preserve the complete host action.
 * New seed-42 work games start in round 8 with fixed placeholder hands, no
 * occupied spaces, real rooms and one sheep in the two-tile pasture at 0-3/0-4.
 * Player 0 owns Feeding Dish, food 20, grain/reed 0. Sheep Market has one sheep;
 * Reed Bank has three reed. The pass case uses two players. Printed D138/A137
 * restrictions require three players for those cases. Other players have no cards.
 * Resolve actual reaction/replacement choices and confirm animal placement;
 * assert resources, source events, pending completion, logs and literal scores.
 * Accepted timing: automatic grain at actual market use, before collect choices.
 * Lasso covers both orders of two real placements. Minstrel uses the sole empty
 * stage-one market in a four-player return-home phase without a new worker.
 * Straw Hat moves an existing Farmland worker to the market in round 6; inspect
 * the resulting animal-reorg boundary before unrelated harvest processing.
 */
const DISH = 'A066_FeedingDish'
const PET_LOVER = 'D138_PetLover'
const RIVERINE = 'A137_RiverineShepherd'
const LASSO = 'B024_Lasso'
const MINSTREL = 'A151_Minstrel'
const STRAW_HAT = 'E010_StrawHat'
const sessions: GameSession[] = []
afterEach(() => sessions.splice(0).forEach(session => session.dispose()))

function setup(cards: string[], playerCount = 2, configure?: (state: GameState) => void) {
  const session = createWorkSession({
    seed: 42,
    options: { playerCount },
    configure(state) {
      state.round = 8
      for (const player of state.players) {
        player.minorPlayed = []
        player.occupationPlayed = []
        player.cardStates = {}
        Object.assign(player.resources, { food: 20, grain: 0, reed: 0, sheep: 0, boar: 0, cattle: 0 })
      }
      const player = state.players[0]!
      player.minorPlayed = [DISH, ...cards.filter(card => card !== PET_LOVER && card !== RIVERINE)]
      player.occupationPlayed = cards.filter(card => card === PET_LOVER || card === RIVERINE)
      player.resources.sheep = 1
      player.pastures = [{
        id: 'existing-sheep-pasture', tiles: [{ row: 0, col: 3 }, { row: 0, col: 4 }],
        animalType: 'sheep', animalCount: 1,
      }]
      for (const space of state.actionSpaces) space.takenBy = []
      state.actionSpaces.find(space => space.id === 'sheep-market')!.resources.sheep = 1
      state.actionSpaces.find(space => space.id === 'reed-bank')!.resources.reed = 3
      state.actionSpaces.find(space => space.id === 'forest')!.resources.wood = 3
      configure?.(state)
    },
  })
  sessions.push(session)
  expect(session.getState().interaction.stateId).toBe('idle')
  return session
}

function finish(session: GameSession, initial: SessionResponse, preferredCard?: string, passReactions = false, targetSpace?: string) {
  let response = initial
  let preferredChosen = false
  let passed = false
  for (let step = 0; step < 16; step++) {
    expect(response.ok, response.error).toBe(true)
    if (response.interaction.stateId !== 'wait') break
    const { request, playerIndex } = response.interaction
    if (request.kind === 'confirm-next-player') break
    if (request.kind === 'animal-reorg') {
      expect(request.zones.some(zone => zone.id === 'existing-sheep-pasture')).toBe(true)
      response = session.resolveChoice(playerIndex, 'confirm', {
        zones: [{ id: 'existing-sheep-pasture', zoneType: 'pasture', animalType: 'sheep', animalCount: 2 }],
      })
      continue
    }
    if (request.kind !== 'choice' && request.kind !== 'select-trigger') {
      throw new Error(`Unexpected interaction: ${request.kind}`)
    }
    const available = request.options.filter(option => !('disabled' in option && option.disabled === true))
    const pass = available.find(option => option.value === '__pass__')
    const preferred = available.find(option => option.sourceCard === preferredCard
      && option.value !== '__skip__' && option.value !== '__pass__')
    const skip = available.find(option => option.value === '__skip__')
    const target = available.find(option => option.value === targetSpace)
    const required = request.kind === 'select-trigger' ? available.find(option => option.sourceCard && option.value !== '__pass__') : undefined
    const choice = target ?? (passReactions ? pass : undefined) ?? preferred ?? skip ?? pass ?? required
    if (!choice) throw new Error(`No expected option: ${JSON.stringify(request)}`)
    if (choice === preferred) preferredChosen = true
    if (choice === pass) passed = true
    response = session.resolveChoice(playerIndex, choice.value)
  }
  expect(response.ok, response.error).toBe(true)
  if (response.interaction.stateId === 'wait') {
    expect(response.interaction.request.kind).toBe('confirm-next-player')
  }
  return { response, preferredChosen, passed }
}

function assertSheepAndLog(response: SessionResponse) {
  expect(response.state.players[0]!.pastures[0]).toMatchObject({ animalType: 'sheep', animalCount: 2 })
  expect(response.scores?.[0]?.categories.find(category => category.key === 'sheeps'))
    .toMatchObject({ quantity: 2, total: 1 })
  expect(response.state.log.some(entry => entry.key === 'log.reorganizeFail')).toBe(false)
  expect(response.state.players[1]!.resources.grain).toBe(0)
}

function dishGrainEvents(response: SessionResponse) {
  return response.state.events.filter(event => event.type === 'resource.moved'
    && event.sourceCardId === DISH && event.resources.grain === 1)
}

describe('A066 Feeding Dish rewards actual animal-market use', () => {
  it('passing A017/B034 reactions cannot discard the qualified Feeding Dish grain', () => {
    const session = setup(['A017_ReclamationPlow', 'B034_SpecialFood'])
    const initial = session.takeAction(0, 'sheep-market')
    expect(initial.ok, initial.error).toBe(true)
    const { response, passed } = finish(session, initial, undefined, true)
    expect(passed).toBe(true)
    assertSheepAndLog(response)
    expect.soft(response.state.players[0]!.resources).toMatchObject({ sheep: 2, grain: 1 })
    expect.soft(dishGrainEvents(response)).toHaveLength(1)
    expect(response.state.actionSpaces.find(space => space.id === 'sheep-market')!.resources.sheep).toBe(0)
  })

  it('Pet Lover replacing collection still grants one Dish grain for using the market', () => {
    const session = setup([PET_LOVER], 3)
    const initial = session.takeAction(0, 'sheep-market')
    expect(initial.ok, initial.error).toBe(true)
    const { response, preferredChosen } = finish(session, initial, PET_LOVER)
    expect(preferredChosen).toBe(true)
    assertSheepAndLog(response)
    expect.soft(response.state.players[0]!.resources).toMatchObject({ sheep: 2, food: 23, grain: 2 })
    expect.soft(dishGrainEvents(response)).toHaveLength(1)
    expect(response.state.events.filter(event => event.type === 'resource.moved'
      && event.sourceCardId === PET_LOVER && event.resources.sheep === 1
      && event.resources.food === 3 && event.resources.grain === 1)).toHaveLength(1)
    expect(response.state.actionSpaces.find(space => space.id === 'sheep-market')!.resources.sheep).toBe(1)
  })

  it('Riverine Shepherd taking extra reed after Sheep Market grants no second Dish grain', () => {
    const session = setup([RIVERINE], 3)
    const initial = session.takeAction(0, 'sheep-market')
    expect(initial.ok, initial.error).toBe(true)
    const { response, preferredChosen } = finish(session, initial, RIVERINE)
    expect(preferredChosen).toBe(true)
    assertSheepAndLog(response)
    expect.soft(response.state.players[0]!.resources).toMatchObject({ sheep: 2, reed: 1, grain: 1 })
    expect.soft(dishGrainEvents(response)).toHaveLength(1)
    expect(response.state.events.filter(event => event.type === 'resource.moved'
      && event.sourceCardId === RIVERINE && event.from.kind === 'actionSpace'
      && event.from.spaceId === 'reed-bank' && event.resources.reed === 1)).toHaveLength(1)
    expect(response.state.actionSpaces.find(space => space.id === 'sheep-market')!.resources.sheep).toBe(0)
    expect(response.state.actionSpaces.find(space => space.id === 'reed-bank')!.resources.reed).toBe(2)
  })

  it('Riverine Shepherd taking sheep while using Reed Bank does not use Sheep Market', () => {
    const session = setup([RIVERINE], 3)
    const initial = session.takeAction(0, 'reed-bank')
    expect(initial.ok, initial.error).toBe(true)
    const { response, preferredChosen } = finish(session, initial, RIVERINE)
    expect(preferredChosen).toBe(true)
    assertSheepAndLog(response)
    expect(response.state.players[0]!.resources).toMatchObject({ sheep: 2, reed: 3, grain: 0 })
    expect(dishGrainEvents(response)).toEqual([])
    expect(response.state.events.filter(event => event.type === 'resource.moved'
      && event.sourceCardId === RIVERINE && event.from.kind === 'actionSpace'
      && event.from.spaceId === 'sheep-market' && event.resources.sheep === 1)).toHaveLength(1)
    expect(response.state.actionSpaces.find(space => space.id === 'sheep-market')!.resources.sheep).toBe(0)
    expect(response.state.actionSpaces.find(space => space.id === 'reed-bank')!.resources.reed).toBe(0)
  })

  it.each([
    { first: 'sheep-market', second: 'forest' },
    { first: 'forest', second: 'sheep-market' },
  ])('Lasso uses $first then $second and grants grain only for the actual market', ({ first, second }) => {
    const session = setup([LASSO])
    const initial = session.takeAction(0, first)
    expect(initial.ok, initial.error).toBe(true)
    expect(initial.state.players[0]!.resources.grain).toBe(first === 'sheep-market' ? 1 : 0)
    const { response, preferredChosen } = finish(session, initial, LASSO, false, second)
    expect(preferredChosen).toBe(true)
    assertSheepAndLog(response)
    expect(response.state.players[0]!.resources).toMatchObject({ sheep: 2, wood: 3, grain: 1 })
    expect(dishGrainEvents(response)).toHaveLength(1)
    const placements = response.state.actionSpaces.flatMap(space => space.takenBy
      .filter(worker => worker.playerId === 'p1').map(worker => ({ spaceId: space.id, workerId: worker.workerId })))
    expect(placements.map(placement => placement.spaceId).sort()).toEqual(['forest', 'sheep-market'])
    expect(new Set(placements.map(placement => placement.workerId)).size).toBe(2)
    expect(response.state.events.filter(event => event.type === 'worker.placed'
      && event.viaCardId === LASSO && event.spaceId === second)).toHaveLength(1)
  })

  it('Minstrel uses the fixed empty market without a worker and grants one Dish grain', () => {
    const session = setup([], 4, state => {
      state.round = 5
      state.players[0]!.occupationPlayed = [MINSTREL]
      const stageOne = ['sheep-market', 'grain-utilization', 'fencing', 'major-improvement']
      state.roundActionOrder = [...stageOne, ...state.roundActionOrder.filter(space => !stageOne.includes(space ?? ''))]
      state.players.forEach(player => markAllWorkersUsed(state, player))
      const sink = state.actionSpaces.find(space => space.id === '__test-worker-sink__')!
      for (const spaceId of stageOne.slice(1)) {
        state.actionSpaces.find(space => space.id === spaceId)!.takenBy = [sink.takenBy.shift()!]
      }
    })
    const workers = structuredClone(session.getState().state.players[0]!.workers)
    const initial = session.performRoundEnd()
    expect(initial.ok, initial.error).toBe(true)
    if (initial.interaction.stateId !== 'wait') throw new Error('Expected Minstrel choice')
    expect(initial.interaction.sourceCard).toBe(MINSTREL)
    const { response, preferredChosen } = finish(session, initial, MINSTREL)
    expect(preferredChosen).toBe(true)
    assertSheepAndLog(response)
    expect(response.state.players[0]!.resources).toMatchObject({ sheep: 2, grain: 1 })
    expect(dishGrainEvents(response)).toHaveLength(1)
    expect(response.state.players[0]!.workers).toEqual(workers)
    expect(response.state.events.some(event => event.type === 'worker.placed' && event.viaCardId === MINSTREL)).toBe(false)
  })

  it('Straw Hat moving the Farmland worker to the market grants grain before animal placement', () => {
    const session = setup([STRAW_HAT], 2, state => {
      state.round = 6
      const player = state.players[0]!
      state.actionSpaces.find(space => space.id === 'farmland')!.takenBy = [{ playerId: player.id, workerId: player.workers[0]!.id }]
      state.players.forEach(candidate => markAllWorkersUsed(state, candidate))
    })
    const worker = session.getState().state.actionSpaces.find(space => space.id === 'farmland')!.takenBy[0]!
    const offered = session.performRoundEnd()
    expect(offered.ok, offered.error).toBe(true)
    if (offered.interaction.stateId !== 'wait' || offered.interaction.request.kind !== 'choice') throw new Error('Expected Straw Hat choice')
    const move = offered.interaction.request.options.find(option => option.labelKey === 'actions.move-farmer-to-space.name')!
    const target = session.resolveChoice(0, move.value)
    expect(target.ok, target.error).toBe(true)
    if (target.interaction.stateId !== 'wait' || target.interaction.request.kind !== 'choice') throw new Error('Expected move target')
    expect(target.interaction.request.options.some(option => option.value === 'sheep-market' && !('disabled' in option && option.disabled === true))).toBe(true)
    const response = session.resolveChoice(0, 'sheep-market')
    expect(response.ok, response.error).toBe(true)
    expect(response.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'animal-reorg' } })
    expect(response.state.players[0]!.resources).toMatchObject({ sheep: 2, grain: 1 })
    expect(response.state.actionSpaces.find(space => space.id === 'farmland')!.takenBy).toEqual([])
    expect(response.state.actionSpaces.find(space => space.id === 'sheep-market')!.takenBy).toEqual([worker])
    expect(response.scores?.[0]?.categories.find(category => category.key === 'sheeps')).toMatchObject({ quantity: 2, total: 1 })
    expect(response.state.log.some(entry => entry.key === 'log.reorganizeFail')).toBe(false)
  })
})
