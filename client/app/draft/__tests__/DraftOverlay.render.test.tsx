// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import type { DraftStageKind } from '../../../../shared/draft/types'
import { initStagedDraftState, processSubmit } from '../../../../shared/draft/draft-manager'
import { firstDraftPick } from '../../../../shared/draft/__tests__/draft-fixtures'
import { createInitialState } from '../../../../shared/session/state-bootstrap'
import { DraftOverlay } from '../DraftOverlay'

afterEach(cleanup)
const opening = (kind: DraftStageKind = 'standard') => {
  const state = createInitialState(42, { playerCount: 2, draftMode: 'simultaneous' })
  if (!state.draft) throw new Error('missing draft')
  const pools = Object.fromEntries(state.players.map(player => {
    const pool = state.draft!.stages[0].seats[player.id].inbox[1]
    return [player.id, { occ: kind === 'standard' || kind === 'occupation' ? pool.occ : [], minor: kind !== 'occupation' ? pool.minor : [] }]
  }))
  state.draft = initStagedDraftState(['p1', 'p2'], [{ kind, poolSize: 7, totalRounds: 7, pools }])
  return state
}

it.each([
  ['standard', '选择 1 张职业和 1 张小改良'], ['occupation', '选择 1 张职业'],
  ['farmersOfTheMoorMinor', '选择 1 张沼泽农夫小改良'], ['publishedMinor', '选择 1 张小改良'],
] as const)('renders the private %s choice in Chinese', (kind, prompt) => {
  render(<DraftOverlay state={opening(kind)} meId="p1" locale="zh" onSubmit={vi.fn()} />)
  expect(screen.getByRole('dialog', { name: '卡牌轮抽' })).toHaveTextContent(prompt)
  expect(screen.getByRole('button', { name: '确认选择' })).toBeDisabled()
})

it('shows public personal progress, independent connection status, and existing waiting names', () => {
  const state = opening()
  const result = processSubmit(state.draft!, 'p1', firstDraftPick(state.draft!, 'p1'))
  if (result.kind !== 'accepted') throw new Error(result.error)
  state.draft = result.draft
  const { container } = render(<DraftOverlay state={state} meId="p1" locale="zh" onSubmit={vi.fn()} connectedPlayerIndexes={[0]} />)
  expect(screen.getByRole('status')).toHaveTextContent('正在等待：玩家 2')
  expect(container.querySelector('[data-player-id="p1"]')).toHaveTextContent('等待传牌职业 1/7 · 小改 1/7在线')
  expect(container.querySelector('[data-player-id="p2"]')).toHaveTextContent('选牌中职业 0/7 · 小改 0/7离线')
  expect(screen.queryByRole('button', { name: '确认选择' })).toBeNull()
})

it('retains selections after peer updates, captures the rendered opportunity, and clears them for the next packet', () => {
  const state = opening()
  const onSubmit = vi.fn()
  const { container, rerender } = render(<DraftOverlay state={state} meId="p1" locale="en" onSubmit={onSubmit} />)
  fireEvent.click(container.querySelector('.draft-pool-row-occ .draft-card')!)
  fireEvent.click(container.querySelector('.draft-pool-row-minor .draft-card')!)
  const mine = firstDraftPick(state.draft!, 'p1')
  const peer = processSubmit(state.draft!, 'p2', firstDraftPick(state.draft!, 'p2'))
  if (peer.kind !== 'accepted') throw new Error(peer.error)
  rerender(<DraftOverlay state={{ ...state, draft: peer.draft }} meId="p1" locale="en" onSubmit={onSubmit} />)
  expect(container.querySelectorAll('.draft-card.selected')).toHaveLength(2)
  fireEvent.click(screen.getByRole('button', { name: 'Confirm picks' }))
  expect(onSubmit).toHaveBeenCalledWith(mine)
  const next = processSubmit(peer.draft, 'p1', mine)
  if (next.kind !== 'accepted') throw new Error(next.error)
  rerender(<DraftOverlay state={{ ...state, draft: next.draft }} meId="p1" locale="en" onSubmit={onSubmit} />)
  expect(container.querySelectorAll('.draft-card.selected')).toHaveLength(0)
  expect(screen.getByRole('button', { name: 'Confirm picks' })).toBeDisabled()
})
