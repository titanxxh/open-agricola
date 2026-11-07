import { describe, expect, it } from 'vitest'
import type { ClientInteractionState } from '../../../../shared/contract/protocol/game'
import type { GameState } from '../../../../shared/contract/types'
import { initDraftState, processSubmit } from '../../../../shared/draft/draft-manager'
import { firstDraftPick } from '../../../../shared/draft/__tests__/draft-fixtures'
import {
  encyclopediaAttentionWindow,
  initialEncyclopediaAttention,
  nextEncyclopediaAttention,
} from '../encyclopedia-attention'

const players = [{ id: 'p1' }, { id: 'p2' }]
const work = (overrides: Partial<GameState> = {}) =>
  ({ phase: 'playing', gameOver: false, currentPlayerIndex: 0, players, ...overrides }) as unknown as GameState

const idle = (allowedCommands: string[] = ['takeAction']) =>
  ({ stateId: 'idle', allowedCommands, anytimeActions: [] }) as unknown as ClientInteractionState
const waitFor = (playerIndex: number, requestKey: string, allowedCommands: string[] = ['commitSelection']) =>
  ({
    stateId: 'wait', playerIndex, requestKey, allowedCommands, anytimeActions: [],
    request: { kind: 'farm-select', farm: { farmType: 'plow', selectableTiles: [{ row: 0, col: 2 }] } },
  }) as unknown as ClientInteractionState
const privatePrompt = (playerIndex: number) =>
  ({
    stateId: 'wait', playerIndex, allowedCommands: [], anytimeActions: [],
    request: { kind: 'private-prompt', playerIndex, promptKind: 'choice' },
  }) as unknown as ClientInteractionState

const draft = (): GameState => work({ phase: 'draft', draft: initDraftState(['p1', 'p2'], {
  p1: { occ: ['o1', 'o2', 'o3'], minor: ['m1', 'm2', 'm3'] },
  p2: { occ: ['o4', 'o5', 'o6'], minor: ['m4', 'm5', 'm6'] },
}, 3, 2) })
const parents = (submitted: boolean, visible = true): GameState => work({
  phase: 'parent-selection',
  parentSelection: {
    candidates: { p1: visible ? { mother: ['MO1'], father: ['FA1'] } : { mother: ['?'], father: ['?'] } },
    submissions: { p1: submitted ? { mother: 'MO1', father: 'FA1' } : null, p2: null },
  },
} as unknown as Partial<GameState>)

const windowOf = (state: GameState, interaction: ClientInteractionState = idle([]), playerId: string | null = 'p1') =>
  encyclopediaAttentionWindow({ state, interaction, playerId })

describe('encyclopediaAttentionWindow', () => {
  it('opens a window only when the local player has a command to send', () => {
    expect(windowOf(work(), idle())).not.toBeNull()
    expect(windowOf(work(), idle([]))).toBeNull()
    expect(windowOf(work({ currentPlayerIndex: 1 }), idle())).toBeNull()
    expect(windowOf(work(), waitFor(0, 'sow'))).not.toBeNull()
    expect(windowOf(work(), waitFor(1, 'sow'))).toBeNull()
    expect(windowOf(work(), waitFor(0, 'sow', []))).toBeNull()
    expect(windowOf(work(), privatePrompt(1))).toBeNull()
    expect(windowOf(work({ gameOver: true }), idle())).toBeNull()
    expect(windowOf(work(), idle(), null)).toBeNull()
  })

  it('keys a work window by its authoritative request', () => {
    expect(windowOf(work(), waitFor(0, 'sow'))).toBe(windowOf(work(), waitFor(0, 'sow')))
    expect(windowOf(work(), waitFor(0, 'sow'))).not.toBe(windowOf(work(), waitFor(0, 'confirm')))
    expect(windowOf(work(), waitFor(0, 'sow'))).not.toBe(windowOf(work(), idle()))
  })

  it('keys a draft window to the local opportunity, preserving it across peer submissions', () => {
    const initial = draft()
    const peer = processSubmit(initial.draft!, 'p2', firstDraftPick(initial.draft!, 'p2'))
    if (peer.kind !== 'accepted') throw new Error(peer.error)
    expect(windowOf({ ...initial, draft: peer.draft })).toBe(windowOf(initial))
    const next = processSubmit(peer.draft, 'p1', firstDraftPick(peer.draft, 'p1'))
    if (next.kind !== 'accepted') throw new Error(next.error)
    expect(windowOf({ ...initial, draft: next.draft })).not.toBe(windowOf(initial))
    const waiting = processSubmit(initial.draft!, 'p1', firstDraftPick(initial.draft!, 'p1'))
    if (waiting.kind !== 'accepted') throw new Error(waiting.error)
    expect(windowOf({ ...initial, draft: waiting.draft })).toBeNull()
  })

  it('opens a parent window once the local candidates are visible and unsubmitted', () => {
    expect(windowOf(parents(false))).not.toBeNull()
    expect(windowOf(parents(false, false))).toBeNull()
    expect(windowOf(parents(true))).toBeNull()
  })
})

describe('nextEncyclopediaAttention', () => {
  const sow = windowOf(work(), waitFor(0, 'sow'))
  const confirm = windowOf(work(), waitFor(0, 'confirm'))

  it('takes the window at opening as the baseline without asking for attention', () => {
    const opened = initialEncyclopediaAttention(sow)
    expect(opened.pending).toBe(false)
    expect(nextEncyclopediaAttention(opened, sow)).toBe(opened)
  })

  it('asks for attention once when a new local window opens and ignores repeated snapshots of it', () => {
    const waiting = initialEncyclopediaAttention(null)
    expect(nextEncyclopediaAttention(waiting, null)).toBe(waiting)
    const alerted = nextEncyclopediaAttention(waiting, sow)
    expect(alerted.pending).toBe(true)
    expect(nextEncyclopediaAttention(alerted, sow)).toBe(alerted)
  })

  it('moves the reminder to a replacement window and clears it when the window goes away', () => {
    const replaced = nextEncyclopediaAttention(initialEncyclopediaAttention(sow), confirm)
    expect(replaced).toEqual({ window: confirm, pending: true })
    expect(nextEncyclopediaAttention(replaced, null)).toEqual({ window: null, pending: false })
  })
})
