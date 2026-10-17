import { describe, expect, it, afterEach } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import { setWorkersAtHome } from '../../shared/domain/player'
import { B051_DiggingSpade } from '../../shared/cards/B/B051_DiggingSpade'
import { meetsCardPrerequisites } from '../../shared/cards/helpers/prerequisites'
import assert from 'node:assert/strict'
import { assertRejectedUnchanged } from './_helpers/negative-rule-audit'
import * as audit20Collect from './_helpers/audit/ae-negative-20-collect'

const CARD_ID = 'B051_DiggingSpade'

describe('B051_DiggingSpade session', () => {
  const setup = (pigsInPasture: number) => {
    const session = new GameSession(42)
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = 7

    const player = state.players[0]!
    player.minorPlayed.push(CARD_ID)
    setWorkersAtHome(state, player, 2) // Add a pasture with `pigsInPasture` boar
    if (pigsInPasture > 0) {
      player.pastures = [
        {
          id: 'p1',
          size: 1,
          tiles: [{ row: 1, col: 3 }],
          stables: 0,
          animalType: 'boar',
          animalCount: pigsInPasture,
        },
      ]
    }

    // Accumulate clay on clay-pit
    const clayPit = state.actionSpaces.find((s) => s.id === 'clay-pit')
    if (clayPit) clayPit.resources.clay = 2

    state.players[1]!.workersAvailable = 2

    session.loadState(state)
    return session
  }

  it('grants FOOD equal to pigs when using clay-pit', () => {
    const session = setup(3)
    const before = session.getState().state.players[0]!.resources.food
    const resp = session.takeAction(0, 'clay-pit')
    expect(resp.ok).toBe(true)
    const after = resp.state.players[0]!
    // Expect 2 clay from accumulation, +3 food from Digging Spade
    expect(after.resources.clay).toBe(2)
    expect(after.resources.food).toBe(before + 3)
  })

  it('no food when no pigs in farmyard', () => {
    const session = setup(0)
    const before = session.getState().state.players[0]!.resources.food
    const resp = session.takeAction(0, 'clay-pit')
    expect(resp.ok).toBe(true)
    const after = resp.state.players[0]!
    expect(after.resources.food).toBe(before)
  })

  it('does not trigger on non-clay accumulation spaces', () => {
    const session = setup(3)
    const before = session.getState().state.players[0]!.resources.food
    const resp = session.takeAction(0, 'forest')
    expect(resp.ok).toBe(true)
    const after = resp.state.players[0]!
    expect(after.resources.food).toBe(before)
  })

  describe('prerequisite "Play in Round 7 or Later"', () => {
    it('blocks when round < 7', () => {
      const session = new GameSession(42)
      stabilizeRandomHands(session.state.players)
      const state = session.getState().state
      state.round = 6
      const player = state.players[0]!
      expect(session.withCtx(() => meetsCardPrerequisites(player, B051_DiggingSpade, state.round, state))).toBe(false)
    })

    it('allows when round >= 7', () => {
      const session = new GameSession(42)
      stabilizeRandomHands(session.state.players)
      const state = session.getState().state
      state.round = 7
      const player = state.players[0]!
      expect(session.withCtx(() => meetsCardPrerequisites(player, B051_DiggingSpade, state.round, state))).toBe(true)
    })
  })
})

describe('ae-negative-20-collect', () => {
  const { SPADE, sessions, save, ok, setup, turn, purchaseMenu, buy, owner, boar } = audit20Collect
  afterEach(()=>sessions.splice(0).forEach(s=>s.dispose()))
  it('B051 N1 actual one wood purchase starts at round seven and before seven or missing wood refuses',()=>{const s=setup(SPADE,state=>state.players[0]!.resources.wood=1,7),{pending,r}=buy(s,SPADE);assert.equal(r.state.players[0]!.resources.wood,0);assert.equal(r.state.players[0]!.resources.food,100);save('B051-N1',{pending,r});for(const[round,wood]of[[6,1],[7,0]]){const ss=setup(SPADE,state=>state.players[0]!.resources.wood=wood!,round),denied=purchaseMenu(ss);assertRejectedUnchanged(ss,()=>ss.resolveChoice(0,SPADE));const legal=ok(ss.resolveChoice(0,'B004_WoodPile'));assert.equal(legal.state.players[0]!.resources.food,100);save(`B051-N1-${round}-${wood}`,{denied,legal})}})
  it('B051 N2 clay accumulation pays food for zero through four legally housed boar only',()=>{for(const n of[0,1,2,3,4]){const s=setup(SPADE,state=>{state.players[0]!.resources.wood=1;boar(state,n)});buy(s,SPADE);const before=owner(s),r=turn(s,0,'clay-pit');assert.equal(r.state.players[0]!.resources.food,before.state.players[0]!.resources.food+n);assert.equal(r.state.players[0]!.resources.boar,n);assert.equal(r.state.players[1]!.resources.food,before.state.players[1]!.resources.food);save(`B051-N2-${n}`,{before,r})}})
  it('B051 N3 opponent clay unrelated action and card in hand cannot grant owner boar food',()=>{const hand=turn(setup(SPADE,state=>boar(state,1)),0,'clay-pit');assert.equal(hand.state.players[0]!.resources.food,100);const s=setup(SPADE,state=>{state.players[0]!.resources.wood=1;boar(state,3)});buy(s,SPADE);const other=turn(s,1,'clay-pit'),unrelated=turn(s,0,'forest');assert.equal(other.state.players[0]!.resources.food,100);assert.equal(other.state.players[1]!.resources.food,100);assert.equal(unrelated.state.players[0]!.resources.food,100);save('B051-N3',{hand,other,unrelated})})
  it('B051 N4 actual clay collection undo restores food and same finite animals before one retry',()=>{const s=setup(SPADE,state=>{state.players[0]!.resources.wood=1;boar(state,3)});buy(s,SPADE);const before=owner(s),r=turn(s,0,'clay-pit'),undone=ok(s.undoAction());assert.equal(undone.state.players[0]!.resources.food,before.state.players[0]!.resources.food);assert.equal(undone.state.players[0]!.resources.boar,3);const retry=turn(s,0,'clay-pit');assert.equal(retry.state.players[0]!.resources.food,before.state.players[0]!.resources.food+3);save('B051-N4',{before,r,undone,retry})})
})
