/**
 * Card Edition of a game's occupations and minor improvements (ADR 0049). Game state records only `'classic'`;
 * a game without the field is revised, so retained games need no migration.
 */
export type CardEdition = 'revised' | 'classic'
