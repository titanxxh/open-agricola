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
}

/** Material that is never bought or scored on its own. */
const UNSCORED_TYPES: ReadonlySet<EncyclopediaPublicType> = new Set(['moorSpecialAction', 'moorStart', 'season'])

export const encyclopediaTypeLabel = (locale: Locale, type: EncyclopediaPublicType): string =>
  t(locale, TYPE_LABEL_KEYS[type])

export const encyclopediaGroupLabel = (locale: Locale, group: EncyclopediaGroup): string =>
  t(locale, GROUP_LABEL_KEYS[group], { deck: group })

export const encyclopediaPointsApply = (entry: EncyclopediaEntry): boolean => !UNSCORED_TYPES.has(entry.publicType)
