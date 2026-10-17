import { describe, expect, it, afterEach } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { runCardEffectHook } from '../../shared/cards/card-effects'

import { setWorkersAtHome } from '../../shared/domain/player'
import '../../shared/cards/A/A121_ClayPuncher'
import type { ActionChoiceOption } from '../../shared/contract/types'
import type { ActionFlow } from '../../shared/contract/types'
import { confirmPlayerSwitch } from './_helpers/pending-confirms'
import assert from 'node:assert/strict'
import { assertRejectedUnchanged } from './_helpers/negative-rule-audit'
import * as audit14Spaces from './_helpers/audit/ae-negative-14-spaces'

describe('A121_ClayPuncher session', () => {
  const setup = (playerCount: number = 2) => {
    const session = new GameSession(undefined, undefined, { playerCount })
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, playerCount)
    state.currentPlayerIndex = 0
    state.round = 1

    const player = state.players[0]!
    player.occupationHand.push('A121_ClayPuncher')
    setWorkersAtHome(state, player, 2)
    player.resources.clay = 0
    player.resources.food = 5

    for (const otherPlayer of state.players.slice(1)) {
      otherPlayer.workersAvailable = 2
    }

    // Ensure clay-pit has accumulated resources
    const clayPit = state.actionSpaces.find((s) => s.id === 'clay-pit')
    if (clayPit) clayPit.resources.clay = 2

    session.loadState(state)
    session.devPlayCard(0, 'A121_ClayPuncher')
    return session
  }

  it('onBuy grants 1 clay', () => {
    const session = setup()
    const state = session.getState().state
    const player = state.players[0]!
    const flow = session.withCtx(() => runCardEffectHook(state, player, 'A121_ClayPuncher', 'onBuy'))
    expect(flow).not.toBeNull()
    expect(flow!.type).toBe('leaf')
    expect((flow as Extract<ActionFlow, { type: 'leaf' }>).actionId).toBe('gain')
    expect((flow as Extract<ActionFlow, { type: 'leaf' }>).params).toEqual({ clay: 1 })
  })

  it('gains 1 extra clay when using clay-pit', () => {
    const session = setup()
    const state = session.getState().state
    const clayBefore = state.players[0]!.resources.clay
    session.loadState(state)

    const resp = session.takeAction(0, 'clay-pit')
    expect(resp.ok).toBe(true)

    const after = session.getState().state
    // 2 accumulated clay + 1 bonus from ClayPuncher = 3
    expect(after.players[0]!.resources.clay).toBe(clayBefore + 2 + 1)
  })

  it('gains 1 extra clay when using lessons', () => {
    const session = setup()
    const state = session.getState().state
    const player = state.players[0]!
    // Need an occupation in hand for lessons to be usable (must be in catalog)
    player.occupationHand = ['A093_BedMaker', 'A110_Roughcaster']
    const clayBefore = player.resources.clay
    session.loadState(state)

    let resp = session.takeAction(0, 'lessons')
    expect(resp.ok).toBe(true)

    // lessons action prompts for occupation choice
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId === 'wait') {
      const option = resp.interaction.request.options?.find((o: ActionChoiceOption) => o.value === 'A093_BedMaker')
      expect(option).toBeDefined()
      resp = session.resolveChoice(0, option!.value)
    }

    // Walk through player switches
    while (resp.interaction.stateId === 'wait' && resp.interaction.request.kind === 'confirm-player-switch') {
      resp = confirmPlayerSwitch(session)
    }

    const after = session.getState().state
    // Should have gained 1 clay from ClayPuncher trigger on lessons
    expect(after.players[0]!.resources.clay).toBe(clayBefore + 1)
  })

  it('gains 1 extra clay when using lessons-3', () => {
    const session = setup(3)
    const state = session.getState().state
    const player = state.players[0]!
    player.occupationHand = ['A093_BedMaker', 'A110_Roughcaster']
    const clayBefore = player.resources.clay
    session.loadState(state)

    let resp = session.takeAction(0, 'lessons-3')
    expect(resp.ok).toBe(true)

    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId === 'wait') {
      const option = resp.interaction.request.options?.find((o: ActionChoiceOption) => o.value === 'A093_BedMaker')
      expect(option).toBeDefined()
      resp = session.resolveChoice(0, option!.value)
    }

    while (resp.interaction.stateId === 'wait' && resp.interaction.request.kind === 'confirm-player-switch') {
      resp = confirmPlayerSwitch(session)
    }

    const after = session.getState().state
    expect(after.players[0]!.resources.clay).toBe(clayBefore + 1)
  })

  it('does not trigger on non-matching spaces', () => {
    const session = setup()
    const state = session.getState().state
    const clayBefore = state.players[0]!.resources.clay
    session.loadState(state)

    const resp = session.takeAction(0, 'day-laborer')
    expect(resp.ok).toBe(true)

    const after = session.getState().state
    expect(after.players[0]!.resources.clay).toBe(clayBefore)
  })
})

describe('ae-negative-14-spaces', () => {
  const { PUNCH, sessions, save, ok, setup, turn } = audit14Spaces
  afterEach(()=>sessions.splice(0).forEach(s=>s.dispose()))
  it('A121 N1 real first Lessons purchase grants onBuy and completed Lessons clay separately',()=>{const s=setup(PUNCH,undefined,false);const pending=turn(s,0,'lessons');assert.equal(pending.state.players[0]!.resources.clay,0);assert.ok(pending.interaction.stateId==='wait'&&pending.interaction.request.kind==='choice');const r=ok(s.resolveChoice(0,PUNCH));assert.equal(r.state.players[0]!.resources.clay,2);assert.equal(r.state.players[0]!.resources.food,40);save('A121-N1',{pending,r})})
  it('A121 N2 Clay Pit plus one bonus and later Lessons plus one bonus',()=>{const s=setup(PUNCH);const clay=turn(s,0,'clay-pit');assert.equal(clay.state.players[0]!.resources.clay,2);turn(s,1,'grain-seeds');let r=turn(s,0,'lessons');if(!r.state.players[0]!.occupationPlayed.includes('A110_Roughcaster'))r=ok(s.resolveChoice(0,'A110_Roughcaster'));assert.equal(r.state.players[0]!.resources.clay,3);assert.equal(r.state.players[0]!.resources.food,39);save('A121-N2',{clay,r})})
  it('A121 N3 unrelated hand and opponent use cannot grant owner clay',()=>{const basic=turn(setup(PUNCH),0,'day-laborer');assert.equal(basic.state.players[0]!.resources.clay,0);const hand=turn(setup(PUNCH,undefined,false),0,'clay-pit');assert.equal(hand.state.players[0]!.resources.clay,1);const s=setup(PUNCH);turn(s,0,'grain-seeds');const other=turn(s,1,'clay-pit');assert.equal(other.state.players[0]!.resources.clay,0);assert.equal(other.state.players[1]!.resources.clay,1);save('A121-N3',{basic,hand,other})})
  it('A121 N4 occupied source wrong actor and undo cannot duplicate clay bonus',()=>{const s=setup(PUNCH);const first=turn(s,0,'clay-pit');assertRejectedUnchanged(s,()=>s.takeAction(0,'clay-pit'));const undone=ok(s.undoAction());assert.equal(undone.state.players[0]!.resources.clay,0);assert.equal(undone.state.actionSpaces.find(a=>a.id==='clay-pit')!.resources.clay,1);const retry=turn(s,0,'clay-pit');assert.equal(retry.state.players[0]!.resources.clay,2);save('A121-N4',{first,undone,retry})})
})
