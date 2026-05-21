// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import type { ActionLogTimelineBucket } from '../../../app/action-log-timeline'
import type { GameEvent } from '../../../../shared/contract/events'
import { ActionLog } from '../ActionLog'

const replayEvent = (id: string, seq: number): GameEvent => ({
  schemaVersion: 1,
  id,
  seq,
  round: 2,
  phase: 'work',
  visibility: 'public',
  actorPlayerId: 'p1',
  type: 'resource.moved',
  resources: { wood: 3 },
  from: { kind: 'actionSpace', spaceId: 'forest' },
  to: { kind: 'player', playerId: 'p1' },
  reason: 'collect',
})

const buckets: ActionLogTimelineBucket[] = [
  {
    round: 2,
    rows: [
      {
        kind: 'event',
        key: 'event-active',
        entry: {
          key: 'event-active',
          kind: 'event',
          packetSeq: 1,
          packetLocalIndex: 0,
          event: replayEvent('event-active', 1),
          status: 'active',
          payloadSource: 'currentEvents',
          replayable: true,
        },
        logEntry: { key: 'log.placeFarmer', params: { player: '玩家A', action: '森林' } },
        label: '',
        round: 2,
        status: 'active',
        replayable: true,
        strikethrough: false,
      },
      {
        kind: 'event',
        key: 'event-canceled',
        entry: {
          key: 'event-canceled',
          kind: 'event',
          packetSeq: 2,
          packetLocalIndex: 0,
          event: replayEvent('event-canceled', 2),
          status: 'canceled',
          payloadSource: 'canceledArchive',
          replayable: true,
        },
        logEntry: {
          key: 'log.actionExclusiveUseCleared',
          params: { player: '玩家B', action: '建栅栏' },
        },
        label: '',
        round: 2,
        status: 'canceled',
        replayable: true,
        strikethrough: true,
      },
      {
        kind: 'legacyLog',
        key: 'legacy-1',
        logEntry: { key: 'log.startGame' },
        label: '',
        round: 2,
        replayable: false,
        strikethrough: false,
      },
    ],
  },
]

describe('ActionLog', () => {
  it('renders translated entries with icons', () => {
    render(
      <ActionLog
        locale="zh"
        currentRound={1}
        log={[
          { key: 'log.placeFarmer', params: { player: '玩家A', action: '森林' } },
          { key: 'log.startGame' },
        ]}
      />,
    )
    // Icon classifier still picks something per entry
    expect(screen.getAllByRole('listitem').length).toBeGreaterThan(0)
  })

  it('groups entries by round using log.enterRound markers', () => {
    const { container } = render(
      <ActionLog
        locale="zh"
        currentRound={2}
        log={[
          { key: 'log.placeFarmer', params: { player: 'X', action: '森林' } },
          { key: 'log.enterRound', params: { round: 2 } },
          { key: 'log.placeFarmer', params: { player: 'Y', action: '农场扩建' } },
          { key: 'log.enterRound', params: { round: 1 } },
          { key: 'log.startGame' },
        ]}
      />,
    )
    // Three buckets: round 2, round 1, and a "round 0" pre-game bucket
    // containing log.startGame (entries before the first enterRound marker).
    expect(container.querySelectorAll('.action-log__round-header')).toHaveLength(3)
  })

  it('renders empty state when log is empty', () => {
    render(<ActionLog locale="zh" currentRound={1} log={[]} />)
    expect(screen.getByText('暂无')).toBeInTheDocument()
  })

  it('renders one integrated replay panel without tabs', () => {
    render(<ActionLog locale="zh" currentRound={2} log={[]} timelineBuckets={buckets} />)

    expect(screen.getByText('行动记录')).toBeInTheDocument()
    expect(screen.queryByRole('tab')).toBeNull()
    expect(screen.getByText('全部')).toBeInTheDocument()
    expect(screen.queryByText('log.placeFarmer')).toBeNull()
    expect(screen.queryByText('log.actionExclusiveUseCleared')).toBeNull()
    expect(screen.getByText(/玩家A 放置工人/)).toBeInTheDocument()
    expect(screen.getByText(/游戏开始/)).toBeInTheDocument()
  })

  it('uses strikethrough for canceled rows and keeps legacy rows non-replayable', () => {
    render(<ActionLog locale="zh" currentRound={2} log={[]} timelineBuckets={buckets} />)

    expect(screen.getByTestId('action-log-row-event-canceled')).toHaveClass(
      'action-log__entry--canceled',
    )
    expect(screen.getByTestId('action-log-row-legacy-1')).toHaveAttribute(
      'aria-disabled',
      'true',
    )
  })

  it('calls onSelectReplayEntry only for replayable event rows', () => {
    const onSelectReplayEntry = vi.fn()
    render(
      <ActionLog
        locale="zh"
        currentRound={2}
        log={[]}
        timelineBuckets={buckets}
        onSelectReplayEntry={onSelectReplayEntry}
      />,
    )

    fireEvent.click(screen.getByTestId('action-log-row-event-active'))
    fireEvent.click(screen.getByTestId('action-log-row-legacy-1'))

    expect(onSelectReplayEntry).toHaveBeenCalledTimes(1)
    expect(onSelectReplayEntry.mock.calls[0]?.[0].key).toBe('event-active')
  })
})
