// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MobileTabBar } from '../MobileTabBar'

describe('MobileTabBar', () => {
  it('marks the current tab as active', () => {
    const { container } = render(
      <MobileTabBar current="lobby" onNavigate={() => {}} />,
    )
    expect(container.querySelector('[data-tab="lobby"].is-active')).toBeInTheDocument()
    expect(container.querySelector('[data-tab="workshop"].is-active')).not.toBeInTheDocument()
  })
  it('calls onNavigate when a tab is clicked', async () => {
    const user = userEvent.setup()
    const fn = vi.fn()
    render(<MobileTabBar current="lobby" onNavigate={fn} />)
    await user.click(screen.getByRole('button', { name: /workshop|工坊/i }))
    expect(fn).toHaveBeenCalledWith('workshop')
  })
})
