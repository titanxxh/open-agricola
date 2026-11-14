import { useId } from 'react'
import type { TeamWaitingRoomState } from '../../shared/contract/team-room'
import type { RoomTeamErrorCode } from '../../shared/contract/protocol/ws'
import { useLocale } from '../contexts/LocaleContext'
import { TeamConfigurationSummary } from './TeamSetupFields'

export function TeamWaitingRoom({ value, onChooseTeam, onStart, disabled, error }: {
  value: TeamWaitingRoomState
  onChooseTeam: (teamIndex: number, memberId?: string) => void
  onStart: () => void
  disabled?: boolean
  error?: RoomTeamErrorCode | null
}) {
  const { t } = useLocale()
  const id = useId()
  const teams = Array.from({ length: value.maxPlayers / value.teamConfig.seatsPerTeam }, (_, index) => index)
  const self = value.members.find(member => member.memberId === value.selfMemberId)
  const occupied = (teamIndex: number, excluding?: string) => value.members
    .filter(member => member.teamIndex === teamIndex && member.memberId !== excluding)
    .reduce((sum, member) => sum + member.seatCount, 0)
  const teamName = (teamIndex: number) => t('team.name', { number: teamIndex + 1 })
  const options = (member: TeamWaitingRoomState['members'][number]) => teams.map(teamIndex => {
    const full = occupied(teamIndex, member.memberId) + member.seatCount > value.teamConfig.seatsPerTeam
    return <option key={teamIndex} value={teamIndex} disabled={full}>{teamName(teamIndex)}{full ? ` (${t('team.full')})` : ''}</option>
  })
  return <section className="team-waiting-room" aria-label={t('team.waitingTitle')}>
    <TeamConfigurationSummary maxPlayers={value.maxPlayers} value={value.teamConfig} />
    <p className="ws-waiting-count" role="status">{t('team.seatsFilled', {
      current: value.members.reduce((sum, member) => sum + member.seatCount, 0), max: value.maxPlayers,
    })}</p>
    <div className="team-waiting-groups">
      {teams.map(teamIndex => <section key={teamIndex} className="team-waiting-group" aria-label={teamName(teamIndex)}>
        <h3>{teamName(teamIndex)} <small>{occupied(teamIndex)}/{value.teamConfig.seatsPerTeam}</small></h3>
        <ul>{value.members.filter(member => member.teamIndex === teamIndex).map(member => <li key={member.memberId} data-member-id={member.memberId}>
          <span className="team-waiting-name">{member.name}{member.memberId === value.selfMemberId ? ` (${t('platform.me')})` : ''}</span>
          {member.isHost && <small>{t('team.host')}</small>}
          {member.connected === false && <small>{t('platform.seatOffline')}</small>}
          {member.seatCount > 1 && <small>{t('team.occupiesSeats', { count: member.seatCount })}</small>}
          {value.isHost && value.teamConfig.mode === 'team' && member.memberId !== value.selfMemberId && <label className="team-member-move" htmlFor={`${id}-${member.memberId}`}>
            {t('team.moveMember', { player: member.name })}
            <select id={`${id}-${member.memberId}`} value={member.teamIndex} disabled={disabled}
              onChange={event => onChooseTeam(Number(event.target.value), member.memberId)}>{options(member)}</select>
          </label>}
        </li>)}</ul>
      </section>)}
    </div>
    {self && value.teamConfig.mode === 'team' && <label className="team-self-select" htmlFor={`${id}-self`}>
      {t('team.chooseTeam')}
      <select id={`${id}-self`} value={self.teamIndex} disabled={disabled}
        onChange={event => onChooseTeam(Number(event.target.value))}>{options(self)}</select>
    </label>}
    {error && <p className="form-error" role="alert">{t(error === 'team_change_failed' ? 'team.changeFailed' : 'team.startFailed')}</p>}
    {value.isHost ? <>
      <button type="button" className="btn-primary team-start" onClick={onStart} disabled={!value.canStart || disabled}>{t('team.start')}</button>
      {!value.canStart && <p>{t('team.startNeedsFull')}</p>}
    </> : <p>{t('team.waitingForHost')}</p>}
  </section>
}
