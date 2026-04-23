// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ActionLog } from '../ActionLog'

describe('ActionLog', () => {
  it('renders translated entries with icons', () => {
    render(
      <ActionLog
        locale="zh"
        currentRound={1}
        log={[
          { key: 'log.gainResources', params: { player: '玩家A', resources: '3 木' } },
          { key: 'log.harvestSummary', params: { player: '玩家B' } },
        ]}
      />,
    )
    // Icon classifier still picks something per entry
    expect(screen.getAllByRole('listitem').length).toBeGreaterThan(0)
  })

  it('groups entries by round using log.enterRound markers', () => {
    const { container } = render(
      <ActionLog
        locale="zh"
        currentRound={2}
        log={[
          { key: 'log.someEntry', params: { player: 'X' } },
          { key: 'log.enterRound', params: { round: 2 } },
          { key: 'log.someEntry', params: { player: 'Y' } },
          { key: 'log.enterRound', params: { round: 1 } },
          { key: 'log.startGame' },
        ]}
      />,
    )
    // Three buckets: round 2, round 1, and a "round 0" pre-game bucket
    // containing log.startGame (entries before the first enterRound marker).
    expect(container.querySelectorAll('.action-log__round-header')).toHaveLength(3)
  })

  it('renders empty state when log is empty', () => {
    render(<ActionLog locale="zh" currentRound={1} log={[]} />)
    expect(screen.getByText('暂无')).toBeInTheDocument()
  })
})
