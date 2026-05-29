import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { getPlayedCardKeys } from '../../shared/domain/player'
import type { CostModifier } from '../../shared/contract/types'

describe('devDrawCard', () => {
  it('plays a virtual-occupation minor consistently before drawing it back', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.players[1]!.minorHand = ['D25_WitchesDanceFloor']
    session.loadState(state)

    const played = session.devPlayCard(1, 'D25_WitchesDanceFloor')

    expect(played.ok).toBe(true)
    expect(played.state.players[1]!.minorPlayed).toContain('D25_WitchesDanceFloor')
    expect(played.state.players[1]!.extraOccupationsFromCards).toContain('D25_WitchesDanceFloor')

    const drawn = session.devDrawCard(0, 'D25_WitchesDanceFloor')

    expect(drawn.ok).toBe(true)
    expect(drawn.state.players[0]!.minorHand).toContain('D25_WitchesDanceFloor')
    expect(drawn.state.players[1]!.minorPlayed).not.toContain('D25_WitchesDanceFloor')
    expect(drawn.state.players[1]!.extraOccupationsFromCards).not.toContain('D25_WitchesDanceFloor')
  })

  it('removes card-derived active modifiers from the former minor owner', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    const owner = state.players[1]!
    const staleModifier: CostModifier = {
      type: 'trade',
      cardId: 'D15_ClaySupports',
      appliesTo: ['construct'],
      from: { wood: 1 },
      to: { clay: 3, reed: 1 },
    }
    const retainedModifier: CostModifier = {
      type: 'bonus',
      cardId: 'A123_FrameBuilder',
      appliesTo: ['construct'],
      discount: { wood: 1 },
    }
    owner.minorPlayed = ['D15_ClaySupports']
    owner.activeModifiers = [staleModifier, retainedModifier]
    session.loadState(state)

    const resp = session.devDrawCard(0, 'D15_ClaySupports')

    expect(resp.ok).toBe(true)
    expect(
      resp.state.players[1]!.activeModifiers.some((m) => m.cardId === 'D15_ClaySupports'),
    ).toBe(false)
    expect(resp.state.players[1]!.activeModifiers).toContainEqual(retainedModifier)
  })

  it('removes card-derived virtual occupations from the former minor owner', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    const owner = state.players[1]!
    owner.minorPlayed = ['D25_WitchesDanceFloor']
    owner.extraOccupationsFromCards = ['D25_WitchesDanceFloor']
    session.loadState(state)

    const resp = session.devDrawCard(0, 'D25_WitchesDanceFloor')

    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.minorHand).toContain('D25_WitchesDanceFloor')
    expect(resp.state.players[1]!.extraOccupationsFromCards).not.toContain('D25_WitchesDanceFloor')
  })

  it('removes dynamic action spaces created by the former minor owner', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.players[1]!.minorHand = ['D51_Archway']
    session.loadState(state)
    const played = session.devPlayCard(1, 'D51_Archway')
    expect(played.state.actionSpaces.some((space) => space.id === 'D51_Archway')).toBe(true)

    const resp = session.devDrawCard(0, 'D51_Archway')

    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.minorHand).toContain('D51_Archway')
    expect(resp.state.players[1]!.minorPlayed).not.toContain('D51_Archway')
    expect(resp.state.actionSpaces.some((space) => space.id === 'D51_Archway')).toBe(false)
  })

  it('pulls a played minor from any player back to the target hand and clears its state', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    const target = state.players[0]!
    const owner = state.players[1]!
    target.minorHand = []
    owner.minorPlayed = ['C57_Crudite']
    owner.cardStates = {
      C57_Crudite: { counters: { food: 1 }, extraData: { used: true } },
    }
    session.loadState(state)

    const resp = session.devDrawCard(0, 'C57_Crudite')

    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.minorHand).toContain('C57_Crudite')
    expect(resp.state.players[1]!.minorPlayed).not.toContain('C57_Crudite')
    expect(resp.state.players[1]!.cardStates?.C57_Crudite).toBeUndefined()
    expect(getPlayedCardKeys(resp.state.players[1]!)).not.toContain('minor:C57_Crudite')
  })

  it('pulls a played occupation from any player back to the target hand and clears its state', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    const target = state.players[0]!
    const owner = state.players[1]!
    target.occupationHand = []
    owner.occupationPlayed = ['C146_WorkshopAssistant']
    owner.cardStates = {
      C146_WorkshopAssistant: { extraData: { pairs: ['WC', 'CS'] } },
    }
    session.loadState(state)

    const resp = session.devDrawCard(0, 'C146_WorkshopAssistant')

    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.occupationHand).toContain('C146_WorkshopAssistant')
    expect(resp.state.players[1]!.occupationPlayed).not.toContain('C146_WorkshopAssistant')
    expect(resp.state.players[1]!.cardStates?.C146_WorkshopAssistant).toBeUndefined()
    expect(getPlayedCardKeys(resp.state.players[1]!)).not.toContain('occupation:C146_WorkshopAssistant')
  })

  it('returns a played major to the public supply and clears its state', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    const target = state.players[0]!
    const owner = state.players[1]!
    target.minorHand = []
    target.occupationHand = []
    owner.improvements = ['Major_Fireplace1']
    owner.cardStates = {
      Major_Fireplace1: { counters: { food: 1 } },
    }
    state.availableMajorImprovements = state.availableMajorImprovements.filter((id) => id !== 'Major_Fireplace1')
    session.loadState(state)

    const resp = session.devDrawCard(0, 'Major_Fireplace1')

    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.minorHand).not.toContain('Major_Fireplace1')
    expect(resp.state.players[0]!.occupationHand).not.toContain('Major_Fireplace1')
    expect(resp.state.players[1]!.improvements).not.toContain('Major_Fireplace1')
    expect(resp.state.players[1]!.cardStates?.Major_Fireplace1).toBeUndefined()
    expect(resp.state.availableMajorImprovements).toContain('Major_Fireplace1')
    expect(getPlayedCardKeys(resp.state.players[1]!)).not.toContain('major:Major_Fireplace1')
  })
})
