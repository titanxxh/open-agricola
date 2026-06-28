import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'
import { getFenceCount } from '../../shared/actions/effects/fencing'
import { confirmPlayerSwitch } from './_helpers/pending-confirms'

import '../../shared/cards/C/C016_FieldFences'

const CARD_ID = 'C016_FieldFences'

const setup = (opts: { wood: number; withField?: boolean; food?: number }) => {
  const session = new GameSession()
  const state = session.getState().state
  state.players = state.players.slice(0, 2)
  state.currentPlayerIndex = 0
  state.round = 1

  const player = state.players[0]!
  setWorkersAtHome(state, player, 2)
  player.resources = {
    ...player.resources,
    wood: opts.wood,
    food: opts.food ?? 2,
  }
  player.minorHand = [CARD_ID]

  if (opts.withField) {
    player.fields = [{ row: 0, col: 1, crop: null, remaining: 0 } as never]
  }

  session.loadState(state)
  return session
}

const playC16 = (session: GameSession): void => {
  // meeting-place: SEQ(set-first-player, optional minor-improvement)
  let resp = session.takeAction(0, 'meeting-place')
  expect(resp.ok).toBe(true)

  // Drive the prompt chain until we land on the fencing farm-select prompt
  // (interaction.stateId === 'wait'). Along the way we:
  //   - accept any optional-action wrapper ("action-…" / "accept")
  //   - pick C16 from the minor-improvement options
  //   - accept C16's own SEQ-optional wrapper before the fencing leaf
  let safety = 0
  while (resp.interaction.stateId === 'wait' && safety < 12) {
    safety += 1
    if (resp.interaction.request.kind !== 'choice') break
    const opts = (resp.interaction.options ?? []).map((o) => o.value)
    const cardOption = opts.find((v) => v === `minor:${CARD_ID}`)
    if (cardOption) {
      resp = session.resolveChoice(0, cardOption)
      continue
    }
    // Accept any non-skip prompt (optional accept etc.). __skip__ is decline.
    const acceptOption = opts.find((v) => v !== '__skip__')
    if (acceptOption) {
      resp = session.resolveChoice(0, acceptOption)
      continue
    }
    break
  }
  expect(resp.ok).toBe(true)
}

describe('C16 FieldFences session', () => {
  it('costs 2 food and triggers an optional fencing prompt', () => {
    const session = setup({ wood: 4, withField: false, food: 2 })
    playC16(session)
    const state = session.getState().state
    const player = state.players[0]!
    expect(player.minorPlayed).toContain(CARD_ID)
    expect(player.resources.food).toBe(0)
    // After buying C16, the engine should be waiting on the fencing
    // farm-select prompt (or an accept/decline wrapper around it).
    expect(session.getState().interaction.stateId).toBe('wait')
  })

  it('field-adjacent edges are free of wood; non-adjacent edges still cost wood', () => {
    // field at (0,1) → its edges: H-0-1, H-1-1, V-0-1, V-0-2
    // We fence tile (0,0): edges H-0-0, H-1-0, V-0-0, V-0-1
    // Overlap with field-adjacent set = { V-0-1 } → discount 1
    // Total fences = 4, payable = 4 - 1 = 3 wood
    const session = setup({ wood: 3, withField: true })
    playC16(session)

    const resp = session.commitSelectionChoice(0, {
      edges: ['H-0-0', 'H-1-0', 'V-0-0', 'V-0-1'],
      palisadeEdges: [],
      extraWood: 0,
    })
    expect(resp.ok).toBe(true)

    const player = resp.state.players[0]!
    expect(getFenceCount(player)).toBe(4)
    expect(player.resources.wood).toBe(0) // 3 - 3 paid = 0
    expect(player.pastures).toHaveLength(1)
  })

  it('without C16 the same selection costs full 4 wood (no discount)', () => {
    // No card → control: no discount, need 4 wood for 4 fences.
    // Use takeAction('fencing') directly so we exercise the same edges.
    const session = setup({ wood: 4, withField: true, food: 0 })
    const state = session.getState().state
    const player = state.players[0]!
    player.minorHand = []
    session.loadState(state)

    let resp = session.takeAction(0, 'fencing')
    expect(resp.ok).toBe(true)
    resp = session.commitSelectionChoice(0, {
      edges: ['H-0-0', 'H-1-0', 'V-0-0', 'V-0-1'],
      palisadeEdges: [],
      extraWood: 0,
    })
    expect(resp.ok).toBe(true)
    const after = resp.state.players[0]!
    expect(after.resources.wood).toBe(0)
    expect(getFenceCount(after)).toBe(4)
  })

  it('three field-adjacent + one non-adjacent: pays 1 wood for non-adjacent only', () => {
    // Fields at (0,0), (0,2), (1,1); enclose tile (0,1).
    // Edges of (0,1): H-0-1 (top, NO field neighbour, top of board not a field),
    //                 H-1-1 (shared with field (1,1) — discount),
    //                 V-0-1 (shared with field (0,0) — discount),
    //                 V-0-2 (shared with field (0,2) — discount).
    // → 3 free + 1 paid = 1 wood total.
    const session = setup({ wood: 1, withField: true })
    const state = session.getState().state
    const player = state.players[0]!
    player.fields = [
      { row: 0, col: 0, crop: null, remaining: 0 } as never,
      { row: 0, col: 2, crop: null, remaining: 0 } as never,
      { row: 1, col: 1, crop: null, remaining: 0 } as never,
    ]
    session.loadState(state)

    playC16(session)

    const resp = session.commitSelectionChoice(0, {
      edges: ['H-0-1', 'H-1-1', 'V-0-1', 'V-0-2'],
      palisadeEdges: [],
      extraWood: 0,
    })
    expect(resp.ok).toBe(true)
    const after = resp.state.players[0]!
    expect(after.resources.wood).toBe(0)
    expect(getFenceCount(after)).toBe(4)
  })

  it('after C16 fencing completes, the field-adjacent discount is no longer active', () => {
    // Run C16, complete fencing, then take a regular fencing action and
    // confirm the discount no longer applies.
    const session = setup({ wood: 5, withField: true })
    playC16(session)

    let resp = session.commitSelectionChoice(0, {
      edges: ['H-0-0', 'H-1-0', 'V-0-0', 'V-0-1'],
      palisadeEdges: [],
      extraWood: 0,
    })
    expect(resp.ok).toBe(true)
    // Used 3 wood (4 - 1 field-adjacent), 5 - 3 = 2 left
    expect(resp.state.players[0]!.resources.wood).toBe(2)

    // Walk past any switch / done pendings until back to 'none'
    while (resp.interaction.stateId === 'wait' && resp.interaction.request.kind === 'confirm-player-switch') {
      resp = confirmPlayerSwitch(session)
    }

    // Now ensure flag cleared by inspecting cardState
    const after = session.getState().state.players[0]!
    const flag = after.cardStates?.[CARD_ID]?.extraData?.c16Active
    expect(flag).toBeFalsy()
  })
})
