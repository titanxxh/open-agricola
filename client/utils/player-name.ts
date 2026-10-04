import { t, type Locale } from '../../shared/i18n'

export const getPlayerDisplayName = (locale: Locale, name: string | null | undefined, playerIndex?: number): string => {
  const defaultNumber = /^Player (\d+)$/.exec(name ?? '')?.[1]
  if (defaultNumber || !name?.trim()) {
    if (!defaultNumber && playerIndex === undefined) return ''
    return t(locale, 'ui.defaultPlayerName', { number: defaultNumber ?? (playerIndex! + 1) })
  }
  return name
}
