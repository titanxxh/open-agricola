// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { CardCarousel } from '../CardCarousel'

describe('CardCarousel', () => {
  it('renders title and child cards', () => {
    render(
      <CardCarousel
        title="职业"
        cards={[
          <div key="1" data-testid="card1">A</div>,
          <div key="2" data-testid="card2">B</div>,
        ]}
      />,
    )
    expect(screen.getByText('职业')).toBeInTheDocument()
    expect(screen.getByTestId('card1')).toBeInTheDocument()
    expect(screen.getByTestId('card2')).toBeInTheDocument()
  })

  it('shows empty state when no cards', () => {
    render(<CardCarousel title="x" cards={[]} emptyState="还没有" />)
    expect(screen.getByText('还没有')).toBeInTheDocument()
  })
})
