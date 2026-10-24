// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render } from '@testing-library/react'
import { MajorImprovements } from '../MajorImprovements'

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
  it('renders stacked cards and selects only the visible top card', () => {
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
    expect(covered).not.toBeNull()
    expect(covered).toHaveClass('major-stack-card-covered')

    fireEvent.click(covered!)
    expect(resolveChoice).not.toHaveBeenCalled()
    fireEvent.click(visible!)
    expect(resolveChoice).toHaveBeenCalledWith('Major_Well')
  })

  it('starts mixed selection collapsed and preserves an explicit collapse through repeated snapshots', () => {
    const resolveChoice = vi.fn()
    const props = { ...baseProps, minorChoiceCount: 1, selectionRequestKey: 'mixed-1', resolveChoice }
    const { container, getByRole, rerender } = render(<MajorImprovements {...props} />)
    expect(container.querySelector('.major-row')).toBeNull()
    const toggle = getByRole('button', { name: 'Show major improvements (1)' })
    fireEvent.click(toggle)
    expect(container.querySelector('[data-card-anchor="Major_Well"]')).not.toBeNull()
    fireEvent.click(getByRole('button', { name: 'Hide major improvements' }))
    rerender(<MajorImprovements {...props} selectableMajorIds={new Set(['Major_Well'])} />)
    expect(container.querySelector('.major-row')).toBeNull()
    rerender(<MajorImprovements {...props} minorChoiceCount={0} />)
    expect(container.querySelector('.major-row')).toBeNull()
    rerender(<MajorImprovements {...props} minorChoiceCount={0} selectionRequestKey="major-only-2" />)
    expect(container.querySelector('[data-card-anchor="Major_Well"]')).not.toBeNull()
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
