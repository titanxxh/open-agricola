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
    const { container } = render(<ScorePanel locale="en" rows={ROWS} />)
    const firstRow = container.querySelector('.score-panel__row')
    expect(container.textContent).not.toMatch(/\p{Extended_Pictographic}/u)
    expect(firstRow?.querySelector('[title="Fields"] .res-icon-field')).toBeInTheDocument()
    expect(firstRow?.querySelector('[title="Animals"] .res-icon-sheep')).toBeInTheDocument()
    expect(firstRow?.querySelector('[title="Card bonus VP"] .res-icon-score')).toBeInTheDocument()
    expect(firstRow?.querySelector('[title="Family members"] .res-icon-child')).toBeInTheDocument()
    expect(firstRow?.querySelector('[title="Cards"] .res-icon-minor')).toBeInTheDocument()
  })

  it('renders one row per player', () => {
    render(<ScorePanel locale="en" rows={ROWS} />)
    expect(screen.getByText('You')).toBeInTheDocument()
    expect(screen.getByText('AI')).toBeInTheDocument()
  })
  it('shows total score', () => {
    render(<ScorePanel locale="en" rows={ROWS} />)
    expect(screen.getByText('12')).toBeInTheDocument()
    expect(screen.getByText('9')).toBeInTheDocument()
  })
  it('highlights "you" row', () => {
    const { container } = render(<ScorePanel locale="en" rows={ROWS} />)
    expect(container.querySelector('.score-panel__row.is-you')).toBeInTheDocument()
  })
  it('shows breakdown chips', () => {
    render(<ScorePanel locale="en" rows={ROWS} />)
    expect(screen.getAllByText(/fields/i).length).toBeGreaterThan(0)
  })

  it('labels card bonus VP separately from printed cards', () => {
    render(<ScorePanel locale="en" rows={ROWS} />)
    expect(screen.getByText(/bonus VP 4/i)).toBeInTheDocument()
    expect(screen.getByText(/cards 2/i)).toBeInTheDocument()
    expect(screen.queryByText(/food 4/i)).toBeNull()
  })

  it('localizes the score title and breakdown labels', () => {
    render(<ScorePanel locale="zh" rows={ROWS.slice(0, 1)} />)

    expect(screen.getByRole('heading', { name: '计分板' })).toBeInTheDocument()
    expect(screen.getByText(/田地 3/)).toBeInTheDocument()
    expect(screen.getByText(/动物 5/)).toBeInTheDocument()
    expect(screen.getByText(/卡牌加分 4/)).toBeInTheDocument()
    expect(screen.getByText(/家庭成员 3/)).toBeInTheDocument()
    expect(screen.getByText(/卡牌分 2/)).toBeInTheDocument()
  })
})
