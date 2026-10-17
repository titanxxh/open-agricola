import { describe, expect, it, afterEach } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { setActiveWorkerCount, setWorkersAtHome, familySize } from '../../shared/domain/player'
import {
  getRoundPersonPlacementDetails,
  recordRoundPlacement,
} from '../../shared/cards/helpers/round-placement'
import { runCardListeners } from '../../shared/cards/card-listeners'

import { D160_Midwife_impl } from '../../shared/cards/D/D160_Midwife'
import assert from 'node:assert/strict'
import * as audit56Family from './_helpers/audit/ae-negative-56-family'

const CARD_ID = 'D160_Midwife'

const setup = (
  currentPlayerIndex: number,
  spaceId: 'wish-children' | 'urgent-wish-children' = 'wish-children',
  priorPlacement = false,
) => {
  const session = new GameSession(160, undefined, { playerCount: 4 })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = currentPlayerIndex
  state.round = spaceId === 'urgent-wish-children' ? 5 : 2
  state.roundActionOrder = state.roundActionOrder.map((id) => id === spaceId ? null : id)
  state.roundActionOrder[0] = spaceId
  for (const player of state.players) {
    player.minorHand = ['__test_placeholder__']
    player.occupationHand = ['__test_placeholder__']
    setActiveWorkerCount(player, 2)
    setWorkersAtHome(state, player, 2)
  }
  const owner = state.players[0]!
  owner.occupationPlayed.push(CARD_ID)
  owner.resources.grain = 0
  owner.rooms = 3
  const actor = state.players[currentPlayerIndex]!
  actor.rooms = 3
  if (priorPlacement) recordRoundPlacement(actor, 'forest', actor.workers[0]!.id)
  const space = state.actionSpaces.find((entry) => entry.id === spaceId)
  if (!space) throw new Error(`${spaceId} space missing`)
  space.takenBy = []
  session.loadState(state)
  return session
}

describe('D160_Midwife session', () => {
  it('D160 S1 owner gains one grain from an opponent first-placement Family Growth', () => {
    const session = setup(1)
    expect(session.getState().actionAvailability?.['wish-children']).toBe(true)

    const response = session.takeAction(1, 'wish-children')

    expect(response.ok).toBe(true)
    expect(response.state.players[0]!.resources.grain).toBe(1)
  })

  it('D160 S2 owner gains one grain from an opponent first-placement urgent Family Growth', () => {
    const session = setup(1, 'urgent-wish-children')
    expect(session.getState().actionAvailability?.['urgent-wish-children']).toBe(true)

    const response = session.takeAction(1, 'urgent-wish-children')

    expect(response.ok).toBe(true)
    expect(response.state.players[0]!.resources.grain).toBe(1)
  })

  it('D160 S3 owner gains nothing when Family Growth is not the opponent first placement', () => {
    const session = setup(1, 'wish-children', true)

    const response = session.takeAction(1, 'wish-children')

    expect(response.ok).toBe(true)
    expect(response.state.players[0]!.resources.grain).toBe(0)
  })

  it('D160 S4 owner gains nothing from their own Family Growth', () => {
    const session = setup(0)

    const response = session.takeAction(0, 'wish-children')

    expect(response.ok).toBe(true)
    expect(response.state.players[0]!.resources.grain).toBe(0)
  })

  it('D160 S5 owner gains nothing from an opponent non-Family-Growth placement', () => {
    const session = setup(1)

    const response = session.takeAction(1, 'day-laborer')

    expect(response.ok).toBe(true)
    expect(response.state.players[0]!.resources.grain).toBe(0)
  })

  it('D160 treats a same-person relocation to Family Growth as the first person', () => {
    const session = setup(1)
    const state = session.getState().state
    const actor = state.players[1]!
    recordRoundPlacement(actor, 'farm-expansion', actor.workers[0]!.id)
    recordRoundPlacement(actor, 'wish-children', actor.workers[0]!.id, true)

    const results = runCardListeners({
      state,
      player: actor,
      space: state.actionSpaces.find((space) => space.id === 'wish-children')!,
      actionId: 'place-farmer',
      phase: 'after',
    }, [D160_Midwife_impl.listeners[0]!])

    expect(getRoundPersonPlacementDetails(actor)).toHaveLength(1)
    expect(results).toHaveLength(1)
    expect(results[0]?.sourceCard).toBe(CARD_ID)
    expect(results[0]?.flow).toEqual(expect.objectContaining({
      type: 'leaf',
      actionId: 'gain',
      params: { grain: 1 },
    }))
  })
})

describe('ae-negative-56-family', () => {
  const { sessions, ok, save, make, finish, ready, people } = audit56Family
  afterEach(() => sessions.splice(0).forEach(session => session.dispose()))
  it('D160 N1 opponent first real person on either ordinary or urgent growth grants exactly one owner grain',()=>{for(const space of['wish-children','urgent-wish-children']){const s=make('D160_Midwife',st=>{st.currentPlayerIndex=1;people(st.players[1]!,3);setActiveWorkerCount(st.players[1]!,2)},true,14),r=finish(s,ok(s.takeAction(1,space)),true);assert.equal(familySize(r.state.players[1]!),3);assert.equal(r.state.players[0]!.resources.grain,1);assert.equal(r.state.players[1]!.resources.grain,0);save(`D160-N1-${space}`,r)}})
  it('D160 N2 opponent second real person growth after three intervening players cannot grant grain',()=>{const s=make('D160_Midwife',st=>{st.currentPlayerIndex=1},true,14),first=finish(s,ok(s.takeAction(1,'grain-seeds')));for(const[actor,space]of[[2,'clay-pit'],[3,'reed-bank'],[0,'forest']]as const){assert.equal(ready(s).state.currentPlayerIndex,actor);finish(s,ok(s.takeAction(actor,space)));}assert.equal(ready(s).state.currentPlayerIndex,1);const r=finish(s,ok(s.takeAction(1,'urgent-wish-children')),true);assert.equal(r.state.players[0]!.resources.grain,0);assert.equal(r.state.players[1]!.resources.grain,1);save('D160-N2',{first,r})})
  it('D160 N3 own first growth unrelated opponent placement and hand-only Midwife do not award owner grain',()=>{for(const mode of['self','unrelated','hand']){const actor=mode==='self'?0:1,s=make('D160_Midwife',st=>{st.currentPlayerIndex=actor},mode!=='hand',14),r=finish(s,ok(s.takeAction(actor,mode==='unrelated'?'clay-pit':'urgent-wish-children')),true);assert.equal(r.state.players[0]!.resources.grain,0);save(`D160-N3-${mode}`,r)}})
})
