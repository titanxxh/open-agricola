import { useId } from 'react'
import type { TeamConfiguration } from '../../shared/contract/team'
import { useLocale } from '../contexts/LocaleContext'

const scoringOptions = ['sum', 'product', 'category-min', 'total-min'] as const
const seatingOptions = ['separated', 'random'] as const
const visibilityOptions = ['shared', 'private'] as const

export function TeamConfigurationSummary({ maxPlayers, value }: { maxPlayers: number; value: TeamConfiguration }) {
  const { t } = useLocale()
  return <div className="team-config-summary" data-team-mode={value.mode}>
    <span>{t(`team.mode.${value.mode}`)}</span>
    <span>{t('team.configuration', { teams: maxPlayers / value.seatsPerTeam, seats: value.seatsPerTeam })}</span>
    <span>{t(`team.seating.${value.seating}`)}</span>
    <span>{t(`team.scoring.${value.scoring}`)}</span>
    {value.mode === 'team' && <span>{t(`team.visibility.${value.teammateVisibility}`)}</span>}
  </div>
}

export function TeamSetupFields({ maxPlayers, value, onChange }: {
  maxPlayers: number
  value: TeamConfiguration
  onChange: (value: TeamConfiguration) => void
}) {
  const { t } = useLocale()
  const id = useId()
  return <fieldset className="team-setup-fields">
    <legend>{t(`team.mode.${value.mode}`)}</legend>
    <label htmlFor={`${id}-seats`}>{t('team.seatsPerTeam')}
      <select id={`${id}-seats`} value={value.seatsPerTeam} onChange={event => onChange({ ...value,
        seatsPerTeam: maxPlayers === 6 && event.target.value === '3' ? 3 : 2,
      })}>
        <option value="2">{t('team.seatsOption', { count: 2 })}</option>
        {maxPlayers === 6 && <option value="3">{t('team.seatsOption', { count: 3 })}</option>}
      </select>
    </label>
    <label htmlFor={`${id}-seating`}>{t('team.seatingLabel')}
      <select id={`${id}-seating`} value={value.seating} onChange={event => {
        const seating = seatingOptions.find(option => option === event.target.value)
        if (seating) onChange({ ...value, seating })
      }}>{seatingOptions.map(option => <option key={option} value={option}>{t(`team.seating.${option}`)}</option>)}</select>
    </label>
    <label htmlFor={`${id}-scoring`}>{t('team.scoringLabel')}
      <select id={`${id}-scoring`} value={value.scoring} onChange={event => {
        const scoring = scoringOptions.find(option => option === event.target.value)
        if (scoring) onChange({ ...value, scoring })
      }}>{scoringOptions.map(option => <option key={option} value={option}>{t(`team.scoring.${option}`)}</option>)}</select>
    </label>
    {value.mode === 'team' && <label htmlFor={`${id}-visibility`}>{t('team.visibilityLabel')}
      <select id={`${id}-visibility`} value={value.teammateVisibility} onChange={event => {
        const teammateVisibility = visibilityOptions.find(option => option === event.target.value)
        if (teammateVisibility) onChange({ ...value, teammateVisibility })
      }}>{visibilityOptions.map(option => <option key={option} value={option}>{t(`team.visibility.${option}`)}</option>)}</select>
    </label>}
    <p className="team-setup-hint">{t('team.seatingHint')}</p>
  </fieldset>
}
