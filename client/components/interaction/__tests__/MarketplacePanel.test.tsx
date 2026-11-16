// @vitest-environment jsdom
import { fireEvent, render, within } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { MarketplacePanel } from '../MarketplacePanel'

it('submits give and take directions with the selected giver tax and blocks unaffordable edits', () => {
  const onConfirm = vi.fn()
  const view = render(<MarketplacePanel locale="en" actorName="Alice" request={{ kind: 'marketplace-select',
    goods: ['wood', 'food'], availableByResource: { wood: 6, food: 1 },
    teammates: [{ playerId: 'p3', name: 'Carol', availableByResource: { wood: 0, food: 5 } }],
  }} onConfirm={onConfirm} />)
  const confirm = within(view.container).getByRole('button', { name: 'Confirm transfers' })
  const wood = view.container.querySelector('[data-marketplace-resource="wood"]')
  const food = view.container.querySelector('[data-marketplace-resource="food"]')
  if (!(wood instanceof HTMLElement) || !(food instanceof HTMLElement)) throw new Error('Missing Marketplace goods')
  expect(confirm).toBeDisabled()
  fireEvent.change(within(wood).getAllByRole('combobox')[0]!, { target: { value: 'give' } })
  fireEvent.change(within(wood).getByRole('spinbutton'), { target: { value: '3' } })
  fireEvent.change(within(food).getAllByRole('combobox')[0]!, { target: { value: 'take' } })
  fireEvent.change(within(food).getByRole('spinbutton'), { target: { value: '2' } })
  expect(confirm).toBeEnabled()
  expect(wood.querySelector('output')?.textContent).toContain('Alice')
  expect(food.querySelector('output')?.textContent).toContain('Carol')
  fireEvent.change(within(food).getByRole('spinbutton'), { target: { value: '5' } })
  expect(confirm).toBeDisabled()
  expect(onConfirm).not.toHaveBeenCalled()
  fireEvent.change(within(food).getByRole('spinbutton'), { target: { value: '2' } })
  fireEvent.click(confirm)
  expect(onConfirm).toHaveBeenCalledExactlyOnceWith([
    { resource: 'wood', direction: 'give', teammatePlayerId: 'p3', amount: 3 },
    { resource: 'food', direction: 'take', teammatePlayerId: 'p3', amount: 2 },
  ])
  view.unmount()
})
