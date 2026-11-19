/**
 * Card Edition of a game's occupations and minor improvements (ADR 0049). Game state records only `'classic'`;
 * a game without the field is revised, so retained games need no migration.
 */
export type CardEdition = 'revised' | 'classic'

/**
 * Whether new classic games may be created (ADR 0049): `false` on main, flipped by pre's single switch commit. It is a
 * compile-time constant, not an environment read, so the server, the browser Worker and build scripts agree. It gates
 * only exposure; admission entries take it as an injectable parameter defaulting to this value, and loading,
 * continuing, reconnecting to or replaying an existing classic game never reads it.
 */
export const CLASSIC_EDITION_ENABLED: boolean = false

export type ClassicPoolErrorCode = 'classic_pool_insufficient'

/**
 * Why creation rejected the classic option: the switch is off, another option excludes it (Farmers of the Moor, the
 * community deck, Parent Cards, Through the Seasons, solo), or its eligible pool cannot fill every hand.
 */
export type ClassicAdmissionErrorCode = 'classic_edition_disabled' | 'classic_edition_incompatible' | ClassicPoolErrorCode

export type ClassicCardCounts = { occupation: number; minor: number }

/** Why a classic game cannot be created: per card type, the cards its hands need and the eligible cards available. */
export type ClassicPoolShortfall = {
  code: ClassicPoolErrorCode
  playerCount: number
  classicDeckIds: string[]
  needed: ClassicCardCounts
  eligible: ClassicCardCounts
}

/**
 * Cards of each type a classic game must deal: a 7-card hand per seat, or one `draftPoolSize` packet per seat in a
 * draft. Hands never shrink to fit a smaller pool.
 */
export const classicCardsNeededPerType = (setup: {
  playerCount: number
  draftMode?: 'none' | 'simultaneous'
  draftPoolSize?: number
}): number => setup.playerCount * (setup.draftMode === 'simultaneous' ? Math.floor(setup.draftPoolSize ?? 7) : 7)

/** CE, CI and CK where they have cards; every selectable deck when none of them has. */
export function defaultClassicDeckIds(selectable: readonly string[]): string[] {
  const preferred = ['CE', 'CI', 'CK'].filter(deck => selectable.includes(deck))
  return preferred.length > 0 ? preferred : [...selectable]
}

export function compareClassicPool(
  classicDeckIds: readonly string[],
  playerCount: number,
  neededPerType: number,
  eligible: ClassicCardCounts,
): ClassicPoolShortfall | null {
  if (eligible.occupation >= neededPerType && eligible.minor >= neededPerType) return null
  return {
    code: 'classic_pool_insufficient',
    playerCount,
    classicDeckIds: [...classicDeckIds],
    needed: { occupation: neededPerType, minor: neededPerType },
    eligible,
  }
}

export const classicPoolMessageParams = (shortfall: ClassicPoolShortfall) => ({
  decks: shortfall.classicDeckIds.join(', '),
  players: shortfall.playerCount,
  neededOccupations: shortfall.needed.occupation,
  neededMinors: shortfall.needed.minor,
  eligibleOccupations: shortfall.eligible.occupation,
  eligibleMinors: shortfall.eligible.minor,
})

export function formatClassicPoolShortfall(shortfall: ClassicPoolShortfall): string {
  const { decks, players, neededOccupations, neededMinors, eligibleOccupations, eligibleMinors } = classicPoolMessageParams(shortfall)
  return `Classic decks ${decks} cannot fill ${players} hands: need ${neededOccupations} occupations and ${neededMinors} minor improvements, have ${eligibleOccupations} and ${eligibleMinors} eligible cards`
}
