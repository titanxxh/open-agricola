// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ScorePanel, type PlayerScoreRow } from '../ScorePanel'

const ROWS: PlayerScoreRow[] = [
  {
    id: 'p1',
    name: 'You',
    isYou: true,
    total: 12,
    breakdown: { fields: 3, animals: 5, cardBonusVp: 4, family: 3, cards: 2 },
  },
  {
    id: 'p2',
    name: 'AI',
    total: 9,
    breakdown: { fields: 2, animals: 3, cardBonusVp: 2, family: 2, cards: 0 },
  },
]

describe('ScorePanel', () => {
  it('keeps score categories visible without emoji glyphs', () => {
    const { container } = render(<ScorePanel rows={ROWS} />)
    const firstRow = container.querySelector('.score-panel__row')
    expect(container.textContent).not.toMatch(/\p{Extended_Pictographic}/u)
    expect(firstRow?.querySelector('[title="fields"] .res-icon-field')).toBeInTheDocument()
    expect(firstRow?.querySelector('[title="animals"] .res-icon-sheep')).toBeInTheDocument()
    expect(firstRow?.querySelector('[title="card bonus VP"] .res-icon-score')).toBeInTheDocument()
    expect(firstRow?.querySelector('[title="family"] .res-icon-child')).toBeInTheDocument()
    expect(firstRow?.querySelector('[title="cards"] .res-icon-minor')).toBeInTheDocument()
  })

  it('renders one row per player', () => {
    render(<ScorePanel rows={ROWS} />)
    expect(screen.getByText('You')).toBeInTheDocument()
    expect(screen.getByText('AI')).toBeInTheDocument()
  })
  it('shows total score', () => {
    render(<ScorePanel rows={ROWS} />)
    expect(screen.getByText('12')).toBeInTheDocument()
    expect(screen.getByText('9')).toBeInTheDocument()
  })
  it('highlights "you" row', () => {
    const { container } = render(<ScorePanel rows={ROWS} />)
    expect(container.querySelector('.score-panel__row.is-you')).toBeInTheDocument()
  })
  it('shows breakdown chips', () => {
    render(<ScorePanel rows={ROWS} />)
    expect(screen.getAllByText(/fields/i).length).toBeGreaterThan(0)
  })

  it('labels card bonus VP separately from printed cards', () => {
    render(<ScorePanel rows={ROWS} />)
    expect(screen.getByText(/bonus VP 4/i)).toBeInTheDocument()
    expect(screen.getByText(/cards 2/i)).toBeInTheDocument()
    expect(screen.queryByText(/food 4/i)).toBeNull()
  })
})
