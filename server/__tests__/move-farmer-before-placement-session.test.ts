import { afterEach, describe, expect, it } from 'vitest'
import type { GameSession, SessionResponse } from '../game/authoritative-session'
import { createWorkSession } from './_helpers/session-fixtures'
import { markAllWorkersUsed, setWorkersAtHome } from '../../shared/domain/player'
import { createPlayerActionSpaces } from '../../shared/cards/player-action-space'

const ARCHWAY = 'D051_Archway'
const STRAW_HAT = 'E010_StrawHat'
const COMB = 'E059_CombandCutter'
const BUCKET = 'D016_WoodenWheyBucket'
const MOVERS: Array<typeof ARCHWAY | typeof STRAW_HAT> = [ARCHWAY, STRAW_HAT]
const sessions: GameSession[] = []
afterEach(() => sessions.splice(0).forEach(session => session.dispose()))

// Approved generic adapter seam: real 2p work Sessions because movement can
// pause in another card's before-placement payment, then resume the target.
function setup({ mover, bonus = COMB, actor = 0 }: {
  mover?: typeof ARCHWAY | typeof STRAW_HAT
  bonus?: typeof COMB | typeof BUCKET
  actor?: number
} = {}) {
  let workerId = ''
  const session = createWorkSession({ seed: 42, options: { playerCount: 2 }, configure(state) {
    state.round = mover === STRAW_HAT ? 3 : 1
    state.currentPlayerIndex = actor
    for (const player of state.players) {
      setWorkersAtHome(state, player, 2)
      player.minorHand = ['__test_placeholder__']
      player.occupationHand = ['__test_placeholder__']
      player.minorPlayed = []
      player.occupationPlayed = []
      Object.assign(player.resources, { food: 20, wood: 0, sheep: 0, boar: 0, cattle: 0, grain: 0, vegetable: 0 })
    }
    const owner = state.players[actor]!
    owner.minorPlayed = [bonus, ...(mover ? [mover] : [])]
    owner.resources.food = 8
    owner.resources.wood = 2
    const sheep = state.actionSpaces.find(space => space.id === 'sheep-market')
    if (!sheep) throw new Error('Missing Sheep Market')
    sheep.resources.sheep = bonus === BUCKET ? 1 : 3
    const worker = owner.workers.find(entry => entry.isActive)
    if (!worker) throw new Error('Missing owner worker')
    workerId = worker.id
    if (mover) {
      if (mover === ARCHWAY) state.actionSpaces.push(...createPlayerActionSpaces(state))
      const source = state.actionSpaces.find(space => space.id === (mover === ARCHWAY ? ARCHWAY : 'farmland'))
      if (!source) throw new Error('Missing move source')
      source.takenBy = [{ playerId: owner.id, workerId }]
      state.players.forEach(player => markAllWorkersUsed(state, player))
    }
  } })
  sessions.push(session)
  return { session, workerId }
}

function startMove(session: GameSession, mover: typeof ARCHWAY | typeof STRAW_HAT, actor = 0) {
  let response = session.performRoundEnd()
  expect(response.ok, response.error).toBe(true)
  if (response.interaction.stateId === 'wait' && response.interaction.request.kind === 'select-trigger') {
    response = session.resolveChoice(actor, mover)
    expect(response.ok, response.error).toBe(true)
  }
  if (response.interaction.stateId !== 'wait' || response.interaction.request.kind !== 'choice') {
    throw new Error('Expected return-home move decision')
  }
  const accept = response.interaction.request.options.find(option => mover === STRAW_HAT
    ? option.labelKey === 'actions.move-farmer-to-space.name'
    : option.value !== '__skip__')
  if (!accept) throw new Error('Missing move decision')
  response = session.resolveChoice(actor, accept.value)
  expect(response.ok, response.error).toBe(true)
  expect(response.interaction).toMatchObject({ stateId: 'wait', playerIndex: actor,
    promptKey: 'ui.interactionMoveFarmerToSpace' })
  return response
}

function rewardEvents(response: SessionResponse) {
  return response.state.events.filter(event => event.type === 'resource.moved'
    && event.sourceCardId === COMB && event.resources.food === 3)
}

describe('moving a farmer runs target before-placement flows', () => {
  it('ordinary Day Laborer gives the three-food before reward and two-food base gain', () => {
    const { session, workerId } = setup()
    const response = session.takeAction(0, 'day-laborer')
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.food).toBe(13)
    expect(response.state.actionSpaces.find(space => space.id === 'day-laborer')?.takenBy)
      .toEqual([{ playerId: response.state.players[0]!.id, workerId }])
    expect(rewardEvents(response)).toHaveLength(1)
  })

  it.each(MOVERS)('%s gives the same before reward once for its actual Day Laborer move', mover => {
    const { session, workerId } = setup({ mover })
    startMove(session, mover)
    const response = session.resolveChoice(0, 'day-laborer')
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.food).toBe(13)
    expect(rewardEvents(response)).toHaveLength(1)
    expect(response.state.events.filter(event => event.type === 'worker.placed'
      && event.spaceId === 'day-laborer' && event.workerId === workerId && event.viaCardId === mover)).toHaveLength(1)
    expect(response.state.events.some(event => event.type === 'resource.moved'
      && event.sourceActionId === 'gain' && event.sourceCardId === mover && event.resources.food === 2)).toBe(true)
    const baseGain = response.state.events.find(event => event.type === 'resource.moved'
      && event.sourceActionId === 'gain' && event.sourceCardId === mover && event.resources.food === 2)
    expect(rewardEvents(response)[0]!.seq).toBeLessThan(baseGain!.seq)
  })

  it('keeps the mover owner through an optional before-market stable and resumes collection', () => {
    const { session, workerId } = setup({ mover: ARCHWAY, bonus: BUCKET, actor: 1 })
    startMove(session, ARCHWAY, 1)
    let response = session.resolveChoice(1, 'sheep-market')
    expect(response.ok, response.error).toBe(true)
    expect(response.interaction).toMatchObject({ stateId: 'wait', playerIndex: 1, request: { kind: 'choice' } })
    expect(response.state.players[1]!.resources).toMatchObject({ wood: 2, sheep: 0, food: 8 })
    expect(response.state.actionSpaces.find(space => space.id === 'sheep-market')?.resources.sheep).toBe(1)
    expect(response.state.actionSpaces.find(space => space.id === 'sheep-market')?.takenBy)
      .toEqual([{ playerId: response.state.players[1]!.id, workerId }])
    const before = JSON.stringify(response.state)
    const foreign = session.resolveChoice(0, '__skip__')
    expect(foreign.ok).toBe(false)
    expect(JSON.stringify(foreign.state)).toBe(before)
    if (response.interaction.stateId !== 'wait' || response.interaction.request.kind !== 'choice') {
      throw new Error('Expected optional stable choice')
    }
    const accept = response.interaction.request.options.find(option => option.value !== '__skip__')
    if (!accept) throw new Error('Missing stable accept option')
    response = session.resolveChoice(1, accept.value)
    expect(response.ok, response.error).toBe(true)
    expect(response.interaction).toMatchObject({ stateId: 'wait', playerIndex: 1, request: { kind: 'farm-select' } })
    response = session.commitSelectionChoice(1, { stables: [{ row: 0, col: 1 }] })
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[1]!.resources).toMatchObject({ wood: 1, sheep: 1, food: 8 })
    expect(response.state.players[1]!.stableTiles).toEqual([{ row: 0, col: 1 }])
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 0, sheep: 0, food: 20 })
    expect(response.state.events.filter(event => event.type === 'farm.stableBuilt'
      && event.sourceCardId === BUCKET)).toHaveLength(1)
    if (response.interaction.stateId === 'wait' && response.interaction.request.kind === 'animal-reorg') {
      response = session.resolveChoice(1, 'confirm', { zones: [
        { id: 'stable:0-1', zoneType: 'stable', animalType: 'sheep', animalCount: 1 },
      ] })
      expect(response.ok, response.error).toBe(true)
    }
    expect(response.state.players[1]!.resources).toMatchObject({ wood: 1, sheep: 1, food: 8 })
    expect(response.interaction.stateId).toBe('idle')
    expect(response.state.log).toContainEqual(expect.objectContaining({
      key: 'log.actionDetail', playerId: response.state.players[1]!.id,
      params: expect.objectContaining({ detailParts: expect.objectContaining({
        costs: { wood: 1 }, effects: { buildStables: 1 },
      }) }),
    }))
    const score = response.scores?.[1]
    if (!score) throw new Error('Expected mover owner score')
    expect(score.categories.find(category => category.key === 'sheeps'))
      .toMatchObject({ quantity: 1, total: 1 })
  })
})
