import { describe, expect, it } from 'vitest'
import type { SessionResponse } from '../game/authoritative-session'
import { createWorkSession } from './_helpers/session-fixtures'
import { confirmNextPlayer } from './_helpers/pending-confirms'

const CARD = 'E154_Margrave'
const bonus = (r: SessionResponse) => r.scores![0]!.categories.filter(c => c.key === 'cardBonusVp')
  .flatMap(c => c.entries).filter(e => e.type === 'bonus' && e.cardId === CARD).reduce((total,e) => total + e.score,0)
const setup = (ownerHouse: 'wood' | 'clay' | 'stone', actorHouse: 'wood' | 'clay', actor = 1) => createWorkSession({
  seed: 1177, options: {playerCount:4}, configure: state => {
    state.round = 14
    state.players.forEach(p => { p.minorHand = ['__test_placeholder__']; p.occupationHand = ['__test_placeholder__'] })
    state.players[0]!.occupationPlayed = [CARD]
    state.players[0]!.houseType = ownerHouse
    state.players[0]!.resources.food = 10
    const p = state.players[actor]!
    p.houseType = actorHouse
    p.resources.reed = 1
    p.resources[actorHouse === 'wood' ? 'clay' : 'stone'] = 2
  },
})

describe('Margrave eligibility belongs to the card owner', () => {
  it.each(['wood','clay','stone'] satisfies Array<'wood' | 'clay' | 'stone'>)('owner %s, opponent wood-to-clay renovation gives only stone owner two food', house => {
    const session = setup(house,'wood')
    expect(session.takeAction(0,'grain-seeds').ok).toBe(true)
    confirmNextPlayer(session)
    const r = session.takeAction(1,'house-redevelopment')
    expect(r.ok,r.error).toBe(true)
    expect(r.state.players[0]!.resources.food).toBe(house === 'stone' ? 12 : 10)
    expect(r.state.players[0]!.houseType).toBe(house)
    expect(r.state.players[1]!.houseType).toBe('clay')
    expect(r.state.players[1]!.resources.clay).toBe(0)
    expect(r.state.players[1]!.resources.reed).toBe(0)
    expect(bonus(r)).toBe(house === 'stone' ? 3 : 0)
    session.dispose()
  })

  it('opponent becoming stone cannot reward an owner still in wood', () => {
    const session = setup('wood','clay')
    expect(session.takeAction(0,'grain-seeds').ok).toBe(true)
    confirmNextPlayer(session)
    const r = session.takeAction(1,'house-redevelopment')
    expect(r.ok,r.error).toBe(true)
    expect(r.state.players[1]!.houseType).toBe('stone')
    expect(r.state.players[0]!.resources.food).toBe(10)
    expect(r.state.players[1]!.resources.stone).toBe(0)
    expect(r.state.players[1]!.resources.reed).toBe(0)
    expect(bonus(r)).toBe(0)
    session.dispose()
  })

  it('any player includes the owner renovating from clay into stone', () => {
    const session = setup('clay','clay',0)
    const r = session.takeAction(0,'house-redevelopment')
    expect(r.ok,r.error).toBe(true)
    expect(r.state.players[0]!.houseType).toBe('stone')
    expect(r.state.players[0]!.resources.food).toBe(12)
    expect(r.state.players[0]!.resources.stone).toBe(0)
    expect(r.state.players[0]!.resources.reed).toBe(0)
    expect(bonus(r)).toBe(3)
    session.dispose()
  })
})
