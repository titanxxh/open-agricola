import type { GameSession, SessionResponse } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'

import { describe, expect, it, afterEach } from 'vitest'
import { createWorkSession } from './_helpers/session-fixtures'
import { isCardFlagged } from '../../shared/cards/helpers/card-state'

import '../../shared/cards/A/A153_PigOwner'
import type { AnytimeAction } from '../../shared/contract/types';
import assert from 'node:assert/strict'
import { assertRejectedUnchanged } from './_helpers/negative-rule-audit'
import * as audit16Animals from './_helpers/audit/ae-negative-16-animals'

const CARD_ID = 'A153_PigOwner'
const directSessions: GameSession[] = []
afterEach(() => { for (const session of directSessions.splice(0)) session.dispose() })
const track = (session: GameSession) => { directSessions.push(session); return session }

describe('A153_PigOwner session', () => {
  const setup = (boar = 0) => {
    return track(createWorkSession({ seed: 42, configure(state) {
      const player = state.players[0]!
      player.occupationPlayed = [CARD_ID]
      player.resources.boar = boar
      if (boar > 0) {
        player.pastures = [{ id: 'pigs',
          tiles: [{ row: 0, col: 2 }, { row: 0, col: 3 }, { row: 0, col: 4 }],
          animalType: 'boar', animalCount: boar }]
        player.fenceSegments = ['H-0-2', 'H-0-3', 'H-0-4', 'H-1-2', 'H-1-3', 'H-1-4', 'V-0-2', 'V-0-5']
          .map(edge => ({ edge, type: 'fence' }))
      }
    } }))
  }

  const enterActiveInteraction = (session: GameSession) => {
    const resp = session.takeAction(0, 'farmland')
    expect(resp.ok).toBe(true)
    return resp
  }

  it('not available with < 5 boar', () => {
    const session = setup(4)
    const resp = enterActiveInteraction(session)
    const anytimeIds = resp.interaction.anytimeActions.map((a: AnytimeAction) => a.id)
    expect(anytimeIds).not.toContain('A153-pig-owner-anytime')
  })

  it('available with >= 5 boar, grants 3 VP', () => {
    const session = setup(5)
    const resp = enterActiveInteraction(session)
    const anytimeIds = resp.interaction.anytimeActions.map((a: AnytimeAction) => a.id)
    expect(anytimeIds).toContain('A153-pig-owner-anytime')

    const resp2 = session.takeAnytimeAction(0, 'A153-pig-owner-anytime')
    expect(resp2.ok).toBe(true)
    expect(resp2.state.players[0]!.cardStates?.A153_PigOwner?.counters?.bonusVp).toBe(3)
  })

  it('not available after flagged (one-time)', () => {
    const session = setup(5)
    enterActiveInteraction(session)

    const resp2 = session.takeAnytimeAction(0, 'A153-pig-owner-anytime')
    expect(resp2.ok).toBe(true)
    expect(isCardFlagged(resp2.state.players[0]!, CARD_ID)).toBe(true)

    // Should no longer appear in anytime actions
    const anytimeIds = resp2.interaction.anytimeActions.map((a: AnytimeAction) => a.id)
    expect(anytimeIds).not.toContain('A153-pig-owner-anytime')
  })
})

describe('A153 Pig Owner parity', () => {
  const CARD_ID = 'A153_PigOwner'

  const ANYTIME_ID = 'A153-pig-owner-anytime'

  const FILLER = '__test_placeholder__'

  const setup = ({ played = true, pigs = 0 } = {}) => {
    return track(createWorkSession({ seed: 6153, options: { playerCount: 4 }, configure(state) {
    state.currentPlayerIndex = 0
    state.round = 14
    state.roundPhase = 'work'
    state.players.forEach((player) => {
      setWorkersAtHome(state, player, 2)
      player.minorHand = [FILLER]
      player.occupationHand = [FILLER]
      player.minorPlayed = []
      player.occupationPlayed = []
      player.resources = {
        ...player.resources, wood: 0, clay: 0, reed: 0, stone: 0, food: 0, grain: 0,
        vegetable: 0, sheep: 0, boar: 0, cattle: 0,
      }
    })
    const player = state.players[0]!
    player.occupationHand = played ? [FILLER] : [CARD_ID]
    player.occupationPlayed = played ? [CARD_ID] : []
    player.pastures = pigs > 0 ? [{
      id: 'pig-owner-pasture',
      tiles: [{ row: 0, col: 3 }],
      animalType: 'boar',
      animalCount: Math.min(pigs, 4),
    }] : []
    player.stableTiles = pigs >= 4 ? [{ row: 0, col: 3 }] : []
    player.fenceSegments = pigs > 0
      ? ['H-0-3', 'H-1-3', 'V-0-3', 'V-0-4'].map(edge => ({ edge, type: 'fence' })) : []
    const petRoom = [...player.roomTiles].sort((a, b) => a.col - b.col || b.row - a.row)[0]!
    player.houseAnimals = pigs >= 5 ? { [`${petRoom.row}-${petRoom.col}`]: 'boar' } : {}
    player.stableAnimals = {}
    player.resources.boar = pigs
    } }))
  }

  const enterInteraction = (session: GameSession): SessionResponse => {
    const response = session.takeAction(0, 'day-laborer')
    expect(response.ok, response.error).toBe(true)
    return response
  }

  const anytimeIds = (response: SessionResponse) => response.interaction.anytimeActions
    .map((action) => action.id)

  it('A153 S2: four pigs on the farm do not provide the Pig Owner anytime action', () => {
    const response = enterInteraction(setup({ pigs: 4 }))

    expect(anytimeIds(response)).not.toContain(ANYTIME_ID)
    expect(response.state.players[0]!.cardStates[CARD_ID]?.counters?.bonusVp ?? 0).toBe(0)
  })

  it('A153 S3: five pigs across pasture and house grant three bonus points', () => {
    const session = setup({ pigs: 5 })
    const entered = enterInteraction(session)
    expect(anytimeIds(entered)).toContain(ANYTIME_ID)

    const response = session.takeAnytimeAction(0, ANYTIME_ID)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.cardStates[CARD_ID]?.counters?.bonusVp).toBe(3)
    expect(isCardFlagged(response.state.players[0]!, CARD_ID)).toBe(true)
  })

  it('A153 S4: Pig Owner can score only once', () => {
    const session = setup({ pigs: 5 })
    enterInteraction(session)

    const response = session.takeAnytimeAction(0, ANYTIME_ID)

    expect(anytimeIds(response)).not.toContain(ANYTIME_ID)
    expect(response.state.players[0]!.cardStates[CARD_ID]?.counters?.bonusVp).toBe(3)
  })
})

describe('ae-negative-16-animals', () => {
  const { PIG, ANY, sessions, save, ok, turn, finish, pig, points } = audit16Animals
  afterEach(()=>sessions.splice(0).forEach(s=>s.dispose()))
  it('A153 N1 four farm pigs never unlock the three point reward',()=>{const s=pig(4),r=finish(s,turn(s,0,'day-laborer'));assert.ok(!r.interaction.anytimeActions.some(a=>a.id===ANY));assertRejectedUnchanged(s,()=>s.takeAnytimeAction(0,ANY));assert.equal(points(r),0);save('A153-N1',r)})
  it('A153 N2 five pigs across finite stable pasture and house award owner three points once',()=>{const s=pig(5);const entered=finish(s,turn(s,0,'day-laborer'));assert.ok(entered.interaction.anytimeActions.some(a=>a.id===ANY));const r=ok(s.takeAnytimeAction(0,ANY));assert.equal(points(r),3);assert.equal(isCardFlagged(r.state.players[0]!,PIG),true);assert.equal(r.state.players[0]!.resources.boar,5);assertRejectedUnchanged(s,()=>s.takeAnytimeAction(0,ANY));assert.equal(points(s.getState()),3);save('A153-N2',{entered,r})})
  it('A153 N3 hand and actual wrong actor cannot claim five pig owner reward',()=>{const hs=pig(5,false),hand=finish(hs,turn(hs,0,'day-laborer'));assert.ok(!hand.interaction.anytimeActions.some(a=>a.id===ANY));const s=pig(5);finish(s,turn(s,0,'day-laborer'));assertRejectedUnchanged(s,()=>s.takeAnytimeAction(1,ANY));const r=ok(s.takeAnytimeAction(0,ANY));assert.equal(points(r),3);save('A153-N3',{hand,r})})
})
