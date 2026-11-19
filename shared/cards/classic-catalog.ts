import { classicCardDefinitions } from './classic-catalog.generated.ts'
import { cardAllowedForPlayerCount } from './player-count-filter'

export type ClassicCardDefinition = (typeof classicCardDefinitions)[number]

type ClassicCatalog = {
  definitions: readonly ClassicCardDefinition[]
  byId: ReadonlyMap<string, ClassicCardDefinition>
}

const indexCatalog = (definitions: readonly ClassicCardDefinition[]): ClassicCatalog => ({
  definitions,
  byId: new Map(definitions.map(card => [card.id, card])),
})

const generatedCatalog = indexCatalog(classicCardDefinitions)
let activeCatalog = generatedCatalog

/**
 * Test seam: while `run` executes, lookups, deck selection and the classic deal pool read `definitions` instead of
 * the ported classic cards, so tests can size a classic pool without porting cards. An asynchronous `run` keeps them
 * until its promise settles, for tests that create games through rooms or HTTP routes.
 */
export const withClassicCardDefinitions = <T>(definitions: readonly ClassicCardDefinition[], run: () => T): T => {
  const previous = activeCatalog
  activeCatalog = indexCatalog(definitions)
  const restore = () => { activeCatalog = previous }
  let result: T
  try {
    result = run()
  } catch (error) {
    restore()
    throw error
  }
  if (result instanceof Promise) return result.finally(restore) as T
  restore()
  return result
}

/**
 * Classic Card Definitions. The ordinary catalog, revised deal pool and encyclopedia never include them (the client
 * manifest does, for display); callers that reach classic cards by exact ID (dev draw / play) read their kind here.
 */
export const getClassicCardDefinition = (id: string): ClassicCardDefinition | undefined => activeCatalog.byId.get(id)

const kindOf = (card: ClassicCardDefinition): 'occupation' | 'minor' =>
  card.kind === 'playerAction'
    ? card.playerActionCardType === 'occupation' ? 'occupation' : 'minor'
    : card.kind

export const getClassicCardKind = (id: string): 'occupation' | 'minor' | undefined => {
  const card = activeCatalog.byId.get(id)
  return card ? kindOf(card) : undefined
}

/** Classic minor-like definitions (minor or minor-type player action), for lookups by exact ID only. */
export const getClassicMinorImprovement = (id: string): ClassicCardDefinition | undefined =>
  getClassicCardKind(id) === 'minor' ? activeCatalog.byId.get(id) : undefined

/** Classic occupation-like definitions (occupation or occupation-type player action), for lookups by exact ID only. */
export const getClassicOccupation = (id: string): ClassicCardDefinition | undefined =>
  getClassicCardKind(id) === 'occupation' ? activeCatalog.byId.get(id) : undefined

/** Classic Card Definitions printed as `<deck><number>`, for the dev deck-number shorthand (`CE203`). */
export const getClassicCardsByDeckNumber = (deck: string, number: number): readonly ClassicCardDefinition[] =>
  activeCatalog.definitions.filter(card => card.deck === deck && card.number === number)

const DEFAULT_CLASSIC_DECK_PREFERENCE = ['CE', 'CI', 'CK'] as const

/** Classic Decks a game can choose: those with at least one ported card (ADR 0049). */
export const getSelectableClassicDeckIds = (): string[] =>
  [...new Set(activeCatalog.definitions.map(card => card.deck))].sort()

/** CE, CI and CK where they have cards; every selectable deck when none of them has. */
export const getDefaultClassicDeckIds = (): string[] => {
  const selectable = getSelectableClassicDeckIds()
  const preferred = DEFAULT_CLASSIC_DECK_PREFERENCE.filter(deck => selectable.includes(deck))
  return preferred.length > 0 ? [...preferred] : selectable
}

/** Trims, uppercases and filters chosen decks by the selectable list, like sandbox decks; none left means default. */
export const normalizeClassicDeckIds = (raw: unknown): string[] => {
  const selectable = new Set(getSelectableClassicDeckIds())
  const chosen = Array.isArray(raw)
    ? raw
      .filter((deck): deck is string => typeof deck === 'string')
      .map(deck => deck.trim().toUpperCase())
      .filter(deck => selectable.has(deck))
    : []
  return chosen.length > 0 ? [...new Set(chosen)] : getDefaultClassicDeckIds()
}

/** The cards a classic game deals and counts: implemented cards of the chosen decks that admit the player count. */
export const getEligibleClassicCardIds = (
  deckIds: readonly string[],
  playerCount: number,
): { occupation: string[]; minor: string[] } => {
  const decks = new Set(deckIds)
  const eligible = activeCatalog.definitions.filter(card =>
    decks.has(card.deck) && card.implemented !== false && cardAllowedForPlayerCount(card.players, playerCount))
  return {
    occupation: eligible.filter(card => kindOf(card) === 'occupation').map(card => card.id),
    minor: eligible.filter(card => kindOf(card) === 'minor').map(card => card.id),
  }
}
