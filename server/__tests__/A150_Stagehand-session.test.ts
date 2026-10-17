import { describe, expect, it, afterEach } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import { setWorkersAtHome } from '../../shared/domain/player'
import '../../shared/cards/A/A150_Stagehand'
import type { ActionChoiceOption } from '../../shared/contract/types'
import { confirmPlayerSwitch } from './_helpers/pending-confirms'
import assert from 'node:assert/strict'
import { assertRejectedUnchanged } from './_helpers/negative-rule-audit'
import * as audit16Build from './_helpers/audit/ae-negative-16-build'

describe('A150_Stagehand session', () => {
  const setup = (playerCount = 4, spaceId = 'traveling-players') => {
    const session = new GameSession(undefined, undefined, { playerCount })
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.currentPlayerIndex = 1

    const owner = state.players[0]!
    owner.occupationPlayed.push('A150_Stagehand')
    owner.resources = { ...owner.resources, wood: 20, clay: 10, reed: 10, stone: 10 }

    const opponent = state.players[1]!
    setWorkersAtHome(state, opponent, 2)
    const travelingPlayers = state.actionSpaces.find((s) => s.id === spaceId)
    if (!travelingPlayers) throw new Error(`${spaceId} space missing`)
    travelingPlayers.resources.food = 3

    session.loadState(state)
    return session
  }

  it('triggers when an opponent uses traveling-players', () => {
    const session = setup()
    const resp = session.takeAction(1, 'traveling-players')
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId === 'wait' ? resp.interaction.request.kind : resp.interaction.stateId).toBe('confirm-player-switch')
    if (!(resp.interaction.stateId === 'wait' && resp.interaction.request.kind === 'confirm-player-switch')) return
    expect(resp.interaction.request.fromPlayerIndex).toBe(1)
    expect(resp.interaction.request.toPlayerIndex).toBe(0)
    const grantedLog = resp.state.log.find((entry) => entry.key === 'log.cardGrantedAction')
    expect(grantedLog?.params?.player).toBe(resp.state.players[0]!.name)
  })

  it('triggers when an opponent uses traveling-players-56', () => {
    const session = setup(5, 'traveling-players-56')
    const resp = session.takeAction(1, 'traveling-players-56')
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId === 'wait' ? resp.interaction.request.kind : resp.interaction.stateId).toBe('confirm-player-switch')
  })

  it('full flow: switch to owner, skip optional choice, switch back', () => {
    const session = setup()

    let resp = session.takeAction(1, 'traveling-players')
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId === 'wait') {
      expect(resp.interaction.request.kind).toBe('confirm-player-switch')
      expect(resp.interaction.request.fromPlayerIndex).toBe(1)
      expect(resp.interaction.request.toPlayerIndex).toBe(0)
    }

    resp = confirmPlayerSwitch(session)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    expect(resp.interaction.playerIndex).toBe(0)

    // First choice: optional "do or skip" wrapping the XOR
    resp = session.resolveChoice(0, '__skip__')
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    expect(resp.interaction.request.kind).toBe('confirm-player-switch')
    expect(resp.interaction.request.fromPlayerIndex).toBe(0)
    expect(resp.interaction.request.toPlayerIndex).toBe(1)

    resp = confirmPlayerSwitch(session)
    expect(resp.interaction.stateId === 'wait' ? resp.interaction.request.kind : resp.interaction.stateId).toBe('confirm-next-player')
  })

  it('owner can choose Build Rooms (construct) from the XOR choice', () => {
    const session = setup()

    let resp = session.takeAction(1, 'traveling-players')
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId === 'wait') {
      expect(resp.interaction.request.kind).toBe('confirm-player-switch')
      expect(resp.interaction.request.fromPlayerIndex).toBe(1)
      expect(resp.interaction.request.toPlayerIndex).toBe(0)
    }

    resp = confirmPlayerSwitch(session)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return

    // One-step XOR: fence, stables, construct, skip
    const xorOptions = resp.interaction.request.options?.filter((o: ActionChoiceOption) => o.value !== '__skip__') ?? []
    expect(xorOptions.length).toBe(3)

    // Choose construct (find it by label)
    const constructOption = xorOptions.find((o: ActionChoiceOption) => o.labelKey?.includes('construct'))
    expect(constructOption).toBeDefined()
    resp = session.resolveChoice(0, constructOption!.value)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    expect(resp.interaction.request.farm.farmType).toBe('room')
    if (resp.interaction.request.farm.farmType !== 'room') return
    // Rule: Stagehand's construct does not cap room count (unlike A128/D128).
    expect(resp.interaction.request.farm.maxSelections).toBeGreaterThan(1)

    // Build a room
    resp = session.commitSelectionChoice(0, { rooms: [{ row: 0, col: 0 }] })
    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.rooms).toBe(3)

    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    expect(resp.interaction.request.kind).toBe('confirm-player-switch')
    expect(resp.interaction.request.fromPlayerIndex).toBe(0)
    expect(resp.interaction.request.toPlayerIndex).toBe(1)

    resp = confirmPlayerSwitch(session)
    expect(resp.interaction.stateId === 'wait' ? resp.interaction.request.kind : resp.interaction.stateId).toBe('confirm-next-player')
  })

  it('does not trigger when owner uses traveling-players', () => {
    const session = setup()
    const state = session.getState().state
    state.currentPlayerIndex = 0
    state.players[0]!.workersAvailable = 2
    session.loadState(state)

    const resp = session.takeAction(0, 'traveling-players')
    expect(resp.ok).toBe(true)
    // Owner using the space should NOT trigger stagehand (scope: opponent)
    expect(resp.interaction.stateId === 'wait' ? resp.interaction.request.kind : resp.interaction.stateId).not.toBe('confirm-player-switch')
  })

  it('does not trigger for non-matching action spaces', () => {
    const session = setup()
    const resp = session.takeAction(1, 'day-laborer')
    expect(resp.ok).toBe(true)
    // No player switch should happen for a different space
    expect(resp.interaction.stateId === 'wait' ? resp.interaction.request.kind : resp.interaction.stateId).not.toBe('confirm-player-switch')
  })
})

describe('ae-negative-16-build', () => {
  const { sessions, save, turn, drive, stage, offer } = audit16Build
  afterEach(()=>sessions.splice(0).forEach(s=>s.dispose()))
  it('A150 N1 actual opponent Traveling Players permits one ordinary fence stable or room action',()=>{for(const kind of['fence','stable','room'] as const){const s=stage();const pending=offer(s);const r=drive(s,pending,kind);assert.equal(r.state.players[0]!.pastures.length,kind==='fence'?1:0);assert.equal(r.state.players[0]!.stableTiles.length,kind==='stable'?1:0);assert.equal(r.state.players[0]!.rooms,kind==='room'?3:2);assert.equal(r.state.players[0]!.resources.wood,kind==='fence'?6:kind==='stable'?8:5);assert.equal(r.state.players[1]!.rooms,2);save(`A150-N1-${kind}`,{pending,r})}})
  it('A150 N2 decline own space unrelated opponent and hand do not grant construction',()=>{const s=stage();const decline=drive(s,offer(s),null);assert.equal(decline.state.players[0]!.rooms,2);assert.equal(decline.state.players[0]!.resources.wood,10);const own=turn(stage(),0,'traveling-players');assert.equal(own.state.players[0]!.rooms,2);const hs=stage(10,false);const hand=offer(hs);assert.equal(hand.state.players[0]!.rooms,2);const us=stage();turn(us,0,'day-laborer');const unrelated=turn(us,1,'fishing');assert.equal(unrelated.state.players[0]!.rooms,2);save('A150-N2',{decline,own,hand,unrelated})})
  it('A150 N3 poor owner cannot select unpaid construction and stale choice cannot repeat',()=>{const ps=stage(0);const poor=drive(ps,offer(ps),null);assert.equal(poor.state.players[0]!.rooms,2);assert.equal(poor.state.players[0]!.stableTiles.length,0);const s=stage(2);const pending=offer(s);const r=drive(s,pending,'stable');assert.equal(r.state.players[0]!.resources.wood,0);assertRejectedUnchanged(s,()=>s.resolveChoice(0,'build-another-stable'));save('A150-N3',{poor,pending,r})})
})
