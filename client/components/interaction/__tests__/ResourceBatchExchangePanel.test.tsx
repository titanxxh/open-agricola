// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ResourceBatchExchangePanel } from '../ResourceBatchExchangePanel'

describe('ResourceBatchExchangePanel', () => {
  it('disables an exact rejected batch exchange', () => {
    render(
      <ResourceBatchExchangePanel
        locale="en"
        discardAvailableByResource={{ wood: 2 }}
        receiveResources={['stone']}
        maxTotal={2}
        isConfirmDisabled={() => true}
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
    )

    expect(screen.getByRole('button', { name: 'Confirm' })).toBeDisabled()
  })

  it('submits discard and receive maps with equal totals', async () => {
    const user = userEvent.setup()
    const onConfirm = vi.fn()
    render(
      <ResourceBatchExchangePanel
        locale="en"
        discardAvailableByResource={{ wood: 2, clay: 1 }}
        receiveResources={['wood', 'clay', 'reed', 'stone']}
        maxTotal={4}
        onConfirm={onConfirm}
        onCancel={() => {}}
      />,
    )

    await user.type(screen.getByLabelText('Discard Wood (max 2)'), '2')
    await user.type(screen.getByLabelText('Discard Clay (max 1)'), '1')
    await user.type(screen.getByLabelText('Receive Stone'), '3')
    await user.click(screen.getByRole('button', { name: 'Confirm' }))

    expect(onConfirm).toHaveBeenCalledWith({
      discard: { wood: 2, clay: 1 },
      receive: { stone: 3 },
    })
  })
})
