// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DangerButton } from '../DangerButton'

describe('DangerButton', () => {
  it('calls onConfirm directly when no confirmText', async () => {
    const user = userEvent.setup()
    const fn = vi.fn()
    render(<DangerButton onConfirm={fn}>Delete</DangerButton>)
    await user.click(screen.getByRole('button', { name: 'Delete' }))
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('shows confirm dialog when confirmText is set', async () => {
    const user = userEvent.setup()
    const fn = vi.fn()
    render(
      <DangerButton confirmText="Sure?" onConfirm={fn}>Delete</DangerButton>,
    )
    await user.click(screen.getByRole('button', { name: 'Delete' }))
    expect(screen.getByText('Sure?')).toBeInTheDocument()
    expect(fn).not.toHaveBeenCalled()
  })

  it('confirms and calls onConfirm when user accepts', async () => {
    const user = userEvent.setup()
    const fn = vi.fn()
    render(
      <DangerButton confirmText="Sure?" onConfirm={fn}>Delete</DangerButton>,
    )
    await user.click(screen.getByRole('button', { name: 'Delete' }))
    await user.click(screen.getByRole('button', { name: /confirm|确认|yes/i }))
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('cancels and skips onConfirm', async () => {
    const user = userEvent.setup()
    const fn = vi.fn()
    render(
      <DangerButton confirmText="Sure?" onConfirm={fn}>Delete</DangerButton>,
    )
    await user.click(screen.getByRole('button', { name: 'Delete' }))
    await user.click(screen.getByRole('button', { name: /cancel|取消|no/i }))
    expect(fn).not.toHaveBeenCalled()
    expect(screen.queryByText('Sure?')).not.toBeInTheDocument()
  })

  it('shows loading state during async onConfirm', async () => {
    const user = userEvent.setup()
    let resolve!: () => void
    const fn = vi.fn().mockImplementation(() => new Promise<void>((r) => { resolve = r }))
    render(<DangerButton onConfirm={fn}>Delete</DangerButton>)
    await user.click(screen.getByRole('button', { name: 'Delete' }))
    expect(screen.getByRole('button')).toBeDisabled()
    resolve()
  })

  it('respects disabled prop', () => {
    render(<DangerButton onConfirm={() => {}} disabled>Delete</DangerButton>)
    expect(screen.getByRole('button')).toBeDisabled()
  })
})
