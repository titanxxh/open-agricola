import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'
import {
  getFenceCount,
  getPalisadeCount,
} from '../../shared/actions/effects/fencing'
import { setFencesForTest, setPalisadesForTest } from '../../shared/cards/__tests__/__fixtures__/fence'

import '../../shared/cards/C/C1_Overhaul'

const CARD_ID = 'C1_Overhaul'

const setup = (opts: {
  wood?: number
  fences?: number
  palisades?: number
  occupations?: number
}) => {
  const session = new GameSession()
  const state = session.getState().state
  state.players = state.players.slice(0, 2)
  state.currentPlayerIndex = 0
  state.round = 1

  const player = state.players[0]!
  setWorkersAtHome(state, player, 2)
  player.resources = {
    ...player.resources,
    wood: opts.wood ?? 1,
    food: 5,
  }
  player.minorHand = [CARD_ID]

  // Two filler occupations to satisfy "2 Occupations" prerequisite.
  const occCount = opts.occupations ?? 2
  player.occupationPlayed = []
  for (let i = 0; i < occCount; i += 1) {
    player.occupationPlayed.push(`__filler_occ_${i}`)
  }

  if (opts.fences && opts.fences > 0) setFencesForTest(player, opts.fences)
  if (opts.palisades && opts.palisades > 0) setPalisadesForTest(player, opts.palisades)

  session.loadState(state)
  return session
}

const playC1 = (session: GameSession): { resp: ReturnType<GameSession['takeAction']> } => {
  let resp = session.takeAction(0, 'meeting-place')
  expect(resp.ok).toBe(true)
  let safety = 0
  while (resp.interaction.stateId === 'wait' && safety < 12) {
    safety += 1
    const interaction = resp.interaction
    if (interaction.request.kind !== 'choice') break
    const opts = interaction.options?.map((o) => o.value) ?? []
    const cardOption = opts.find((v) => v === `minor:${CARD_ID}`)
    if (cardOption) {
      resp = session.resolveChoice(0, cardOption)
      continue
    }
    const acceptOption = opts.find((v) => v !== '__skip__')
    if (acceptOption) {
      resp = session.resolveChoice(0, acceptOption)
      continue
    }
    break
  }
  return { resp }
}

describe('C1 Overhaul session', () => {
  it('with 0 fences on board, onBuy completes without surfacing a fence prompt', () => {
    const session = setup({ wood: 1, fences: 0, palisades: 0 })
    const { resp } = playC1(session)
    // No fences ⇒ onBuy returns nothing (or a no-op SEQ that auto-resolves);
    // either way we should not be sitting on a farmSelect prompt.
    if (resp.interaction.stateId === 'wait') {
      const interaction = (resp as { interaction?: { stateId?: string } }).interaction
      expect(interaction?.stateId).not.toBe('farmSelect')
    }
    // C1 is a passing card: buyer does not retain it in minorPlayed; it goes to next player.
    const p0 = session.getState().state.players[0]!
    const p1 = session.getState().state.players[1]!
    expect(p0.minorPlayed).not.toContain(CARD_ID)
    expect(p1.minorHand).toContain(CARD_ID)
    expect(getFenceCount(p0)).toBe(0)
    expect(getPalisadeCount(p0)).toBe(0)
  })

  it('razes existing fences and lets player rebuild for free (costOverride active)', () => {
    // setup: buyer has 4 wood; C1 costs 1 wood to buy → 3 remaining.
    // Rebuild 4 fences — if costOverride is active, fence cost = 0 → wood stays at 3.
    const session = setup({ wood: 4, fences: 2 })
    const { resp } = playC1(session)
    expect(resp.ok).toBe(true)

    // Fences pre-razed: 0 still on board (consume-fence ran before the
    // farmSelect choice surfaces).
    const before = session.getState().state.players[0]!
    expect(getFenceCount(before)).toBe(0)

    const commit = session.resolveChoice(0, 'confirm', {
      edges: ['H-0-0', 'H-1-0', 'V-0-0', 'V-0-1'],
      palisadeEdges: [],
      extraWood: 0,
    })
    expect(commit.ok).toBe(true)
    const after = commit.state.players[0]!
    expect(getFenceCount(after)).toBe(4)
    expect(after.pastures).toHaveLength(1)
    // wood: 4 (start) - 1 (C1 buy cost) - 0 (free rebuild) = 3
    expect(after.resources.wood).toBe(3)
    // C1 passed to next player
    expect(after.minorPlayed).not.toContain(CARD_ID)
    expect(commit.state.players[1]!.minorHand).toContain(CARD_ID)
  })

  it('does not raze wood palisades', () => {
    // 2 fences + 2 palisades — only fences should be razed.
    const session = setup({ wood: 1, fences: 2, palisades: 2 })
    const { resp } = playC1(session)
    expect(resp.ok).toBe(true)

    const before = session.getState().state.players[0]!
    expect(getFenceCount(before)).toBe(0)
    expect(getPalisadeCount(before)).toBe(2)
  })

  it('fence rebuild completes with 0 net wood cost (free rebuild via costOverride)', () => {
    // 4 wood: 1 for C1 buy, 0 for free rebuild → 3 remaining
    const session = setup({ wood: 4, fences: 2 })
    const { resp } = playC1(session)
    expect(resp.ok).toBe(true)
    const commit = session.resolveChoice(0, 'confirm', {
      edges: ['H-0-0', 'H-1-0', 'V-0-0', 'V-0-1'],
      palisadeEdges: [],
      extraWood: 0,
    })
    expect(commit.ok).toBe(true)
    expect(commit.state.players[0]!.resources.wood).toBe(3)
  })
})
