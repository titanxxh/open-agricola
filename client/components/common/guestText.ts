import type { ActionChoiceOption, PlayerState } from '../../../shared/contract/types'
import { t, type Locale } from '../../../shared/i18n'
import { getCardDisplayName } from './cardText'

export function getGuestDispatchLabel(locale: Locale, option: ActionChoiceOption): string | undefined {
  const cardId = option.labelParams?.guestCardId
  if (typeof cardId !== 'string') return undefined
  return t(locale, 'ui.guest.dispatch', { card: getCardDisplayName(locale, cardId) })
}

export function getGuestMarkerLabel(
  locale: Locale,
  playerName: string,
  guests: PlayerState['guests'],
  workerId: string,
): string {
  const guest = guests?.find(candidate => candidate.id === workerId)
  return guest ? t(locale, 'ui.guest.marker', {
    player: playerName,
    card: getCardDisplayName(locale, guest.sourceCardId),
  }) : playerName
}
