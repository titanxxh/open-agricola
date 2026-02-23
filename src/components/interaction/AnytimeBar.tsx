import type { Locale } from '../../../shared/i18n'
import { t } from '../../../shared/i18n'
import type { PendingAnimalReorg, PendingChoice } from '../../types/ui'

type Props = {
  hasAnytimeReorg: boolean
  pendingChoice: PendingChoice | null
  pendingNextPlayerIndex: number | null
  pendingAnimalReorg: PendingAnimalReorg | null
  locale: Locale
  openAnytimeReorg: () => void
}

export const AnytimeBar = ({
  hasAnytimeReorg,
  pendingChoice,
  pendingNextPlayerIndex,
  pendingAnimalReorg,
  locale,
  openAnytimeReorg,
}: Props) =>
  hasAnytimeReorg ? (
    <div className="anytime-bar">
      <div className="anytime-title">{t(locale, 'ui.anytimeActions')}</div>
      <div className="anytime-actions">
        <button
          onClick={openAnytimeReorg}
          disabled={
            !!pendingChoice ||
            pendingAnimalReorg !== null ||
            pendingNextPlayerIndex !== null
          }
        >
          {t(locale, 'ui.anytimeReorgAnimals')}
        </button>
      </div>
    </div>
  ) : null
