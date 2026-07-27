import { describe, expect, it } from 'vitest'
import { EngineStack } from '../shared/engine'
import { createInitialState } from '../shared/session/state-bootstrap'
import { serializeState } from '../shared/session/serialization'
import type { ReplayManifest } from '../shared/contract/protocol/replay'
import {
  frameForPerspective,
  intentForPerspective,
  replayAssetUrl,
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

  it('shows command intents only to the acting seat or the open perspective', () => {
    const step = {
      stepNo: 1,
      roomVersion: 1,
      checkpointStepNo: 0,
      playerIndex: 1,
      commandType: 'draftSubmit',
      intent: { pick: { occCardId: 'A001' } },
      frameHash: 'a'.repeat(64),
      createdAt: 1,
    }

    expect(intentForPerspective(step, 'p1')).toBeUndefined()
    expect(intentForPerspective(step, 'p2')).toEqual(step.intent)
    expect(intentForPerspective(step, 'open')).toEqual(step.intent)
  })

  it('resolves archived custom art through the runtime API base', () => {
    expect(replayAssetUrl(
      '/replay-assets/abc',
      'https://example.test/agricola-api/',
    )).toBe('https://example.test/agricola-api/replay-assets/abc')
    expect(replayAssetUrl('https://cdn.example/art.webp', '/api')).toBe(
      'https://cdn.example/art.webp',
    )
  })
})
