import { afterEach, describe, expect, it } from 'vitest'
import type { GameSession, SessionResponse } from '../game/authoritative-session'
import { createWorkSession } from './_helpers/session-fixtures'
import { requireActiveCardRegistry } from '../../shared/cards/active-registry'
import { getCardEffect } from '../../shared/cards/card-effects'
import { setActiveWorkerCount, setWorkersAtHome, workersAvailable } from '../../shared/domain/player'
import { cloneState } from '../../shared/session/state-bootstrap'

const CANAL_BOATMAN = 'D103_CanalBoatman'
const PREVIEW_CARD = 'TEST_CloneWorkerBeforeHarvest'
const PSEUDO_SPACE = `card-worker:${CANAL_BOATMAN}`
const sessions: GameSession[] = []
afterEach(() => sessions.splice(0).forEach(session => session.dispose()))

function spendCanalWorker(workerCount: number): GameSession {
  const session = createWorkSession({ configure(state) {
    state.round = 4
    const player = state.players[0]!
    player.occupationPlayed = [CANAL_BOATMAN, PREVIEW_CARD]
    Object.assign(player.resources, { food: 20, wood: 0, stone: 0 })
    state.players[1]!.resources.food = 20
    setActiveWorkerCount(player, workerCount)
    setWorkersAtHome(state, player, workerCount)
    state.actionSpaces.find(space => space.id === 'fishing')!.resources.food = 2
    state.actionSpaces.find(space => space.id === 'forest')!.resources.wood = 3
  } })
  sessions.push(session)
  session.withCtx(() => requireActiveCardRegistry('clone stage regression').setEffect({
    id: PREVIEW_CARD,
    onBeforeHarvest: (state, player) => workersAvailable(state, player) === 0 ? {
      type: 'leaf', actionId: 'gain', params: { wood: 1 }, sourceCard: PREVIEW_CARD, optional: true,
    } : undefined,
  }))

  let response = session.takeAction(0, 'fishing')
  expect(response.ok, response.error).toBe(true)
  expect(response.state.players[0]!.resources.food).toBe(22)
  response = accept(session, response)
  if (response.interaction.stateId !== 'wait' || response.interaction.request.kind !== 'choice') {
    throw new Error('Expected the Canal Boatman reward choice')
  }
  response = session.resolveChoice(0, response.interaction.request.options[0]!.value)
  expect(response.ok, response.error).toBe(true)
  expect(response.state.players[0]!.resources).toMatchObject({ food: 21, stone: 3, wood: 0 })
  expect(response.state.actionSpaces.find(space => space.id === PSEUDO_SPACE)?.takenBy)
    .toEqual([{ playerId: 'p1', workerId: '2' }])
  expect(workersAvailable(response.state, response.state.players[0]!)).toBe(workerCount - 2)
  if (response.interaction.stateId === 'wait' && response.interaction.request.kind === 'confirm-next-player') {
    expect(session.resolveChoice(response.interaction.playerIndex, 'confirm').ok).toBe(true)
  }
  return session
}

function accept(session: GameSession, response: SessionResponse): SessionResponse {
  expect(response.interaction.stateId).toBe('wait')
  if (response.interaction.stateId !== 'wait' || response.interaction.request.kind !== 'choice') {
    throw new Error('Expected an optional card choice')
  }
  const option = response.interaction.request.options.find(choice => choice.value !== '__skip__')
  expect(option).toBeDefined()
  if (!option) throw new Error('Expected the card acceptance option')
  return session.resolveChoice(response.interaction.playerIndex, option.value)
}

describe('live state cloning with a spent Canal Boatman worker', () => {
  it.each([2, 3])('keeps the spent worker unavailable when cloning %i active workers', workerCount => {
    const session = spendCanalWorker(workerCount)
    const before = JSON.stringify(session.state)
    expect(() => structuredClone(session.state)).toThrowError(DOMException)

    const cloned = session.withCtx(() => cloneState(session.state))

    expect(workersAvailable(cloned, cloned.players[0]!)).toBe(workerCount - 2)
    expect(cloned.actionSpaces.find(space => space.id === PSEUDO_SPACE)?.takenBy)
      .toEqual([{ playerId: 'p1', workerId: '2' }])
    const placement = session.withCtx(() => getCardEffect('C125_Nightworker')?.onBeforeWork?.(
      cloned, cloned.players[0]!, { actionHooks: session.actionHooks },
    ))
    if (workerCount === 2) expect(placement).toBeUndefined()
    else expect(placement).toMatchObject({ type: 'leaf', actionId: 'place-farmer', optional: true })
    expect(JSON.stringify(session.state)).toBe(before)
  })

  it.each([
    { workerCount: 2, expectedWood: 1, expectedFood: 17 },
    { workerCount: 3, expectedWood: 0, expectedFood: 15 },
  ])('previews and commits the before-harvest reward with $workerCount active workers', ({ workerCount, expectedWood, expectedFood }) => {
    const session = spendCanalWorker(workerCount)
    // Explicit phase seam: ordinary performRoundEnd returns workers home before
    // harvest. Entering this existing self-bound trampoline keeps the real D103
    // state for StageDispatch/Engine preview, without claiming a normal UI exploit.
    let response = session.invokeHarvestFromBeforeHarvest()
    expect(response.ok, response.error).toBe(true)
    if (expectedWood === 1) {
      expect(response.interaction).toMatchObject({ stateId: 'wait', sourceCard: PREVIEW_CARD, request: { kind: 'choice' } })
      response = accept(session, response)
    }

    expect(response.ok, response.error).toBe(true)
    expect(response.interaction.stateId).toBe('idle')
    expect(response.state.players[0]!.resources).toMatchObject({ wood: expectedWood, stone: 3, food: expectedFood })
    expect(response.state.actionSpaces.find(space => space.id === PSEUDO_SPACE)?.takenBy)
      .toEqual([{ playerId: 'p1', workerId: '2' }])
    expect(response.state.events.filter(event => event.type === 'resource.moved'
      && event.from.kind === 'card' && event.from.cardId === PREVIEW_CARD))
      .toHaveLength(expectedWood)
    expect(response.state.log.filter(entry => entry.key === 'log.cardEffectGain' && entry.params?.cardId === PREVIEW_CARD))
      .toEqual(expectedWood === 1 ? [expect.objectContaining({ params: expect.objectContaining({ cardId: PREVIEW_CARD, gain: { wood: 1 } }) })] : [])
  })
})
