// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { GameState } from '../../../../shared/contract/types'
import type { DraftStageKind, DraftState } from '../../../../shared/draft/types'
import { DraftOverlay } from '../DraftOverlay'
import { createInitialState } from '../../../../shared/session/state-bootstrap'

afterEach(cleanup)

const draftState = (stage: DraftStageKind, waiting = false): GameState => ({
  ...createInitialState(42, { playerCount: 2 }),
  phase: 'draft',
  draft: {
    mode: 'simultaneous', stage, round: 1, totalRounds: 7, poolSize: 7,
    seatOrder: ['p1', 'p2'], pools: { p1: { occ: [], minor: [] } },
    kept: { p1: { occ: [], minor: [] } },
    pendingPicks: { p1: { occ: waiting ? 'kept' : null, minor: waiting ? 'kept' : null } },
  } satisfies DraftState,
})

describe('Chinese draft overlay', () => {
  it.each([
    ['standard', '选择 1 张职业和 1 张小改良'],
    ['occupation', '选择 1 张职业'],
    ['farmersOfTheMoorMinor', '选择 1 张沼泽农夫小改良'],
    ['publishedMinor', '选择 1 张小改良'],
  ] as const)('localizes the %s stage', (stage, prompt) => {
    const { container } = render(<DraftOverlay state={draftState(stage)} meId="p1" locale="zh" onSubmit={vi.fn()} />)
    expect(screen.getByRole('dialog', { name: '卡牌轮抽' })).toBeVisible()
    expect(container).toHaveTextContent('轮抽 — 第 1 / 7 轮')
    expect(container).toHaveTextContent(prompt)
    expect(screen.getByRole('button', { name: '确认选择' })).toBeVisible()
    expect(container.textContent).not.toMatch(/Draft|Pick|Occupations|Minor improvements|Already kept|Confirm/)
  })

  it('localizes the wait message with submitted and seat counts', () => {
    render(<DraftOverlay state={draftState('standard', true)} meId="p1" locale="zh" onSubmit={vi.fn()} />)
    expect(screen.getByText('等待其他玩家（1/2）…')).toBeVisible()
    expect(screen.getByRole('status')).toHaveTextContent('正在等待：玩家 2')
    const players = screen.getByRole('region', { name: '开局顺位' }).querySelectorAll('li')
    expect(players[0]).toHaveTextContent('1玩家 1你起始玩家已确认')
    expect(players[1]).toHaveTextContent('2玩家 2选牌中')
  })

  it.each(['standard', 'occupation', 'farmersOfTheMoorMinor', 'publishedMinor'] satisfies DraftStageKind[])(
    'shows public confirmation markers and resets waiting names for %s', stage => {
      const state = draftState(stage)
      state.players[0]!.name = 'Alice'
      state.players[0]!.nameIsDefault = false
      state.players[1]!.name = 'Bob'
      state.players[1]!.nameIsDefault = false
      state.draft!.pendingPicks.p2 = { occ: '?', minor: '?' }
      const { container, rerender } = render(<DraftOverlay state={state} meId="p2" locale="en" onSubmit={vi.fn()} />)
      expect(screen.getByRole('status')).toHaveTextContent('Waiting for: Alice')
      expect(container.querySelector('[data-player-id="p1"]')).toHaveTextContent('Choosing cards')
      expect(container.querySelector('[data-player-id="p2"]')).toHaveTextContent('YouConfirmed')
      state.draft = { ...state.draft!, round: 2, pendingPicks: { p1: { occ: null, minor: null }, p2: { occ: null, minor: null } } }
      rerender(<DraftOverlay state={{ ...state }} meId="p2" locale="en" onSubmit={vi.fn()} />)
      expect(screen.queryByRole('status')).toBeNull()
      expect(container.querySelectorAll('[data-submitted="false"]')).toHaveLength(2)
    },
  )
})
