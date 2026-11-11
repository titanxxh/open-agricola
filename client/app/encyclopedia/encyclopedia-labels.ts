import type { EncyclopediaEntry, EncyclopediaGroup, EncyclopediaPublicType } from '../../../shared/contract/card-encyclopedia'
import { t, type Locale } from '../../../shared/i18n'

const TYPE_LABEL_KEYS: Readonly<Record<EncyclopediaPublicType, string>> = {
  occupation: 'platform.occupation',
  minor: 'platform.minor',
  major: 'ui.encyclopedia.types.major',
  mother: 'ui.parentCard.mother',
  father: 'ui.parentCard.father',
  moorSpecialAction: 'ui.encyclopedia.types.moorSpecialAction',
  moorStart: 'ui.encyclopedia.types.moorStart',
  season: 'ui.encyclopedia.types.season',
  illustratedAction: 'ui.encyclopedia.types.illustratedAction',
  spaceMerchant: 'ui.encyclopedia.types.spaceMerchant',
  alienArtifact: 'ui.encyclopedia.types.alienArtifact',
  alienEvent: 'ui.encyclopedia.types.alienEvent',
  event: 'ui.encyclopedia.types.event',
  globalEvent: 'ui.encyclopedia.types.globalEvent',
  offspring: 'ui.encyclopedia.types.offspring',
  guest: 'ui.encyclopedia.types.guest',
  expansionRules: 'ui.encyclopedia.types.expansionRules',
}

const GROUP_LABEL_KEYS: Readonly<Record<EncyclopediaGroup, string>> = {
  A: 'ui.encyclopedia.groups.deck',
  B: 'ui.encyclopedia.groups.deck',
  C: 'ui.encyclopedia.groups.deck',
  D: 'ui.encyclopedia.groups.deck',
  E: 'ui.encyclopedia.groups.deck',
  M: 'ui.encyclopedia.groups.deck',
  majorStandard: 'ui.encyclopedia.groups.majorStandard',
  major56: 'ui.encyclopedia.groups.major56',
  majorMoor: 'ui.encyclopedia.groups.majorMoor',
  parents: 'ui.parentSelection.title',
  moor: 'ui.encyclopedia.groups.moor',
  seasons: 'platform.sandboxVariantThroughTheSeasons',
  L: 'ui.encyclopedia.groups.deck',
  X: 'ui.encyclopedia.groups.deck',
  legendairyForest: 'ui.encyclopedia.groups.deck',
  LE: 'ui.encyclopedia.groups.deck',
  changelings: 'ui.encyclopedia.groups.deck',
  newdale: 'ui.encyclopedia.groups.deck',
}

/** Expansion names as printed; they are not translated. */
const SCAN_GROUP_NAMES: Partial<Record<EncyclopediaGroup, string>> = {
  L: 'L-Deck',
  X: 'X-Deck',
  legendairyForest: 'Legendairy Forest',
  LE: 'LE01–LE04',
  changelings: 'Changelings',
  newdale: 'newdale',
}

/** Material that is never bought or scored on its own. */
const UNSCORED_TYPES: ReadonlySet<EncyclopediaPublicType> = new Set([
  'moorSpecialAction', 'moorStart', 'season',
  'illustratedAction', 'globalEvent', 'offspring', 'guest', 'expansionRules',
])

export const encyclopediaTypeLabel = (locale: Locale, type: EncyclopediaPublicType): string =>
  t(locale, TYPE_LABEL_KEYS[type])

export const encyclopediaGroupLabel = (locale: Locale, group: EncyclopediaGroup): string =>
  SCAN_GROUP_NAMES[group] ?? t(locale, GROUP_LABEL_KEYS[group], { deck: group })

export const encyclopediaPointsApply = (entry: EncyclopediaEntry): boolean => !UNSCORED_TYPES.has(entry.publicType)
