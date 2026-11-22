import { describe, expect, it } from 'vitest'
import { computeAnimalZones } from '../../shared/domain/animal-zones'
import { markAllWorkersUsed } from '../../shared/domain/player'
import type { GameState } from '../../shared/contract/types'
import type { GameSession, SessionResponse } from '../game/authoritative-session'
import { playMinor, playOccupation, sessionOptions } from './_helpers/card-regression-session'
import { wmChoose, wmId as id, wmOk, wmPayment, wmSession } from './_helpers/classic-wm-session'

// Plan: new four-player work games with explicit hands and zero resources.
// Each case pins a timing or identity rule: which receipt or Turn a card reads,
// and which farm state it follows after the board changes.
const p0 = (r: SessionResponse) => r.state.players[0]!
const anytimeOf = (session: GameSession, n: number) =>
  session.getState().interaction.anytimeActions.find((a) => a.sourceCard === id(n))
const almshouseDiscards = (r: SessionResponse) =>
  r.state.events.filter((e) => e.type === 'resource.paid' && e.sourceCardId === id(56)).length
/** Harvest of round 4 with only `food` for the owner; everyone else is fed. */
const harvest = (session: GameSession, food: number) => {
  const state = session.state
  state.round = 4
  state.players.forEach((p, i) => {
    p.resources.food = i === 0 ? food : 40
    markAllWorkersUsed(state, p)
  })
  session.loadState(state)
  let r = wmOk(session.performRoundEnd())
  // Skip the post-reap window and confirm the owner's partial feeding; the shortfall becomes begging cards.
  for (let step = 0; step < 12 && r.interaction.stateId === 'wait'; step++) {
    const { playerIndex, request } = r.interaction
    if (request.kind === 'feed') r = wmOk(session.resolveChoice(playerIndex, 'confirm', { selections: [] }))
    else if (request.kind === 'confirm-next-player') r = wmOk(session.resolveChoice(playerIndex, 'confirm'))
    else if (request.kind === 'confirm-player-switch') r = wmOk(session.resolveChoice(request.fromPlayerIndex, 'confirm'))
    else if (sessionOptions(r).every((o) => o.value === '__skip__')) r = wmOk(session.resolveChoice(playerIndex, '__skip__'))
    else break
  }
  return r
}
const borrowerRepaid = () => {
  const session = wmSession([56], (s) => { s.players[0]!.occupationHand = [id(6)] })
  wmPayment(session, playOccupation(session, id(6)))
  const r = wmOk(session.takeAnytimeAction(0, anytimeOf(session, 6)!.id))
  expect(p0(r).resources).toMatchObject({ food: 4, begging: 1 })
  return session
}
const reveal = (state: GameState, round: number, spaceId: string) => {
  const order = state.roundActionOrder
  const from = order.indexOf(spaceId)
  if (from >= 0) order[from] = order[round - 1]!
  order[round - 1] = spaceId
}
const homeGarden = () =>
  wmSession([89], (s) => {
    s.round = 5
    reveal(s, 5, 'house-redevelopment')
    Object.assign(s.players[0]!.resources, { clay: 2, reed: 1, wood: 1 })
  }, false)
const scheduled = (r: SessionResponse) => r.state.futureMeeples.filter((m) => m.cardId === id(89)).map((m) => m.round)

describe('WM timing and identity rules in four-player sessions', () => {
  it('Almshouse discards a later feeding begging card even after Borrower markers were repaid first', () => {
    const session = borrowerRepaid()
    const r = harvest(session, 3)
    expect(almshouseDiscards(r)).toBe(1)
    expect(p0(r).resources.begging).toBe(1)
  })
  it('Almshouse never discards a begging card that Borrower issued', () => {
    const r = harvest(borrowerRepaid(), 40)
    expect(almshouseDiscards(r)).toBe(0)
    expect(p0(r).resources.begging).toBe(1)
  })
  it('Home Garden schedules food when played after a renovation in the same Turn', () => {
    const session = homeGarden()
    const r = wmChoose(session, wmOk(session.takeAction(0, 'house-redevelopment')), 'action-improvement-2')
    expect([p0(r).houseType, p0(r).minorPlayed]).toEqual(['clay', [id(89)]])
    expect(scheduled(r)).toEqual([6, 7, 8])
  })
  it('Home Garden schedules nothing when the renovation was in an earlier Turn of the round', () => {
    const session = homeGarden()
    let r = wmChoose(session, wmOk(session.takeAction(0, 'house-redevelopment')), '__skip__')
    expect(p0(r).houseType).toBe('clay')
    session.state.currentPlayerIndex = 0
    session.loadState(session.state)
    r = wmPayment(session, playMinor(session, id(89)))
    expect(p0(r).minorPlayed).toEqual([id(89)])
    expect(scheduled(r)).toEqual([])
  })
  it('Donkey keeps blocking the chosen pasture after pasture IDs are renumbered', () => {
    const session = wmSession([74], (s) => {
      const p = s.players[0]!
      p.pastures = [
        { id: 'pasture-1', tiles: [{ row: 2, col: 1 }], animalType: null, animalCount: 0, stableCount: 0 },
        { id: 'pasture-2', tiles: [{ row: 0, col: 4 }], animalType: null, animalCount: 0, stableCount: 0 },
      ]
    }, false)
    wmChoose(session, wmPayment(session, playMinor(session, id(74))), 'pasture-1')
    const blocked = () => session.withCtx(() => computeAnimalZones(session.state.players[0]!, session.state))
      .filter((z) => z.zoneType === 'pasture' && z.blocked)
      .map((z) => session.state.players[0]!.pastures[z.pastureIndex!]!.tiles)
    expect(blocked()).toEqual([[{ row: 2, col: 1 }]])
    const p = session.state.players[0]!
    p.pastures = [
      { ...p.pastures[1]!, id: 'pasture-1' },
      { ...p.pastures[0]!, id: 'pasture-2' },
    ]
    session.loadState(session.state)
    expect(blocked()).toEqual([[{ row: 2, col: 1 }]])
  })
  it('Resource Lender offers its schedule for building resources from Resource Market, not for its food', () => {
    const session = wmSession([43])
    const r = wmOk(session.takeAction(0, 'resource-market-4'))
    expect(r.interaction.sourceCard).toBe(id(43))
    expect(sessionOptions(r).filter((o) => o.value !== '__skip__').map((o) => o.labelKey).sort())
      .toEqual(['resources.reed', 'resources.stone'])
  })
})
