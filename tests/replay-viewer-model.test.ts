import { describe, expect, it } from 'vitest'
import { EngineStack } from '../shared/engine'
import { createInitialState } from '../shared/session/state-bootstrap'
import { serializeState } from '../shared/session/serialization'
import type { ReplayManifest } from '../shared/contract/protocol/replay'
import {
  frameForPerspective,
  resolveLayout,
  segmentForStep,
  validPerspective,
} from '../replay-viewer/src/model'

const manifest = {
  participants: [
    { playerIndex: 0, displayName: 'Alice' },
    { playerIndex: 1, displayName: 'Bob' },
  ],
  segments: [
    { checkpointStepNo: 0, firstStepNo: 0, lastStepNo: 15 },
    { checkpointStepNo: 16, firstStepNo: 16, lastStepNo: 20 },
  ],
} as ReplayManifest

describe('replay viewer model', () => {
  it('validates perspectives and applies responsive layout defaults', () => {
    expect(validPerspective('p1', manifest)).toBe('p1')
    expect(validPerspective('p3', manifest)).toBeNull()
    expect(validPerspective('open', manifest)).toBe('open')
    expect(resolveLayout(null, 901)).toBe('timeline')
    expect(resolveLayout(null, 900)).toBe('board')
    expect(resolveLayout('timeline', 320)).toBe('timeline')
  })

  it('finds the checkpoint segment containing a step', () => {
    expect(segmentForStep(manifest, 18)?.checkpointStepNo).toBe(16)
    expect(segmentForStep(manifest, 21)).toBeNull()
  })

  it('shows only the selected seat hidden information unless fully open', () => {
    const state = createInitialState(42, { playerCount: 2 })
    const frame = serializeState(state, { engineStack: new EngineStack() })
    const p1 = frameForPerspective(frame, 'p1')
    const p2 = frameForPerspective(frame, 'p2')
    const open = frameForPerspective(frame, 'open')

    expect(p1.players[0].occupationHand).toEqual(frame.players[0].occupationHand)
    expect(p1.players[1].occupationHand).toEqual(Array(7).fill('?'))
    expect(p2.players[0].occupationHand).toEqual(Array(7).fill('?'))
    expect(p2.players[1].occupationHand).toEqual(frame.players[1].occupationHand)
    expect(open.players.map((player) => player.occupationHand)).toEqual(
      frame.players.map((player) => player.occupationHand),
    )
  })
})
