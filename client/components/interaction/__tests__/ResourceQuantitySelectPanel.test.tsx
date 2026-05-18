// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ResourceQuantitySelectPanel } from '../ResourceQuantitySelectPanel'

describe('ResourceQuantitySelectPanel', () => {
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
