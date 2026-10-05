import { expect, it } from 'vitest'
import { LocalSandboxCore } from '../worker-core'

it('projects current participant names in browser sandbox payloads while persisting raw names', () => {
  const sandbox = new LocalSandboxCore()
  const initial = sandbox.init({ cards: [], playerCount: 2, seed: 563 }, { viewerPlayerId: null, mode: 'debug' })
  const state = structuredClone(initial.persist.serializedState.state)
  state.players.forEach((player, index) => {
    player.name = index === 0 ? 'Sandbox actor' : 'Sandbox recipient'
    player.minorHand = ['__test_placeholder__']
    player.occupationHand = ['__test_placeholder__']
  })
  state.log = [{ key: 'transfer', playerRefs: { fromPlayer: 'p1', toPlayer: 'p2' },
    params: { fromPlayer: 'Recorded name', toPlayer: 'Recorded name' } }]
  const result = sandbox.call('loadGame', [state], { viewerPlayerId: 'p1', mode: 'viewer' })
  expect(result.payload.state.log[0]!.params).toEqual({ fromPlayer: 'Sandbox actor', toPlayer: 'Sandbox recipient' })
  expect(result.persist.serializedState.frame.log[0]!.params).toEqual({ fromPlayer: 'Recorded name', toPlayer: 'Recorded name' })
  expect(result.payload.state).not.toHaveProperty('gameSeed')
})
