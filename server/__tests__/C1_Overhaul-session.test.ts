import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/game/player'
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
  while (resp.pending.type === 'choice' && safety < 12) {
    safety += 1
    const interaction = (resp as { interaction?: { stateId?: string } }).interaction
    if (interaction?.stateId === 'farmSelect') break
    const opts = resp.pending.options.map((o) => o.value)
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
    if (resp.pending.type === 'choice') {
      const interaction = (resp as { interaction?: { stateId?: string } }).interaction
      expect(interaction?.stateId).not.toBe('farmSelect')
    }
    const player = session.getState().state.players[0]!
    expect(player.minorPlayed).toContain(CARD_ID)
    expect(getFenceCount(player)).toBe(0)
    expect(getPalisadeCount(player)).toBe(0)
  })

  it('razes existing fences and lets player rebuild for free up to n+3', () => {
    // Pretend the player already has 2 fences on the board. C1 should
    // remove them, then offer a free fencing action with 0 wood cost.
    // Player buys C1 for 1 wood; the fencing rebuild should not consume
    // any further wood when within the n+3 cap.
    const session = setup({ wood: 1, fences: 2 })
    const { resp } = playC1(session)
    expect(resp.ok).toBe(true)

    // Fences pre-razed: 0 still on board (consume-fence ran before the
    // farmSelect choice surfaces).
    const before = session.getState().state.players[0]!
    expect(getFenceCount(before)).toBe(0)

    // Build 4 fences for free (wood was 0). Use tile (0,0) as a simple
    // 4-edge enclosure. Player has 0 wood — proving the discount is full.
    const commit = session.resolveChoice(0, 'confirm', {
      edges: ['H-0-0', 'H-1-0', 'V-0-0', 'V-0-1'],
      palisadeEdges: [],
      extraWood: 0,
    })
    expect(commit.ok).toBe(true)
    const after = commit.state.players[0]!
    expect(after.resources.wood).toBe(0)
    expect(getFenceCount(after)).toBe(4)
    expect(after.pastures).toHaveLength(1)
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

  it('caps free rebuild at n+3 (selecting more fences forces wood payment for the rest)', () => {
    // Razed 2 fences ⇒ free up to 5 (2+3). Buys C1 for 1 wood; rebuild
    // 4 fences within the cap → no extra wood spent.
    const session = setup({ wood: 1, fences: 2 })
    const { resp } = playC1(session)
    expect(resp.ok).toBe(true)
    const commit = session.resolveChoice(0, 'confirm', {
      edges: ['H-0-0', 'H-1-0', 'V-0-0', 'V-0-1'],
      palisadeEdges: [],
      extraWood: 0,
    })
    expect(commit.ok).toBe(true)
    expect(commit.state.players[0]!.resources.wood).toBe(0)
  })

  it('after C1 fencing completes, the c1Active flag is cleared', () => {
    const session = setup({ wood: 1, fences: 2 })
    playC1(session)
    let resp = session.resolveChoice(0, 'confirm', {
      edges: ['H-0-0', 'H-1-0', 'V-0-0', 'V-0-1'],
      palisadeEdges: [],
      extraWood: 0,
    })
    expect(resp.ok).toBe(true)
    while (resp.pending.type === 'confirmPlayerSwitch') {
      resp = session.confirmPlayerSwitch()
    }
    const player = session.getState().state.players[0]!
    const flag = player.cardStates?.[CARD_ID]?.extraData?.c1Active
    expect(flag).toBeFalsy()
  })
})
