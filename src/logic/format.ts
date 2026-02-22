import { t, type Locale } from '../i18n'
import type { Resource } from '../game/types'

export const formatResources = (
  locale: Locale,
  resources: Resource,
  hideZero = false,
) =>
  (Object.keys(resources) as (keyof Resource)[])
    .filter((key) => !hideZero || resources[key] > 0)
    .map((key) => `${t(locale, `resources.${key}`)} ${resources[key]}`)
    .join(' · ')

export const formatAnimalCounts = (
  locale: Locale,
  counts: { sheep: number; boar: number; cattle: number },
) =>
  `${t(locale, 'resources.sheep')} ${counts.sheep} · ${t(
    locale,
    'resources.boar',
  )} ${counts.boar} · ${t(locale, 'resources.cattle')} ${counts.cattle}`
