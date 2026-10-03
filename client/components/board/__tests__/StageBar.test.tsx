// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { StageBar, STAGE_BREAKPOINTS } from '../StageBar'

describe('StageBar', () => {
  it('renders 14 round cells', () => {
    const { container } = render(<StageBar currentRound={3} />)
    expect(container.querySelectorAll('.stage-bar__cell')).toHaveLength(14)
  })
  it('marks current round as active', () => {
    const { container } = render(<StageBar currentRound={3} />)
    expect(container.querySelector('.stage-bar__cell.is-current')).toHaveTextContent('3')
  })
  it('marks harvest rounds with icon', () => {
    const { container } = render(<StageBar currentRound={1} />)
    for (const r of STAGE_BREAKPOINTS) {
      expect(
        container.querySelector(`.stage-bar__cell[data-round="${r}"].is-harvest`),
      ).toBeInTheDocument()
    }
  })

  it('identifies harvest rounds by a sprite shape and localized accessible name', () => {
    const { container } = render(<StageBar currentRound={1} locale="en" />)
    const harvest = screen.getByRole('listitem', { name: 'Round 4 harvest' })
    expect(harvest.querySelector('.res-icon-harvest')).toBeInTheDocument()
    expect(container.textContent).not.toMatch(/\p{Extended_Pictographic}/u)
  })
})
