// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
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
})
