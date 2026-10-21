import { completePlowUse } from './_helpers/plow-use'
import { describe, expect, it, afterEach } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { getCardStack } from '../../shared/cards/helpers/card-state'

import '../../shared/cards/B/B019_MoldboardPlow'
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
    const response = completePlowUse(session, session.takeAction(0, 'farmland'), 'B019_MoldboardPlow', 1)
    expect(response.ok, response.error).toBe(true)
    expect(getCardStack(response.state.players[0]!, 'B019_MoldboardPlow')).toHaveLength(1)
    expect(response.state.players[0]!.fields).toHaveLength(2)
  })

  it('declining optional plow does not consume field tile', () => {
    const session = setup()
    const response = completePlowUse(session, session.takeAction(0, 'farmland'), 'B019_MoldboardPlow', 0)
    expect(getCardStack(response.state.players[0]!, 'B019_MoldboardPlow')).toHaveLength(2)
    expect(response.state.players[0]!.fields).toHaveLength(1)
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
    const session = audit04Plows.setup({ card: 'B019_MoldboardPlow' })
    let response = completePlowUse(session, audit04Plows.turn(session, 0, 'farmland'), 'B019_MoldboardPlow', 1)
    expect(getCardStack(response.state.players[0]!, 'B019_MoldboardPlow')).toHaveLength(1)
    audit04Plows.endRound(session)
    response = completePlowUse(session, audit04Plows.turn(session, 0, 'farmland'), 'B019_MoldboardPlow', 1)
    expect(getCardStack(response.state.players[0]!, 'B019_MoldboardPlow')).toHaveLength(0)
    expect(response.state.players[0]!.fields).toHaveLength(4)
    session.dispose()
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
      const declined = setup({ card: MOLD }); const no = plow(declined, skip(declined, turn(declined, 0, 'farmland')))
      assert.equal(fields(no), 1); assert.equal(stack(no), 2); finished(no)
      const s = setup({ card: MOLD, existingField: true }); const before = undoRuleSnapshot(s.getState())
      let r = plow(s, turn(s, 0, 'farmland'), { row: 0, col: 2 }); farm(s, r); invalidBonus(s)
      assert.equal(stack(s.getState()), 1)
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
      const r = plow(s, skip(s, turn(s, 0, 'farmland')), { row: 0, col: 4 })
      finished(r)
      assertRejectedUnchanged(s, () => s.resolveChoice(0, MOLD))
      assert.equal(fields(r), 13); assert.equal(stack(r), 2); finished(r)
    })
  })
  it('B019 N6 the stored field can fill the final plot before its satisfied Farmland host', () => {
    const s = setup({ card: MOLD, lastPlot: true }); let normal = turn(s, 0, 'farmland')
    if (normal.interaction.stateId === 'wait' && normal.interaction.request.kind === 'select-trigger') {
      const source = normal.interaction.request.options.find(option => option.sourceCard === MOLD)!
      normal = s.resolveChoice(0, source.value)
    }
    assert.equal(normal.interaction.stateId === 'wait' ? normal.interaction.sourceCard : undefined, MOLD)
    const r = plow(s, normal, { row: 0, col: 4 })
    finished(r)
    assertRejectedUnchanged(s, () => s.resolveChoice(0, MOLD))
    assert.equal(fields(r), 13); assert.equal(stack(r), 1); finished(r)
    assert.equal(r.state.events.filter(event => event.type === 'farm.fieldPlowed' && event.sourceCardId === MOLD).length, 1)
  })
})
