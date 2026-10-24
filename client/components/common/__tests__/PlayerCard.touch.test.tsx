// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { PlayerCard } from '../PlayerCard'
import { useCardPlayChoice } from '../../../hooks/useCardPlayChoice'

const touch = (element: Element) => {
  fireEvent(element, Object.assign(new MouseEvent('pointerdown', { bubbles: true, clientX: 20, clientY: 20 }), { pointerType: 'touch' }))
  fireEvent(element, Object.assign(new MouseEvent('pointerup', { bubbles: true, clientX: 20, clientY: 20 }), { pointerType: 'touch' }))
  fireEvent.click(element)
}

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', '') }
})

describe('touch card play', () => {
  it('opens occupation details on a tap and submits only through the play button', () => {
    const onClick = vi.fn()
    const { container } = render(
      <PlayerCard locale="en" cardId="A116_WoodCutter" cardType="occupation" onClick={onClick}
        touchInteraction={{ kind: 'play', requestKey: 'occupation-1' }} />,
    )
    const card = container.querySelector('[data-card-anchor="A116_WoodCutter"]')
    expect(card).not.toBeNull()
    touch(card!)
    expect(onClick).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog')).toHaveTextContent('Wood Cutter')
    fireEvent.click(screen.getByRole('button', { name: 'Play this card' }))
    expect(onClick).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('keeps an old detail request disabled after another request replaces it', () => {
    const onClick = vi.fn()
    const { container, rerender } = render(
      <PlayerCard locale="en" cardId="A116_WoodCutter" cardType="occupation" onClick={onClick}
        touchInteraction={{ kind: 'play', requestKey: 'occupation-1' }} />,
    )
    touch(container.querySelector<HTMLElement>('[data-card-anchor]')!)
    rerender(<PlayerCard locale="en" cardId="A116_WoodCutter" cardType="occupation" onClick={onClick}
      touchInteraction={{ kind: 'play', requestKey: 'occupation-2' }} />)
    const play = screen.getByRole('button', { name: 'Play this card' })
    expect(play).toBeDisabled()
    fireEvent.click(play)
    expect(onClick).not.toHaveBeenCalled()
  })

  it('shows disabled improvement details without allowing a stale or repeated submission', () => {
    const onClick = vi.fn()
    const { container, rerender } = render(
      <PlayerCard locale="en" cardId="Major_Well" cardType="major" onClick={onClick}
        touchInteraction={{ kind: 'play', requestKey: 'improvement-1' }} />,
    )
    const card = container.querySelector<HTMLElement>('[data-card-anchor]')!
    touch(card)
    rerender(<PlayerCard locale="en" cardId="Major_Well" cardType="major" disabled onClick={onClick}
      touchInteraction={{ kind: 'play', requestKey: 'improvement-1' }} />)
    expect(screen.getByRole('button', { name: 'Play this card' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    rerender(<PlayerCard locale="en" cardId="Major_Well" cardType="major" onClick={onClick}
      touchInteraction={{ kind: 'play', requestKey: 'improvement-1' }} />)
    touch(card)
    fireEvent.click(screen.getByRole('button', { name: 'Play this card' }))
    touch(card)
    expect(screen.getByRole('button', { name: 'Play this card' })).toBeDisabled()
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('reads unselectable cards and dismisses without scrolling the card into view', () => {
    const { container } = render(<PlayerCard locale="en" cardId="A116_WoodCutter" cardType="occupation"
      disabled touchInteraction={{ kind: 'inspect' }} />)
    const card = container.querySelector<HTMLElement>('[data-card-anchor]')!
    const focus = vi.spyOn(card, 'focus')
    touch(card)
    expect(screen.getByRole('dialog')).toHaveTextContent('Wood Cutter')
    expect(screen.queryByRole('button', { name: 'Play this card' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(focus).toHaveBeenCalledWith({ preventScroll: true })
  })

  it('ignores a touch swipe and retains direct mouse and keyboard selection', () => {
    const onClick = vi.fn()
    const { container } = render(<PlayerCard locale="en" cardId="A116_WoodCutter" cardType="occupation" onClick={onClick}
      touchInteraction={{ kind: 'play', requestKey: 'occupation-1' }} />)
    const card = container.querySelector<HTMLElement>('[data-card-anchor]')!
    fireEvent(card, Object.assign(new MouseEvent('pointerdown', { bubbles: true, clientX: 20, clientY: 20 }), { pointerType: 'touch' }))
    fireEvent(card, Object.assign(new MouseEvent('pointermove', { bubbles: true, clientX: 20, clientY: 60 }), { pointerType: 'touch' }))
    fireEvent.click(card)
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(onClick).not.toHaveBeenCalled()
    fireEvent.click(card)
    fireEvent.keyDown(card, { key: 'Enter' })
    expect(onClick).toHaveBeenCalledTimes(2)
  })

  it('submits at most one card across the hand and supply for the same request', () => {
    const resolveChoice = vi.fn()
    const Selection = () => {
      const playCard = useCardPlayChoice('improvement-1', resolveChoice)
      return <>
        <PlayerCard locale="en" cardId="A076_Cob" cardType="minor" onClick={() => playCard('A076_Cob')}
          touchInteraction={{ kind: 'play', requestKey: 'improvement-1' }} />
        <PlayerCard locale="en" cardId="Major_Well" cardType="major" onClick={() => playCard('Major_Well')}
          touchInteraction={{ kind: 'play', requestKey: 'improvement-1' }} />
      </>
    }
    const { container } = render(<Selection />)
    const cards = container.querySelectorAll('[data-card-anchor]')
    touch(cards[0]!)
    fireEvent.click(screen.getByRole('button', { name: 'Play this card' }))
    touch(cards[1]!)
    fireEvent.click(screen.getByRole('button', { name: 'Play this card' }))
    expect(resolveChoice).toHaveBeenCalledExactlyOnceWith('A076_Cob')
  })
})
