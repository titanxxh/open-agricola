import { afterEach, describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import type { GameState, PlayerState } from '../../shared/contract/types'
import type { InitialStateOptions } from '../../shared/session/state-bootstrap'
import { createInitialState } from '../../shared/session/state-bootstrap'
import { rehydrateState, serializeSessionSnapshot, type PersistedSessionSnapshot } from '../../shared/session/serialization'
import { startOrdinaryCardDrawChoice } from '../../shared/session/ordinary-card-draw'
import { ClassicPoolInsufficientError, getClassicDealShortfall } from '../../shared/session/classic-deal-pool'
import { withClassicCardDefinitions } from '../../shared/cards/classic-catalog'
import { classicFixtureCards } from '../../shared/cards/__tests__/__fixtures__/classic-definitions'
import { firstDraftPick } from '../../shared/draft/__tests__/draft-fixtures'
import { createOpeningSession } from './_helpers/session-fixtures'

// ADR 0049: a classic game deals only eligible cards (implemented, player-count limits) of its chosen classic decks,
// for the plain deal, draft and fallback deck, and keeps its edition and decks. Only two classic cards are ported, so these tests size the
// pool with test-only classic definitions.
const FIXTURES = [
  ...classicFixtureCards('CE', 'occupation', 8),
  ...classicFixtureCards('CE', 'occupation', 2, { from: 920, players: '3+' }),
  ...classicFixtureCards('CE', 'minor', 10),
  ...classicFixtureCards('CI', 'occupation', 8),
  ...classicFixtureCards('CI', 'minor', 8),
  ...classicFixtureCards('CK', 'occupation', 2),
  ...classicFixtureCards('CK', 'minor', 2),
  ...classicFixtureCards('CZ', 'occupation', 6),
  ...classicFixtureCards('CZ', 'minor', 6),
]
/** Eligible fixture IDs at 2 players, where the 3+ cards stay out. */
const eligibleIn = (decks: string[], kind: 'occupation' | 'minor') => new Set(FIXTURES
  .filter(card => decks.includes(card.deck) && card.kind === kind && card.players !== '3+')
  .map(card => card.id))
const PLAYING = { phase: 'playing', roundPhase: 'work', interaction: { stateId: 'idle' } } as const

const sessions: GameSession[] = []
afterEach(() => sessions.splice(0).forEach(session => session.dispose()))

const open = (options: InitialStateOptions, seed = 1872) => {
  const session = createOpeningSession({ seed, options: { playerCount: 2, ...options }, expected: PLAYING })
  sessions.push(session)
  return session
}

const handOf = (player: PlayerState, kind: 'occupation' | 'minor') =>
  kind === 'occupation' ? player.occupationHand : player.minorHand
/** Every card of a type the game holds: hands plus the face-down deck. */
const cardsOf = (state: GameState, kind: 'occupation' | 'minor') => [
  ...state.players.flatMap(player => handOf(player, kind)),
  ...state.ordinaryCardDecks[kind],
]
/** Every card in the draft: each seat's kept cards and waiting packets. */
const draftCardsOf = (state: GameState, kind: 'occupation' | 'minor') => (state.draft?.stages ?? [])
  .flatMap(stage => Object.values(stage.seats))
  .flatMap(seat => [seat.kept, ...Object.values(seat.inbox)])
  .flatMap(pool => kind === 'occupation' ? pool.occ : pool.minor)
const hands = (state: GameState) => state.players.map(player => [player.occupationHand, player.minorHand])

const saveWithoutOrdinaryDecks = (session: GameSession) => {
  const saved: PersistedSessionSnapshot = JSON.parse(JSON.stringify(serializeSessionSnapshot(session.state, session)))
  Reflect.deleteProperty(saved.state, 'ordinaryCardDecks')
  Reflect.deleteProperty(saved.frame, 'ordinaryCardDecks')
  return saved
}

describe('classic game deal', () => {
  it('deals full hands and the deck only from eligible cards of the chosen classic decks', () => {
    withClassicCardDefinitions(FIXTURES, () => {
      const { state } = open({ cardEdition: 'classic', classicDeckIds: [' ce', 'CI', 'CE'] }).getState()

      expect(state.cardEdition).toBe('classic')
      expect(state.classicDeckIds).toEqual(['CE', 'CI'])
      for (const player of state.players) {
        expect(player.occupationHand).toHaveLength(7)
        expect(player.minorHand).toHaveLength(7)
      }
      // 16 eligible occupations (the CE 3+ cards are out at 2 players) and 18 minors: 14 dealt, the rest in the deck.
      for (const kind of ['occupation', 'minor'] as const) {
        const eligible = eligibleIn(['CE', 'CI'], kind)
        const held = cardsOf(state, kind)
        expect(new Set(held)).toEqual(eligible)
        expect(held).toHaveLength(eligible.size)
      }
      expect(state.ordinaryCardDecks.occupation).toHaveLength(2)
      expect(state.ordinaryCardDecks.minor).toHaveLength(4)
    })
  })

  it('deals from CE, CI and CK when the chosen decks are missing or unknown', () => {
    withClassicCardDefinitions(FIXTURES, () => {
      for (const classicDeckIds of [undefined, ['CX', 'E']]) {
        const { state } = open({ cardEdition: 'classic', ...(classicDeckIds ? { classicDeckIds } : {}) }).getState()

        expect(state.classicDeckIds).toEqual(['CE', 'CI', 'CK'])
        expect(new Set(cardsOf(state, 'occupation'))).toEqual(eligibleIn(['CE', 'CI', 'CK'], 'occupation'))
        expect(new Set(cardsOf(state, 'minor'))).toEqual(eligibleIn(['CE', 'CI', 'CK'], 'minor'))
      }
    })
  })

  it('leaves a revised game without edition fields and free of classic cards', () => {
    withClassicCardDefinitions(FIXTURES, () => {
      const revised = createInitialState(1872, { playerCount: 2, ordinaryCardDeckSeed: 1, parentSelectionSeed: 1 })
      const explicit = createInitialState(1872, {
        playerCount: 2, ordinaryCardDeckSeed: 1, parentSelectionSeed: 1, cardEdition: 'revised', classicDeckIds: ['CE'],
      })

      expect(JSON.stringify(explicit)).toBe(JSON.stringify(revised))
      expect(Object.hasOwn(revised, 'cardEdition')).toBe(false)
      expect(Object.hasOwn(revised, 'classicDeckIds')).toBe(false)
      expect([...cardsOf(revised, 'occupation'), ...cardsOf(revised, 'minor')].filter(id => /^C[A-Z]+\d{3}_/.test(id)))
        .toEqual([])
    })
  })

  it('drafts only classic cards and restores the undrafted remainder during the draft', () => {
    withClassicCardDefinitions(FIXTURES, () => {
      const session = createOpeningSession({ seed: 1872, options: {
        playerCount: 2, cardEdition: 'classic', classicDeckIds: ['CE', 'CI'], draftMode: 'simultaneous', draftPoolSize: 8,
      }, expected: { phase: 'draft', roundPhase: 'work', interaction: { stateId: 'idle' } } })
      sessions.push(session)
      const { state } = session.getState()

      for (const kind of ['occupation', 'minor'] as const) {
        const drafted = draftCardsOf(state, kind)
        expect(drafted).toHaveLength(16)
        expect(new Set([...drafted, ...state.ordinaryCardDecks[kind]])).toEqual(eligibleIn(['CE', 'CI'], kind))
      }
      const pick = firstDraftPick(state.draft!, 'p1')
      const response = session.submitDraftPick('p1', pick)
      expect(response.ok, response.error).toBe(true)
      expect(eligibleIn(['CE', 'CI'], 'occupation').has(pick.occCardId!)).toBe(true)
      expect(eligibleIn(['CE', 'CI'], 'minor').has(pick.minorCardId!)).toBe(true)

      const restored = new GameSession(rehydrateState(saveWithoutOrdinaryDecks(session)))
      sessions.push(restored)
      const restoredDraft = restored.getState().state
      expect(restoredDraft.ordinaryCardDecks.occupation).toEqual([])
      expect(new Set(restoredDraft.ordinaryCardDecks.minor)).toEqual(new Set(state.ordinaryCardDecks.minor))
      const next = restored.submitDraftPick('p2', firstDraftPick(restoredDraft.draft!, 'p2'))
      expect(next.ok, next.error).toBe(true)
      expect(next.state.draft?.stages[0]?.seats.p1?.kept).toEqual({ occ: [pick.occCardId], minor: [pick.minorCardId] })
    })
  })

  it('keeps its edition, decks, hands and deck through a persisted snapshot and plays on', () => {
    withClassicCardDefinitions(FIXTURES, () => {
      const session = open({ cardEdition: 'classic', classicDeckIds: ['CZ', 'CE'] })
      const before = session.getState().state

      const saved = session.withCtx(() => serializeSessionSnapshot(session.state, session))
      const restored = new GameSession(rehydrateState(JSON.parse(JSON.stringify(saved))))
      sessions.push(restored)
      const after = restored.getState().state

      expect(after.cardEdition).toBe('classic')
      expect(after.classicDeckIds).toEqual(['CZ', 'CE'])
      expect(hands(after)).toEqual(hands(before))
      expect(after.ordinaryCardDecks).toEqual(before.ordinaryCardDecks)
      const response = restored.takeAction(0, 'day-laborer')
      expect(response.ok, response.error).toBe(true)
      expect(response.state.cardEdition).toBe('classic')
      expect(response.state.classicDeckIds).toEqual(['CZ', 'CE'])
    })
  })

  it('restores a missing classic draw deck and publishes only its counts to a viewer', () => {
    withClassicCardDefinitions(FIXTURES, () => {
      const session = open({ cardEdition: 'classic', classicDeckIds: ['CI', 'CE'] })
      const draw = startOrdinaryCardDrawChoice(session.state, { playerId: 'p1', cardType: 'minor', count: 2 })
      if (!draw.ok) throw new Error(draw.error)
      const remaining = session.state.ordinaryCardDecks
      const saved = saveWithoutOrdinaryDecks(session)
      const [owner, guest] = saved.state.players
      owner!.occupationPlayed.push(...owner!.occupationHand.splice(0))

      const restored = new GameSession(rehydrateState(saved))
      const independentlyRestored = new GameSession(rehydrateState(saved))
      sessions.push(restored, independentlyRestored)
      const response = restored.getState()
      expect(response.state.players[0]!.occupationHand).toEqual([])
      expect(response.state.players[0]!.occupationPlayed).toEqual(owner!.occupationPlayed)
      expect(response.state.players[1]!.occupationHand).toEqual(guest!.occupationHand)
      expect(new Set(response.state.ordinaryCardDecks.occupation)).toEqual(new Set(remaining.occupation))
      expect(new Set(response.state.ordinaryCardDecks.minor)).toEqual(new Set(remaining.minor))
      expect(independentlyRestored.state.ordinaryCardDecks).toEqual(response.state.ordinaryCardDecks)

      const viewer = restored.buildSyncPayload(response, ['p1']).state
      expect(viewer.ordinaryCardDecks).toEqual({ occupation: ['?', '?'], minor: ['?', '?'] })
      expect(viewer.players[1]!.occupationHand).toEqual(Array(7).fill('?'))
      expect(viewer.ordinaryCardDrawChoices[draw.choice.id]!.candidates).toEqual(draw.choice.candidates)
      const guestView = restored.buildSyncPayload(response, ['p2']).state
      expect(guestView.ordinaryCardDrawChoices[draw.choice.id]!.candidates).toEqual(['?', '?'])
      const kept = draw.choice.candidates[0]!
      const resolved = restored.resolveOrdinaryCardDrawChoice(0, draw.choice.id, kept)
      expect(resolved.ok, resolved.error).toBe(true)
      expect(resolved.state.players[0]!.minorHand).toContain(kept)
      expect(restored.takeAction(0, 'day-laborer').ok).toBe(true)
    })
  })

  it('rejects rebuilding the draw deck when a resolved choice has discarded private cards', () => {
    withClassicCardDefinitions(FIXTURES, () => {
      const session = open({ cardEdition: 'classic', classicDeckIds: ['CI', 'CE'] })
      const draw = startOrdinaryCardDrawChoice(session.state, { playerId: 'p1', cardType: 'minor', count: 2 })
      if (!draw.ok) throw new Error(draw.error)
      expect(session.resolveOrdinaryCardDrawChoice(0, draw.choice.id, draw.choice.candidates[0]!).ok).toBe(true)

      expect(() => new GameSession(rehydrateState(saveWithoutOrdinaryDecks(session)))).toThrow(/ordinary draw history/)
    })
  })
})

describe('classic pool check', () => {
  const creationError = (options: InitialStateOptions) => {
    try {
      sessions.push(new GameSession(1872, undefined, { playerCount: 2, ...options }))
    } catch (error) {
      return error
    }
    throw new Error('Expected classic game creation to be rejected')
  }

  it.each([
    [{ enableFarmersOfTheMoor: true }, 'Farmers of the Moor'],
    [{ playerCount: 0 }, 'a solo game'],
    [{ playerCount: 1.9 }, 'a solo game'],
  ] satisfies [InitialStateOptions, string][])('rejects direct classic construction with %j', (options, excluded) => {
    expect(creationError({ cardEdition: 'classic', ...options })).toMatchObject({
      rejection: { code: 'classic_edition_incompatible', error: `Classic cards cannot be combined with ${excluded}` },
    })
  })

  it('reports the cards each type needs for the player count and variant against the eligible cards', () => {
    withClassicCardDefinitions(FIXTURES, () => {
      const classic = { cardEdition: 'classic', classicDeckIds: ['CE', 'CI'] } as const
      expect(getClassicDealShortfall({ ...classic, playerCount: 2 })).toBeNull()
      // A 9-card draft needs 18 of each; the 3+ occupations stay out at 2 players.
      expect(getClassicDealShortfall({ ...classic, playerCount: 2, draftMode: 'simultaneous', draftPoolSize: 9 })).toEqual({
        code: 'classic_pool_insufficient', playerCount: 2, classicDeckIds: ['CE', 'CI'],
        needed: { occupation: 18, minor: 18 }, eligible: { occupation: 16, minor: 18 },
      })
      // At 3 players they count, but 21 cards of each are needed.
      expect(getClassicDealShortfall({ ...classic, playerCount: 3 })).toMatchObject({
        needed: { occupation: 21, minor: 21 }, eligible: { occupation: 18, minor: 18 },
      })
      expect(getClassicDealShortfall({ playerCount: 6, classicDeckIds: ['CK'] })).toBeNull()
    })
  })

  it('rejects creating a classic game the eligible pool cannot fill, rather than shrinking hands or adding revised cards', () => {
    withClassicCardDefinitions(FIXTURES, () => {
      const plain = creationError({ cardEdition: 'classic', classicDeckIds: ['CK', 'CZ'] })
      expect(plain).toBeInstanceOf(ClassicPoolInsufficientError)
      expect(plain).toMatchObject({ code: 'classic_pool_insufficient', shortfall: {
        playerCount: 2, classicDeckIds: ['CK', 'CZ'], needed: { occupation: 14, minor: 14 }, eligible: { occupation: 8, minor: 8 },
      } })
      expect(String(plain)).toMatch(/CK, CZ.*14 occupations.*8/)

      const draft = creationError({
        cardEdition: 'classic', classicDeckIds: ['CE', 'CI'], draftMode: 'simultaneous', draftPoolSize: 9,
      })
      expect(draft).toMatchObject({ code: 'classic_pool_insufficient', shortfall: { needed: { occupation: 18 } } })
    })
  })
})
