// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { GameState } from '../../../../shared/contract/types'
import type { DraftStageKind, DraftState } from '../../../../shared/draft/types'
import { DraftOverlay } from '../DraftOverlay'

afterEach(cleanup)

const draftState = (stage: DraftStageKind, waiting = false): GameState => ({
  phase: 'draft',
  draft: {
    mode: 'simultaneous', stage, round: 1, totalRounds: 7, poolSize: 7,
    seatOrder: ['p1', 'p2'], pools: { p1: { occ: [], minor: [] } },
    kept: { p1: { occ: [], minor: [] } },
    pendingPicks: { p1: { occ: waiting ? 'kept' : null, minor: waiting ? 'kept' : null } },
  } satisfies DraftState,
}) as GameState

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
  })
})
