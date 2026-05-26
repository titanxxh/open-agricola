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
        kind: 'stateLog',
        key: 'state-log-1',
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

  it('uses strikethrough for canceled rows and keeps state log rows non-replayable', () => {
    render(<ActionLog locale="zh" currentRound={2} log={[]} timelineBuckets={buckets} />)

    expect(screen.getByTestId('action-log-row-event-canceled')).toHaveClass(
      'action-log__entry--canceled',
    )
    expect(screen.getByTestId('action-log-row-state-log-1')).toHaveAttribute(
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
    fireEvent.click(screen.getByTestId('action-log-row-state-log-1'))

    expect(onSelectReplayEntry).toHaveBeenCalledTimes(1)
    expect(onSelectReplayEntry.mock.calls[0]?.[0].key).toBe('event-active')
  })

  it('renders accumulation log resources without leaking raw placeholders', () => {
    const { container } = render(
      <ActionLog
        locale="en"
        currentRound={2}
        log={[
          {
            key: 'log.actionAccumulated',
            params: { action: 'actions.forest.name', resources: { wood: 3 } },
          },
          {
            key: 'log.resourceAccumulated',
            params: { target: 'actionSpace', action: 'actions.fishing.name', resources: { food: 1 } },
          },
          {
            key: 'log.resourceAccumulated',
            params: {
              target: 'card',
              player: 'Alice',
              cardId: 'Major_ClayOven',
              resources: { food: 2 },
            },
          },
          {
            key: 'log.resourceAccumulated',
            params: { target: 'roundCard', round: 7, resources: { stone: 1 } },
          },
          {
            key: 'log.resourceAccumulated',
            params: { target: 'roundCard', round: Number.NaN, resources: { clay: 1 } },
          },
        ]}
      />,
    )

    const text = container.textContent ?? ''
    expect(text).toContain('Forest')
    expect(text).toContain('Fishing')
    expect(text).toContain('Clay Oven')
    expect(text).toContain('Round 7')
    expect(text).toContain('round card')
    expect(text).not.toContain('log.actionAccumulated')
    expect(text).not.toContain('log.resourceAccumulated')
    expect(text).not.toContain('[object Object]')
    expect(text).not.toContain('{resources}')
    expect(text).not.toContain('Round NaN')
    expect(text).not.toContain('第 NaN')

    expect(container.querySelector('[data-resource="wood"][data-amount="3"]')).not.toBeNull()
    expect(container.querySelector('[data-resource="food"][data-amount="1"]')).not.toBeNull()
    expect(container.querySelector('[data-resource="food"][data-amount="2"]')).not.toBeNull()
    expect(container.querySelector('[data-resource="stone"][data-amount="1"]')).not.toBeNull()
    expect(container.querySelector('[data-resource="clay"][data-amount="1"]')).not.toBeNull()
  })

  it('renders rich card and resource log params without leaking raw objects or html', () => {
    const { container } = render(
      <ActionLog
        locale="en"
        currentRound={2}
        log={[
          {
            key: 'log.cardInfoboxChanged',
            params: { cardId: 'B21_HayloftBarn', text: '<b>Food: 3</b>' },
          },
          {
            key: 'log.cardStackChanged',
            params: { cardId: 'C81_MaterialHub', resources: { wood: 2 } },
          },
          {
            key: 'log.cardResourcePairsStored',
            params: {
              player: 'Alice',
              cardId: 'C146_WorkshopAssistant',
              pairs: [{ wood: 1, clay: 1 }, { reed: 1, stone: 1 }],
            },
          },
          {
            key: 'log.futureMeepleResolved',
            params: {
              player: 'Alice',
              cardId: 'B157_Salter',
              round: 3,
              roomType: '',
              resources: { food: 2 },
            },
          },
          {
            key: 'log.farmCropAdded',
            params: { player: 'Alice', crops: { grain: 1 } },
          },
          {
            key: 'log.cardSwappedWithBoard',
            params: {
              player: 'Alice',
              fromCardId: 'B21_HayloftBarn',
              toCardId: 'C81_MaterialHub',
            },
          },
        ]}
      />,
    )

    const text = container.textContent ?? ''
    expect(text).toContain('Food: 3')
    expect(text).toContain('Hayloft Barn')
    expect(text).toContain('Material Hub')
    expect(text).toContain('Workshop Assistant')
    expect(text).toContain('Salter')
    expect(text).not.toContain('[object Object]')
    expect(text).not.toContain('log.cardInfoboxChanged')
    expect(container.querySelector('b')).toBeNull()
    expect(container.querySelector('[data-resource="clay"][data-amount="1"]')).not.toBeNull()
    expect(container.querySelector('[data-resource="reed"][data-amount="1"]')).not.toBeNull()
    expect(container.querySelector('[data-resource="stone"][data-amount="1"]')).not.toBeNull()
    expect(container.querySelector('[data-resource="wood"][data-amount="2"]')).not.toBeNull()
    expect(container.querySelector('[data-resource="food"][data-amount="2"]')).not.toBeNull()
    expect(container.querySelector('[data-resource="grain"][data-amount="1"]')).not.toBeNull()
    expect(container.querySelectorAll('.log-card-link').length).toBeGreaterThanOrEqual(3)
  })

  it('localizes structured card trigger details at render time', () => {
    const { container } = render(
      <ActionLog
        locale="zh"
        currentRound={2}
        log={[
          {
            key: 'log.cardTriggered',
            params: {
              cardId: 'B48_ForestStone',
              triggerAction: 'actions.forest.name',
              replacement: true,
              optional: true,
              declined: true,
            },
          },
        ]}
      />,
    )

    const text = container.textContent ?? ''
    expect(text).toContain('森林')
    expect(text).toContain('替换')
    expect(text).toContain('可选')
    expect(text).toContain('已拒绝')
    expect(text).not.toContain('actions.forest.name')
    expect(text).not.toContain('replacement')
  })

  it('localizes future worker room types and worker return destinations', () => {
    const { container } = render(
      <ActionLog
        locale="zh"
        currentRound={2}
        log={[
          {
            key: 'log.futureMeepleResolved',
            params: {
              player: '玩家A',
              cardId: 'B157_Salter',
              round: 6,
              roomType: 'clay',
              resources: { food: 2 },
            },
          },
          {
            key: 'log.workerReturned',
            params: { destination: 'home' },
          },
        ]}
      />,
    )

    const text = container.textContent ?? ''
    expect(text).toContain('黏土')
    expect(text).toContain('回收工人回家')
    expect(text).not.toContain('clay')
    expect(text).not.toContain('home')
  })
})
