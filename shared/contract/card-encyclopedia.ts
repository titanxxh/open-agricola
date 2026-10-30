import type { PaymentResource } from './types'
import type { SeasonId } from '../seasons/types'

export type EncyclopediaSourceKind = 'card' | 'major' | 'parent' | 'moorSpecialAction' | 'moorStart' | 'season'

export type EncyclopediaPublicType =
  | 'occupation'
  | 'minor'
  | 'major'
  | 'mother'
  | 'father'
  | 'moorSpecialAction'
  | 'moorStart'
  | 'season'

/** Declared deck / expansion order; the catalog's default order starts from this. */
export const ENCYCLOPEDIA_GROUPS = [
  'A', 'B', 'C', 'D', 'E', 'M', 'major', 'majorFiveSix', 'moor', 'parents', 'seasons',
] as const

export type EncyclopediaGroup = typeof ENCYCLOPEDIA_GROUPS[number]

/** Parts are concatenated; keys resolve through the language pack exactly like `t(locale, key, params)`. */
export type EncyclopediaTextPart =
  | { readonly key: string; readonly params?: Readonly<Record<string, string | number>> }
  | { readonly literal: string }

export type EncyclopediaText = readonly EncyclopediaTextPart[]

export type EncyclopediaTextField = 'name' | 'body' | 'rules' | 'prerequisite'

export type EncyclopediaTexts = {
  readonly name: EncyclopediaText
  readonly body: EncyclopediaText
  readonly rules?: EncyclopediaText
  readonly prerequisite?: EncyclopediaText
}

export type EncyclopediaTerrainTile = { readonly row: number; readonly col: number; readonly kind: 'forest' | 'moor' }

export type EncyclopediaFace =
  | { readonly kind: 'card'; readonly cardId: string; readonly cardType: 'occupation' | 'minor' | 'major' }
  | { readonly kind: 'parent'; readonly parentId: string }
  | {
    readonly kind: 'moorSpecialAction'
    readonly image: string
    readonly actions: readonly string[]
    readonly players: readonly number[]
  }
  | { readonly kind: 'moorStart'; readonly tiles: readonly EncyclopediaTerrainTile[] }
  | { readonly kind: 'season'; readonly season: SeasonId; readonly actionId: string }

export type EncyclopediaCostPath = Readonly<Partial<Record<keyof PaymentResource, number>>>

/**
 * Static printed payment data only. `unlisted` means the card prints no resource
 * cost (an occupation still costs its usual fee); `notApplicable` is for material
 * that is never bought.
 */
export type EncyclopediaCost =
  | { readonly kind: 'printed'; readonly paths: readonly EncyclopediaCostPath[]; readonly returnCards?: readonly string[] }
  | { readonly kind: 'unlisted'; readonly returnCards?: readonly string[] }
  | { readonly kind: 'notApplicable' }

/** `fixed: null` means no fixed score is printed; it is never folded into 0. */
export type EncyclopediaScore = { readonly fixed: number | null; readonly extraVp: boolean }

export type EncyclopediaEntry = {
  readonly key: string
  readonly sourceKind: EncyclopediaSourceKind
  readonly sourceId: string
  readonly group: EncyclopediaGroup
  readonly publicType: EncyclopediaPublicType
  readonly displayNumber: string | null
  readonly face: EncyclopediaFace
  readonly text: EncyclopediaTexts
  readonly cost: EncyclopediaCost
  readonly score: EncyclopediaScore
}

/** `fallback`: the language has no own translation and shows English; `missing`: no language has text. */
export type EncyclopediaTextStatus = 'localized' | 'fallback' | 'missing'

export type EncyclopediaSearchText = { readonly text: string; readonly status: EncyclopediaTextStatus }

export type EncyclopediaSearchDocument = {
  readonly key: string
  /** Stable source id and the number users actually see, for exact matches. */
  readonly identifiers: readonly string[]
  /** Plain text per language: markup removed and icons replaced by their names. */
  readonly locales: Readonly<Record<string, Readonly<Partial<Record<EncyclopediaTextField, EncyclopediaSearchText>>>>>
  /** Canonical names and fixed aliases of the icons printed on the entry, in every language. */
  readonly iconTerms: readonly string[]
}

export type CardEncyclopediaCatalogFile = {
  readonly version: 1
  readonly entries: readonly EncyclopediaEntry[]
}

export type CardEncyclopediaSearchFile = {
  readonly version: 1
  readonly languages: readonly string[]
  readonly documents: readonly EncyclopediaSearchDocument[]
}

export type CardEncyclopediaFileRef = { readonly file: string; readonly sha256: string }

export type CardEncyclopediaManifest = {
  readonly version: 1
  readonly entryCount: number
  readonly languages: readonly string[]
  readonly catalog: CardEncyclopediaFileRef
  readonly search: CardEncyclopediaFileRef
}
