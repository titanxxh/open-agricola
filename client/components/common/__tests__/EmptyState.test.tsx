// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { EmptyState } from '../EmptyState'

describe('EmptyState', () => {
  it('renders title and description', () => {
    render(<EmptyState title="No rooms" description="Be the first to start one!" />)
    expect(screen.getByText('No rooms')).toBeInTheDocument()
    expect(screen.getByText('Be the first to start one!')).toBeInTheDocument()
  })

  it('renders custom icon', () => {
    render(<EmptyState icon="🎲" title="No rooms" />)
    expect(screen.getByText('🎲')).toBeInTheDocument()
  })

  it('renders default icon when none provided', () => {
    render(<EmptyState title="No rooms" />)
    expect(screen.getByLabelText(/empty state/i)).toBeInTheDocument()
  })

  it('renders action when provided', () => {
    render(
      <EmptyState
        title="No rooms"
        action={<button>Create one</button>}
      />,
    )
    expect(screen.getByRole('button', { name: 'Create one' })).toBeInTheDocument()
  })

  it('applies compact variant class', () => {
    const { container } = render(<EmptyState title="X" variant="compact" />)
    expect(container.querySelector('.empty-state--compact')).toBeInTheDocument()
  })
})
