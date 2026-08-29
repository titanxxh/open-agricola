// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ResourceQuantitySelectPanel } from '../ResourceQuantitySelectPanel'

describe('ResourceQuantitySelectPanel', () => {
  it('keeps zero disabled by default', () => {
    const onConfirm = vi.fn()
    render(
      <ResourceQuantitySelectPanel
        locale="en"
        availableByResource={{ food: 2 }}
        onConfirm={onConfirm}
        onCancel={() => {}}
      />,
    )

    expect(screen.getByRole('button', { name: 'Confirm' })).toBeDisabled()
  })

  it('allows confirming zero when requireAtLeastOne is false', async () => {
    const user = userEvent.setup()
    const onConfirm = vi.fn()
    render(
      <ResourceQuantitySelectPanel
        locale="en"
        availableByResource={{ food: 2 }}
        requireAtLeastOne={false}
        onConfirm={onConfirm}
        onCancel={() => {}}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Confirm' }))

    expect(onConfirm).toHaveBeenCalledWith({ food: 0 })
  })

  it('disables an exact rejected resource selection', () => {
    render(
      <ResourceQuantitySelectPanel
        locale="en"
        availableByResource={{ food: 2 }}
        requireAtLeastOne={false}
        isConfirmDisabled={(counts) => counts.food === 0}
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
    )

    expect(screen.getByRole('button', { name: 'Confirm' })).toBeDisabled()
  })

  it('drops stale resource counts when available resources change', async () => {
    const user = userEvent.setup()
    const onConfirm = vi.fn()
    const { rerender } = render(
      <ResourceQuantitySelectPanel
        locale="en"
        availableByResource={{ sheep: 2, boar: 1 }}
        onConfirm={onConfirm}
        onCancel={() => {}}
      />,
    )

    await user.type(screen.getByLabelText('Boar (max 1)'), '1')

    rerender(
      <ResourceQuantitySelectPanel
        locale="en"
        availableByResource={{ sheep: 1 }}
        onConfirm={onConfirm}
        onCancel={() => {}}
      />,
    )
    await user.type(screen.getByLabelText('Sheep (max 1)'), '1')
    await user.click(screen.getByRole('button', { name: 'Confirm' }))

    expect(onConfirm).toHaveBeenCalledWith({ sheep: 1 })
  })
})
