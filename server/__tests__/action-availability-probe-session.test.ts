import { describe, expect, it, vi } from 'vitest'
import type { ActionDefinition, ActionFlow } from '../../shared/contract/types'
import { requireActiveCardRegistry } from '../../shared/cards/active-registry'
import { deriveCanBeExecutedByFlow, initializeFlowDerivedCanBeExecutedByPlayer } from '../../shared/actions/flow'
import type { ActionRegistry } from '../../shared/engine/registry'
import { serializeSessionSnapshot } from '../../shared/session/serialization'
import { GameSession } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

// Session coverage: query the real placement boundary in a fresh two-player game,
// then verify admission still honors strict gates and the full hook/flow result.
const setup = (kind: 'derived' | 'composite' | 'leaf', available = true) => {
  const session = new GameSession(941, undefined, { playerCount: 2 })
  stabilizeRandomHands(session.state.players)
  session.state.currentPlayerIndex = 0
  const registry = (session as unknown as { registry: ActionRegistry }).registry
  const leafProbe = vi.fn(() => available)
  const baseProbe = vi.fn(() => kind === 'leaf' && available)
  registry.register({
    ...registry.get('gain')!,
    id: '__availability_probe__',
    canBeExecutedByPlayer: leafProbe,
  })
  const flow: ActionFlow = { type: 'leaf', actionId: '__availability_probe__', params: { food: 1 } }
  const action: ActionDefinition = {
    ...registry.get('forest')!,
    strictCanExecute: false,
    flow: kind === 'leaf' ? undefined : flow,
    canBeExecutedByPlayer: kind === 'derived' ? deriveCanBeExecutedByFlow() : baseProbe,
  }
  initializeFlowDerivedCanBeExecutedByPlayer(action, id => registry.get(id))
  registry.register(action)
  const space = session.state.actionSpaces.find(entry => entry.id === 'forest')!
  Object.assign(space, action, { takenBy: [] })
  return { session, space, leafProbe, baseProbe }
}

describe('Session action availability probes', () => {
  it.each([false, true])('evaluates a derived flow once per availability query, available=%s', (available) => {
    const { session, leafProbe } = setup('derived', available)
    const before = serializeSessionSnapshot(session.state, session)

    expect(session.getActionAvailability(0).forest).toBe(available)
    expect(leafProbe).toHaveBeenCalledOnce()
    leafProbe.mockClear()
    expect(session.getAvailableActions(0).some(action => action.spaceId === 'forest')).toBe(available)
    expect(leafProbe).toHaveBeenCalledOnce()
    expect(serializeSessionSnapshot(session.state, session)).toEqual(before)

    if (!available) {
      const rejected = session.takeAction(0, 'forest')
      expect(rejected.ok).toBe(false)
      expect(rejected.state.actionSpaces.find(entry => entry.id === 'forest')!.takenBy).toEqual([])
      expect(serializeSessionSnapshot(session.state, session)).toEqual(before)
    }
  })

  it.each([false, true])('evaluates a non-composite predicate once, available=%s', (available) => {
    const { session, baseProbe } = setup('leaf', available)
    expect(session.getActionAvailability(0).forest).toBe(available)
    expect(baseProbe).toHaveBeenCalledOnce()
  })

  it('uses the full composite query when a non-strict base predicate is false', () => {
    const { session, baseProbe, leafProbe } = setup('composite')
    expect(session.getActionAvailability(0).forest).toBe(true)
    expect(baseProbe).toHaveBeenCalledOnce()
    expect(leafProbe).toHaveBeenCalledOnce()

    const food = session.state.players[0]!.resources.food
    const response = session.takeAction(0, 'forest')
    expect(response.ok).toBe(true)
    expect(response.state.players[0]!.resources.food).toBe(food + 1)
  })

  it('keeps the strict custom composite predicate as a gate before probing its child', () => {
    const { session, space, baseProbe, leafProbe } = setup('composite')
    space.strictCanExecute = true
    const before = serializeSessionSnapshot(session.state, session)
    expect(session.getActionAvailability(0).forest).toBe(false)
    expect(baseProbe).toHaveBeenCalledOnce()
    expect(leafProbe).not.toHaveBeenCalled()
    expect(session.takeAction(0, 'forest').ok).toBe(false)
    expect(serializeSessionSnapshot(session.state, session)).toEqual(before)

    baseProbe.mockReturnValue(true)
    expect(session.getActionAvailability(0).forest).toBe(true)
    const food = session.state.players[0]!.resources.food
    expect(session.takeAction(0, 'forest').state.players[0]!.resources.food).toBe(food + 1)
  })

  it.each([false, true])('preserves an isDoable listener override, doable=%s', (doable) => {
    const { session } = setup('leaf', !doable)
    session.withCtx(() => requireActiveCardRegistry('availability probe test').registerListener({
      id: '__availability_override__',
      actions: ['forest'],
      phases: ['isDoable'],
      handler: () => ({ doable }),
    }))
    expect(session.getActionAvailability(0).forest).toBe(doable)
    expect(session.getAvailableActions(0).some(action => action.spaceId === 'forest')).toBe(doable)
    if (!doable) expect(session.takeAction(0, 'forest').ok).toBe(false)
  })
})
