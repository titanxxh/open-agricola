import type { ClassicCardDefinition } from '../../classic-catalog'

type FixtureKind = 'occupation' | 'minor'

/**
 * Test-only classic Card Definitions for a sized classic pool (only a few classic cards are ported). Numbers start at
 * 900 for occupations and 950 for minors, so IDs follow the `C<deck><NNN>_` shape without naming real classic cards.
 */
export const classicFixtureCards = (
  deck: string,
  kind: FixtureKind,
  count: number,
  options: { from?: number; players?: string; implemented?: false } = {},
): ClassicCardDefinition[] =>
  Array.from({ length: count }, (_, index) => {
    const number = (options.from ?? (kind === 'occupation' ? 900 : 950)) + index
    const name = `Fixture${kind === 'occupation' ? 'Occupation' : 'Minor'}${number}`
    return {
      id: `${deck}${number}_${name}`,
      name,
      deck,
      number,
      desc: [],
      kind,
      ...(options.players ? { players: options.players } : {}),
      ...(options.implemented === false ? { implemented: false } : {}),
    }
  })
