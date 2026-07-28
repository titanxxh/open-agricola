// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ReplayViewer } from '../../../replay-viewer/src/ReplayViewer'

vi.mock('../../../replay-viewer/src/ReplayBoard', () => ({
  ReplayBoard: () => <div>visible replay frame</div>,
}))

const step = (stepNo: number, checkpointStepNo = stepNo) => ({
  stepNo,
  roomVersion: stepNo,
  checkpointStepNo,
  playerIndex: null,
  commandType: 'initial',
  intent: {},
  frameHash: String(stepNo).padStart(64, '0'),
  createdAt: stepNo,
})

const manifest = (steps: ReturnType<typeof step>[], corruptRanges: Array<{
  firstStepNo: number
  lastStepNo: number
  nextCheckpointStepNo?: number
}> = []) => ({
  ok: true as const,
  kind: 'replayManifest' as const,
  apiVersion: 1 as const,
  roomId: 'room-1',
  schemaVersion: 1,
  viewerBuildId: 'a'.repeat(64),
  gameBuildId: 'game-1',
  firstStepNo: 0,
  lastStepNo: steps.at(-1)?.stepNo ?? 0,
  missingPrefix: false,
  participants: [{ playerIndex: 0, displayName: 'Alice' }],
  segments: steps.map((entry) => ({
    checkpointStepNo: entry.checkpointStepNo,
    firstStepNo: entry.stepNo,
    lastStepNo: entry.stepNo,
  })),
  steps,
  corruptRanges,
  customCards: [],
})

const response = (body: unknown) =>
  Promise.resolve(new Response(JSON.stringify(body)))

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  window.history.replaceState(null, '', '/')
})

describe('ReplayViewer recovery', () => {
  it('retries a failed segment when the current timeline step is selected again', async () => {
    window.history.replaceState(
      null,
      '',
      '/?room=room-1&perspective=open&locale=en&api=https%3A%2F%2Fapi.test',
    )
    const unavailable = {
      ok: false,
      code: 'replay_segment_unavailable',
      message: 'temporary failure',
    }
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockImplementationOnce(() => response(manifest([step(0)])))
      .mockImplementationOnce(() => response(unavailable))
      .mockImplementationOnce(() => response(unavailable))

    render(<ReplayViewer />)
    await screen.findByText('replay_segment_unavailable')
    fireEvent.click(screen.getByText('000').closest('button')!)

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3))
  })

  it('stops automatic playback before a corrupt gap', async () => {
    window.history.replaceState(
      null,
      '',
      '/?room=room-1&perspective=open&locale=en&api=https%3A%2F%2Fapi.test',
    )
    const first = step(0)
    const next = step(2)
    vi.spyOn(globalThis, 'fetch')
      .mockImplementationOnce(() => response(manifest(
        [first, next],
        [{ firstStepNo: 1, lastStepNo: 1, nextCheckpointStepNo: 2 }],
      )))
      .mockImplementationOnce(() => response({
        ok: true,
        kind: 'replaySegment',
        apiVersion: 1,
        roomId: 'room-1',
        schemaVersion: 1,
        viewerBuildId: 'a'.repeat(64),
        checkpointStepNo: 0,
        steps: [{ ...first, frame: { players: [] } }],
      }))

    render(<ReplayViewer />)
    await screen.findByText('visible replay frame')
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled()
    fireEvent.keyDown(window, { key: 'ArrowRight' })
    expect(new URLSearchParams(window.location.search).get('step')).toBe('0')
    fireEvent.change(screen.getByRole('slider', { name: 'Step' }), {
      target: { value: '1' },
    })
    expect(new URLSearchParams(window.location.search).get('step')).toBe('0')
    fireEvent.click(screen.getByRole('button', { name: 'Play' }))

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Play' })).toBeVisible()
      expect(new URLSearchParams(window.location.search).get('step')).toBe('0')
    })
  })

  it('shows archived scoring on a game-over frame', async () => {
    window.history.replaceState(
      null,
      '',
      '/?room=room-1&perspective=open&locale=en&api=https%3A%2F%2Fapi.test',
    )
    const final = step(0)
    vi.spyOn(globalThis, 'fetch')
      .mockImplementationOnce(() => response(manifest([final])))
      .mockImplementationOnce(() => response({
        ok: true,
        kind: 'replaySegment',
        apiVersion: 1,
        roomId: 'room-1',
        schemaVersion: 1,
        viewerBuildId: 'a'.repeat(64),
        checkpointStepNo: 0,
        steps: [{
          ...final,
          frame: {
            players: [],
            gameOver: true,
            scores: [{
              playerId: 'p1',
              playerName: 'Alice',
              categories: [],
              total: 12,
            }],
          },
        }],
      }))

    render(<ReplayViewer />)
    await screen.findByText('Scoring Pad')
    expect(screen.getByText('+12')).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(screen.queryByText('Scoring Pad')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Final scores' }))
    expect(screen.getByText('Scoring Pad')).toBeVisible()
  })
})
