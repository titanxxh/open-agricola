import { t, type Locale } from '../../shared/i18n'

export const getPlayerDisplayName = (
  locale: Locale,
  name: string | null | undefined,
  playerIndex?: number,
  nameIsDefault = false,
): string => {
  if (nameIsDefault || !name?.trim()) {
    if (playerIndex === undefined) return ''
    return t(locale, 'ui.defaultPlayerName', { number: playerIndex + 1 })
  }
  return name
}
