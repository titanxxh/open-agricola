import { moorMajorDisplayNumber, officialCardDeck, officialCardDisplayNumber } from '../../../shared/projections/card-display-number'
import type { CardType } from './cardText'

/** Painted by `card-sprite.css`; the inline style only positions it. */
export const MAJOR_ICON_SPRITE_PATH = '/assets/revised/majors_icons.jpg'

const DECK_DIRECTORIES: Readonly<Record<string, string>> = { A: 'deckA', B: 'deckB', C: 'deckC', D: 'deckD', E: 'deckE' }

const PLAYER56_PORTRAITS = new Set(
  ['A', 'B', 'C', 'D'].flatMap((deck) =>
    Array.from({ length: 12 }, (_, index) => `${deck}${169 + index}`),
  ),
)

export const moorMajorArtPath = (cardId: string): string | undefined => {
  const numbering = moorMajorDisplayNumber(cardId)
  return numbering ? `/assets/moor/major/${numbering}.png` : undefined
}

/** Public asset path of the art an official card face shows, before `publicAssetUrl`. */
export const officialCardArtPath = (cardId: string, cardType: CardType): string | undefined => {
  if (cardType === 'major') return moorMajorArtPath(cardId) ?? MAJOR_ICON_SPRITE_PATH
  const numbering = officialCardDisplayNumber(cardId)
  if (!numbering) return undefined
  if (PLAYER56_PORTRAITS.has(numbering)) return `/assets/player56/${numbering}.png`
  const deck = officialCardDeck(cardId)
  if (cardType === 'minor' && deck === 'M') return `/assets/moor/minor/${numbering}.png`
  const directory = deck ? DECK_DIRECTORIES[deck] : undefined
  return directory ? `/assets/revised/${directory}/${numbering}.png` : undefined
}
