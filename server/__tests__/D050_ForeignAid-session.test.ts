import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import type { ActionFlow } from '../../shared/contract/types'
import { setActiveWorkerCount, setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import '../../shared/cards/D/D050_ForeignAid'

const CARD_ID = 'D050_ForeignAid'

const setup = () => {
  const session = new GameSession()
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.players = state.players.slice(0, 2)
  state.round = 14
  state.roundPhase = 'work'
  state.currentPlayerIndex = 0
  state.roundActionOrder[11] = 'forest'
  state.roundActionOrder[12] = 'farmland'
  state.roundActionOrder[13] = 'day-laborer'
  state.players.forEach((player) => {
    player.minorHand = ['__test_placeholder__']
    player.occupationHand = ['__test_placeholder__']
    setActiveWorkerCount(player, 2)
    setWorkersAtHome(state, player, 2)
  })
  state.players[0]!.minorPlayed.push(CARD_ID)
  session.loadState(state)
  return session
}

const startFlow = (session: GameSession, flow: ActionFlow) => {
  const internal = session as unknown as {
    createFlowEngine: (flow: ActionFlow) => unknown
    runEngineSteps: () => void
  }
  const spaceId = '__stage:d050'
  session.state.actionSpaces.push({
    id: spaceId,
    nameKey: 'test',
    descriptionKey: 'test',
    roundAvailable: 1,
    takenBy: [],
    gainPerRound: {},
    resources: {},
    canBeExecutedByPlayer: () => true,
    execute: () => ({ type: 'ok' }),
  } as never)
  session.pushEngineFrame({
    engine: internal.createFlowEngine(flow) as never,
    source: { kind: 'flow', flow },
    spaceId,
    ownerPlayerIndex: 0,
    stageResume: null,
    deferredPlayerSwitch: null,
    reason: 'card-draft',
  })
  internal.runEngineSteps()
}

describe('D050_ForeignAid session', () => {
  it('blocks the owner at direct entry while leaving other players and spaces unaffected', () => {
    const blocked = setup()
    const workersBefore = structuredClone(blocked.state.players[0]!.workers)
    const denied = blocked.takeAction(0, 'forest')

    expect(denied.ok).toBe(false)
    expect(denied.state.actionSpaces.find((space) => space.id === 'forest')?.takenBy).toEqual([])
    expect(denied.state.players[0]!.workers).toEqual(workersBefore)

    const allowed = setup()
    expect(allowed.takeAction(0, 'clay-pit').ok).toBe(true)

    const other = setup()
    other.state.currentPlayerIndex = 1
    expect(other.takeAction(1, 'forest').ok).toBe(true)
  })

  it('excludes blocked pending choices and revalidates a newly blocked choice', () => {
    const session = setup()
    startFlow(session, { type: 'leaf', actionId: 'place-farmer', sourceCard: CARD_ID })
    const pending = session.getState()

    expect(pending.interaction.stateId).toBe('wait')
    if (pending.interaction.stateId !== 'wait' || pending.interaction.request.kind !== 'choice') return
    expect(pending.interaction.request.options.some((option) => option.value === 'forest')).toBe(false)
    const newlyBlocked = pending.interaction.request.options.find((option) => option.value === 'clay-pit')
    expect(newlyBlocked).toBeDefined()

    session.state.roundActionOrder[11] = newlyBlocked!.value
    const denied = session.resolveChoice(0, newlyBlocked!.value)
    expect(denied.ok).toBe(false)
    expect(denied.state.actionSpaces.find((space) => space.id === newlyBlocked!.value)?.takenBy).toEqual([])
  })
})
