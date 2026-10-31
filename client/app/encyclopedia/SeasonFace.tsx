import { t, type Locale } from '../../../shared/i18n'
import { seasonBoardAdjustments, seasonBoardNotes, seasonDisplay } from '../../../shared/projections/season-display'
import type { SeasonId } from '../../../shared/seasons/types'
import { SeasonActionCard, SeasonAdjustment, SeasonBoardCopy } from '../../components/board/SeasonBoardPieces'

/** One season cut from the Through the Seasons board: its action space card and what the season changes on the board. */
export function SeasonFace({ locale, season }: { locale: Locale; season: SeasonId }) {
  const display = seasonDisplay[season]
  const name = t(locale, display.nameKey)
  return (
    <div role="group" aria-label={name} className={`encyclopedia-season-face encyclopedia-season-face--${season}`}>
      <span className="encyclopedia-season-face__name">
        <SeasonBoardCopy id={`season-${season}`}>{name}</SeasonBoardCopy>
      </span>
      <span className="encyclopedia-season-face__action">
        <SeasonActionCard locale={locale} season={season} actionName={t(locale, display.action.nameKey)} />
      </span>
      <span className="encyclopedia-season-face__changes">
        {seasonBoardAdjustments.filter((adjustment) => adjustment.season === season).map((adjustment) => (
          <SeasonAdjustment key={adjustment.id} locale={locale} adjustment={adjustment} />
        ))}
        {seasonBoardNotes.filter((note) => note.season === season).map((note) => (
          <SeasonBoardCopy key={note.id} id={note.id}>{t(locale, note.labelKey)}</SeasonBoardCopy>
        ))}
      </span>
    </div>
  )
}
