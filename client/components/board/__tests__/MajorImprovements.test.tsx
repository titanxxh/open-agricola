// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render } from '@testing-library/react'
import { MajorImprovements } from '../MajorImprovements'

vi.mock('../../common/PlayerCard', () => ({
  PlayerCard: ({ cardId, onClick, disabled }: { cardId: string; onClick?: () => void; disabled?: boolean }) => (
    <button data-card-anchor={cardId} disabled={disabled} onClick={onClick}>
      {cardId}
    </button>
  ),
}))

const baseProps = {
  locale: 'en' as const,
  availableMajorImprovements: ['Major_Well'],
  isSelectingMajor: true,
  selectableMajorIds: new Set(['Major_Well']),
  cardAvailability: {},
  isInteractive: true,
  futureCardResources: {},
  devMode: false,
}

describe('MajorImprovements', () => {
  it('renders stack count data and selects only the visible top card', () => {
    const resolveChoice = vi.fn()
    const { container, getByTestId } = render(
      <MajorImprovements
        {...baseProps}
        resolveChoice={resolveChoice}
        majorImprovementSupply={[
          {
            familyId: 'well',
            visibleId: 'Major_Well',
            cardIds: ['Major_Well', 'Major_Well2'],
          },
        ]}
      />,
    )

    expect(getByTestId('major-stack-count-well')).toHaveTextContent('2')
    const visible = container.querySelector('[data-card-anchor="Major_Well"]')
    const covered = container.querySelector('[data-card-anchor="Major_Well2"]')
    expect(visible).not.toBeNull()
    expect(covered).toBeNull()

    fireEvent.click(visible!)
    expect(resolveChoice).toHaveBeenCalledWith('major:Major_Well')
  })

  it('preserves flat fallback when stack supply is absent', () => {
    const resolveChoice = vi.fn()
    const { container, queryByTestId } = render(
      <MajorImprovements
        {...baseProps}
        resolveChoice={resolveChoice}
      />,
    )

    expect(queryByTestId('major-stack-count-well')).toBeNull()
    expect(container.querySelector('[data-card-anchor="Major_Well"]')).not.toBeNull()
  })
})
