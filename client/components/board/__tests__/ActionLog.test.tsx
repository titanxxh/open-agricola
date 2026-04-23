// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ActionLog } from '../ActionLog'

describe('ActionLog', () => {
  it('renders entries with icons', () => {
    render(
      <ActionLog
        entries={[
          { id: 'e1', round: 1, playerId: 'p1', playerName: 'You', text: '取了 3 木' },
          { id: 'e2', round: 1, playerId: 'p2', playerName: 'AI', text: '收获了 1 麦' },
        ]}
      />,
    )
    expect(screen.getByText(/取了 3 木/)).toBeInTheDocument()
    expect(screen.getByText(/收获了 1 麦/)).toBeInTheDocument()
    expect(screen.getByText('💰')).toBeInTheDocument()
    expect(screen.getByText('🌾')).toBeInTheDocument()
  })
  it('groups by round', () => {
    const { container } = render(
      <ActionLog
        entries={[
          { id: 'e1', round: 1, playerId: 'p1', playerName: 'You', text: 'a' },
          { id: 'e2', round: 2, playerId: 'p1', playerName: 'You', text: 'b' },
        ]}
      />,
    )
    expect(container.querySelectorAll('.action-log__round-header')).toHaveLength(2)
  })
})
