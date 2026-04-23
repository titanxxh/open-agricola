import { pickLogIcon } from './action-log-icons'

export interface LogEntry {
  id: string
  round: number
  playerId: string
  playerName: string
  text: string
}

interface Props {
  entries: LogEntry[]
}

export function ActionLog({ entries }: Props) {
  // Group by round
  const groups = new Map<number, LogEntry[]>()
  for (const e of entries) {
    if (!groups.has(e.round)) groups.set(e.round, [])
    groups.get(e.round)!.push(e)
  }
  const rounds = [...groups.keys()].sort((a, b) => a - b)

  return (
    <div className="action-log">
      <h3 className="action-log__title">行动记录</h3>
      <div className="action-log__body">
        {rounds.length === 0 && <p className="action-log__empty">暂无</p>}
        {rounds.map((round) => (
          <div key={round}>
            <div className="action-log__round-header">第 {round} 轮</div>
            <ul className="action-log__list">
              {groups.get(round)!.map((e) => (
                <li key={e.id} className="action-log__entry">
                  <span className="action-log__icon" aria-hidden>
                    {pickLogIcon(e.text)}
                  </span>
                  <span className="action-log__player">{e.playerName.slice(0, 1)}</span>
                  <span className="action-log__text">{e.text}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  )
}
