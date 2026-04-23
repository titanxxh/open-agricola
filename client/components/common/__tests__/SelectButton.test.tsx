// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SelectButton } from '../SelectButton'

const OPTIONS = [
  { value: 'zh', label: '中文' },
  { value: 'en', label: 'English' },
] as const

describe('SelectButton', () => {
  it('renders the current value in the trigger', () => {
    render(<SelectButton value="zh" options={OPTIONS as any} onChange={() => {}} />)
    expect(screen.getByRole('button')).toHaveTextContent('中文')
  })

  it('opens the popover on click', async () => {
    const user = userEvent.setup()
    render(<SelectButton value="zh" options={OPTIONS as any} onChange={() => {}} />)
    await user.click(screen.getByRole('button'))
    expect(screen.getByRole('listbox')).toBeInTheDocument()
    expect(screen.getAllByRole('option')).toHaveLength(2)
  })

  it('calls onChange and closes when an option is selected', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<SelectButton value="zh" options={OPTIONS as any} onChange={onChange} />)
    await user.click(screen.getByRole('button'))
    await user.click(screen.getByRole('option', { name: 'English' }))
    expect(onChange).toHaveBeenCalledWith('en')
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })

  it('closes on Escape key', async () => {
    const user = userEvent.setup()
    render(<SelectButton value="zh" options={OPTIONS as any} onChange={() => {}} />)
    await user.click(screen.getByRole('button'))
    expect(screen.getByRole('listbox')).toBeInTheDocument()
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })

  it('navigates with arrow keys and selects with Enter', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<SelectButton value="zh" options={OPTIONS as any} onChange={onChange} />)
    await user.click(screen.getByRole('button'))
    await user.keyboard('{ArrowDown}{Enter}')
    expect(onChange).toHaveBeenCalledWith('en')
  })

  it('respects disabled prop', () => {
    render(<SelectButton value="zh" options={OPTIONS as any} onChange={() => {}} disabled />)
    expect(screen.getByRole('button')).toBeDisabled()
  })
})
