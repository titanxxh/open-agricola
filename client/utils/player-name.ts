import { t, type Locale } from '../../shared/i18n'

export const getPlayerDisplayName = (locale: Locale, name: string | null | undefined, playerIndex?: number): string => {
  const defaultLetter = /^(?:Player|player)([A-F])$/.exec(name ?? '')?.[1]
  const defaultNumber = /^Player (\d+)$/.exec(name ?? '')?.[1]
    ?? (defaultLetter ? defaultLetter.charCodeAt(0) - 'A'.charCodeAt(0) + 1 : undefined)
  if (defaultNumber || !name?.trim()) {
    if (!defaultNumber && playerIndex === undefined) return ''
    return t(locale, 'ui.defaultPlayerName', { number: defaultNumber ?? (playerIndex! + 1) })
  }
  return name
}
