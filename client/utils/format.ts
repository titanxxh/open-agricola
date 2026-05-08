import { t, type Locale } from '../../shared/i18n'
import type { Resource } from '../../shared/contract/types'
import { resourceKeyList } from '../../shared/session/state-constants'

export const formatResources = (
  locale: Locale,
  resources: Resource,
  hideZero = false,
) =>
  resourceKeyList
    .filter((key) => !hideZero || (resources[key] ?? 0) > 0)
    .map((key) => `${t(locale, `resources.${key}`)} ${resources[key] ?? 0}`)
    .join(' · ')

export const formatAnimalCounts = (
  locale: Locale,
  counts: { sheep: number; boar: number; cattle: number },
) =>
  `${t(locale, 'resources.sheep')} ${counts.sheep} · ${t(
    locale,
    'resources.boar',
  )} ${counts.boar} · ${t(locale, 'resources.cattle')} ${counts.cattle}`
