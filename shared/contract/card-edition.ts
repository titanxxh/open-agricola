/**
 * Card Edition of a game's occupations and minor improvements (ADR 0049). Game state records only `'classic'`;
 * a game without the field is revised, so retained games need no migration.
 */
export type CardEdition = 'revised' | 'classic'

export type ClassicPoolErrorCode = 'classic_pool_insufficient'

/** Why a classic game cannot be created: per card type, the cards its hands need and the eligible cards available. */
export type ClassicPoolShortfall = {
  code: ClassicPoolErrorCode
  playerCount: number
  classicDeckIds: string[]
  needed: { occupation: number; minor: number }
  eligible: { occupation: number; minor: number }
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
