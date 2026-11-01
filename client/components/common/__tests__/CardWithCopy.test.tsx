// @vitest-environment jsdom
import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { CardWithCopy } from '../CardWithCopy'

afterEach(() => vi.useRealTimers())

it('restores the card preview when the pointer returns from a reference to ordinary card text', () => {
  vi.useFakeTimers()
  render(<CardWithCopy locale="en" cardId="test" previewCard={<p>Enlarged card</p>}>
    <span>Card title</span><span data-action-reference="space:fishing">Fishing</span>
  </CardWithCopy>)
  const title = screen.getByText('Card title')
  const reference = screen.getByText('Fishing')
  fireEvent.pointerEnter(title, { pointerType: 'mouse' })
  act(() => vi.advanceTimersByTime(300))
  expect(screen.getByText('Enlarged card')).toBeVisible()
  fireEvent.pointerOver(reference, { pointerType: 'mouse', relatedTarget: title })
  expect(screen.queryByText('Enlarged card')).toBeNull()
  fireEvent.pointerOver(title, { pointerType: 'mouse', relatedTarget: reference })
  act(() => vi.advanceTimersByTime(300))
  expect(screen.getByText('Enlarged card')).toBeVisible()
  fireEvent.pointerOut(title, { pointerType: 'mouse', relatedTarget: document.body })
  act(() => vi.advanceTimersByTime(150))
  expect(screen.queryByText('Enlarged card')).toBeNull()
})
