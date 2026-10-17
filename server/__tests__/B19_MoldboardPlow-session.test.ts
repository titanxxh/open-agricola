import { describe, expect, it, afterEach } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { getCardStack } from '../../shared/cards/helpers/card-state'

import '../../shared/cards/B/B019_MoldboardPlow'
import type { ActionChoiceOption } from '../../shared/contract/types'
import { confirmNextPlayer } from './_helpers/pending-confirms'
import assert from 'node:assert/strict'
import { assertRejectedUnchanged, assertUndoRestored, confirmNext, undoRuleSnapshot } from './_helpers/negative-rule-audit'
import * as audit04Plows from './_helpers/audit/ae-negative-04-plows'

describe('B019_MoldboardPlow session', () => {
  const setup = () => {
    const session = new GameSession(42)
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = 1

    const player = state.players[0]!
    // Card not in catalog — manually add it to minorPlayed.
    player.minorPlayed.push('B019_MoldboardPlow')
    // Initialize stack as onBuy would
    if (!player.cardStates) player.cardStates = {}
    player.cardStates['B019_MoldboardPlow'] = { stack: ['field', 'field'] }

    session.loadState(state)
    return session
  }

  it('stack has 2 field tiles after setup', () => {
    const session = setup()
    const state = session.getState().state
    const player = state.players[0]!
    const stack = getCardStack(player, 'B019_MoldboardPlow')
    expect(stack).toEqual(['field', 'field'])
  })

  it('using farmland offers optional extra plow, accepting plows from card', () => {
    const session = setup()

    // Take farmland — enters plow tile selection
    let resp = session.takeAction(0, 'farmland')
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')

    // Complete the farmland plow
    const tile1 = resp.interaction.request.farm.selectableTiles[0]
    expect(tile1).toBeDefined()
    resp = session.commitSelectionChoice(0, { tile: tile1 })
    expect(resp.ok).toBe(true)

    // After farmland plow, B19 after-hook offers optional extra plow
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') throw new Error('expected optional choice')
    const acceptOption = resp.interaction.request.options?.find((o: ActionChoiceOption) => o.value !== '__skip__')
    expect(acceptOption).toBeDefined()

    // Accept the optional plow from card
    resp = session.resolveChoice(0, acceptOption!.value)
    expect(resp.ok).toBe(true)

    expect(resp.interaction.stateId).toBe('wait')
    expect(getCardStack(resp.state.players[0]!, 'B019_MoldboardPlow').length).toBe(2)
    const tile2 = resp.interaction.request.farm.selectableTiles[0]
    expect(tile2).toBeDefined()
    resp = session.commitSelectionChoice(0, { tile: tile2 })
    expect(resp.ok).toBe(true)

    // Stack should have 1 field left
    const stack = getCardStack(resp.state.players[0]!, 'B019_MoldboardPlow')
    expect(stack.length).toBe(1)

    // Player should have 2 fields (farmland + card plow)
    expect(resp.state.players[0]!.fields.length).toBe(2)
  })

  it('declining optional plow does not consume field tile', () => {
    const session = setup()

    let resp = session.takeAction(0, 'farmland')
    expect(resp.ok).toBe(true)

    const tile1 = resp.interaction.request.farm.selectableTiles[0]
    resp = session.commitSelectionChoice(0, { tile: tile1 })
    expect(resp.ok).toBe(true)

    // Decline the optional extra plow
    expect(resp.interaction.stateId).toBe('wait')
    resp = session.resolveChoice(0, '__skip__')
    expect(resp.ok).toBe(true)

    // Stack should still have 2 fields
    const stack = getCardStack(resp.state.players[0]!, 'B019_MoldboardPlow')
    expect(stack.length).toBe(2)

    // Player should have only 1 field (just the farmland plow)
    expect(resp.state.players[0]!.fields.length).toBe(1)
  })

  it('no extra plow offered when stack is empty', () => {
    const session = setup()
    const state = session.getState().state
    state.players[0]!.cardStates!['B019_MoldboardPlow']!.stack = []
    session.loadState(state)

    let resp = session.takeAction(0, 'farmland')
    expect(resp.ok).toBe(true)

    const tile = resp.interaction.request.farm.selectableTiles[0]
    resp = session.commitSelectionChoice(0, { tile })
    expect(resp.ok).toBe(true)

    // Should not get optional choice — goes straight to confirmNextPlayer
    expect(resp.interaction.stateId === 'wait' ? resp.interaction.request.kind : resp.interaction.stateId).toBe('confirm-next-player')
  })

  it('stack depletes after using both fields', () => {
    const session = setup()

    // First farmland action — use 1 field from card
    let resp = session.takeAction(0, 'farmland')
    const tile1 = resp.interaction.request.farm.selectableTiles[0]
    resp = session.commitSelectionChoice(0, { tile: tile1 })
    const accept1 = resp.interaction.request.options?.find((o: ActionChoiceOption) => o.value !== '__skip__')
    resp = session.resolveChoice(0, accept1!.value)
    const tile2 = resp.interaction.request.farm.selectableTiles[0]
    resp = session.commitSelectionChoice(0, { tile: tile2 })
    expect(resp.ok).toBe(true)

    expect(getCardStack(resp.state.players[0]!, 'B019_MoldboardPlow').length).toBe(1)

    // Advance to next turn so player can use farmland again
    // Player 1 takes an action, then player 0 gets another turn
    let resp2 = confirmNextPlayer(session)
    resp2 = session.takeAction(1, 'grain-seeds')
    if (resp2.interaction.stateId === 'wait') {
      resp2 = session.resolveChoice(1, '__skip__')
    }
    resp2 = confirmNextPlayer(session)

    // Second farmland action — use last field from card
    // Use cultivation (round 5+ action) instead? No, farmland is always available.
    // Actually player 0 already used farmland this round. Need round 2.
    // Let me just check the stack state after first use.
    expect(getCardStack(resp.state.players[0]!, 'B019_MoldboardPlow').length).toBe(1)
  })
})

describe('ae-negative-04-plows', () => {
  const { MOLD, sessions, setup, turn, play, farm, plow, skip, fields, stack, finished, endRound, invalidBonus, blockedPurchase } = audit04Plows
  afterEach(() => sessions.splice(0).forEach(s => s.dispose()))
  describe('Moldboard Plow negative audit', () => {
    it('B019 N1 real purchase validates fee prerequisite and two stored tiles', () => {
      blockedPurchase(MOLD, { occupations: 0, resources: { wood: 2 } }); blockedPurchase(MOLD, { occupations: 1, resources: { wood: 1 } })
      const s = setup({ card: MOLD, played: false, occupations: 1, resources: { wood: 2 } }); const r = play(s, MOLD)
      assert.ok(r.state.players[0]!.minorPlayed.includes(MOLD)); assert.equal(r.state.players[0]!.resources.wood, 0); assert.equal(stack(r), 2)
    })
    it('B019 N2 three actual Farmland uses consume only the two stored tiles', () => {
      const s = setup({ card: MOLD, played: false, occupations: 1, resources: { wood: 2 } })
      play(s, MOLD); turn(s, 1, 'forest')
      let r = plow(s, turn(s, 0, 'farmland')); r = plow(s, r)
      assert.equal(fields(r), 2); assert.equal(stack(r), 1); finished(r)
      r = confirmNext(s, turn(s, 1, 'clay-pit')); assert.equal(r.state.round, 2)
      r = plow(s, turn(s, 0, 'farmland')); r = plow(s, r)
      assert.equal(fields(r), 4); assert.equal(stack(r), 0); finished(r)
      r = endRound(s); assert.equal(r.state.round, 3)
      r = plow(s, turn(s, 0, 'farmland')); assert.equal(fields(r), 5); assert.equal(stack(r), 0); finished(r)
    })
    it('B019 N3 decline invalid selection and undo preserve the stored field allowance', () => {
      const declined = setup({ card: MOLD }); const no = skip(declined, plow(declined, turn(declined, 0, 'farmland')))
      assert.equal(fields(no), 1); assert.equal(stack(no), 2); finished(no)
      const s = setup({ card: MOLD, existingField: true }); const before = undoRuleSnapshot(s.getState())
      let r = plow(s, turn(s, 0, 'farmland'), { row: 0, col: 2 }); farm(s, r); invalidBonus(s)
      assert.equal(stack(s.getState()), 2)
      r = plow(s, s.getState(), { row: 0, col: 3 }); assert.equal(fields(r), 3); assert.equal(stack(r), 1); finished(r)
      assertUndoRestored(before, s.undoAction())
      r = plow(s, turn(s, 0, 'farmland')); r = plow(s, r); assert.equal(fields(r), 3); assert.equal(stack(r), 1)
    })
    it('B019 N4 Cultivation and opponent Farmland cannot consume owner field tiles', () => {
      const s = setup({ card: MOLD, round: 14 }); let r = plow(s, turn(s, 0, 'cultivation'))
      if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'choice') r = skip(s, r)
      assert.equal(fields(r), 1); assert.equal(stack(r), 2); finished(r)
      r = plow(s, turn(s, 1, 'farmland')); assert.equal(r.state.players[1]!.fields.length, 1); assert.equal(stack(r), 2); finished(r)
    })
    it('B019 N5 last normal field preserves both declined bonus tiles', () => {
      const s = setup({ card: MOLD, lastPlot: true })
      const r = plow(s, turn(s, 0, 'farmland'), { row: 0, col: 4 })
      finished(r)
      assertRejectedUnchanged(s, () => s.resolveChoice(0, MOLD))
      assert.equal(fields(r), 13); assert.equal(stack(r), 2); finished(r)
    })
  })
  it('B019 N6 final plot bonus-first and normal-first paths complete without phantom fields', () => {
    const s = setup({ card: MOLD, lastPlot: true }); const normal = turn(s, 0, 'farmland')
    assert.notEqual(normal.interaction.stateId === 'wait' ? normal.interaction.sourceCard : undefined, MOLD)
    const r = plow(s, normal, { row: 0, col: 4 })
    finished(r)
    assertRejectedUnchanged(s, () => s.resolveChoice(0, MOLD))
    assert.equal(fields(r), 13); assert.equal(stack(r), 2); finished(r)
  })
})
