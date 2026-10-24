// @vitest-environment jsdom

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { PlayerCard } from '../PlayerCard'
import { useCardPlayChoice } from '../../../hooks/useCardPlayChoice'
import type { CardType } from '../PlayerCard'

const touch = (element: Element) => {
  fireEvent(element, Object.assign(new MouseEvent('pointerdown', { bubbles: true, clientX: 20, clientY: 20 }), { pointerType: 'touch' }))
  fireEvent(element, Object.assign(new MouseEvent('pointerup', { bubbles: true, clientX: 20, clientY: 20 }), { pointerType: 'touch' }))
  fireEvent.click(element)
}

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', '') }
})

describe('touch card play', () => {
  it.each([
    { cardType: 'occupation', cards: ['A116_WoodCutter', 'A124_Knapper'] },
    { cardType: 'minor', cards: ['A076_Cob', 'A007_GardenersKnife'] },
    { cardType: 'major', cards: ['Major_Fireplace1', 'Major_Fireplace2'] },
  ] satisfies { cardType: CardType; cards: string[] }[])('permits $cardType choices when an authoritative continuation restores the original request', ({ cardType, cards }) => {
    const submit = vi.fn(() => true)
    const Selection = ({ requestKey }: { requestKey: string }) => {
      const play = useCardPlayChoice(requestKey, submit)
      return <>{cards.map(cardId => <PlayerCard key={cardId} locale="en" cardId={cardId} cardType={cardType}
        onClick={() => play(cardId)} touchInteraction={{ kind: 'play', requestKey }} />)}</>
    }
    const view = render(<Selection requestKey="original-choice" />)
    const select = (cardId: string) => {
      touch(view.container.querySelector(`[data-card-anchor="${cardId}"]`)!)
      const play = screen.getByRole('button', { name: 'Play this card' })
      expect(play).toBeEnabled()
      fireEvent.click(play)
      expect(screen.queryByRole('dialog')).toBeNull()
    }
    select(cards[0]!)
    view.rerender(<Selection requestKey="payment" />)
    view.rerender(<Selection requestKey="original-choice" />)
    select(cards[1]!)
    view.rerender(<Selection requestKey="continuation" />)
    view.rerender(<Selection requestKey="original-choice" />)
    select(cards[0]!)
    expect(submit.mock.calls).toEqual([[cards[0]], [cards[1]], [cards[0]]])
  })

  it('keeps old details stale when a previous request key becomes active again', () => {
    const submit = vi.fn()
    const view = render(<PlayerCard locale="en" cardId="A116_WoodCutter" cardType="occupation" onClick={submit}
      touchInteraction={{ kind: 'play', requestKey: 'original-choice' }} />)
    touch(view.container.querySelector('[data-card-anchor]')!)
    view.rerender(<PlayerCard locale="en" cardId="A116_WoodCutter" cardType="occupation" onClick={submit}
      touchInteraction={{ kind: 'play', requestKey: 'payment' }} />)
    view.rerender(<PlayerCard locale="en" cardId="A116_WoodCutter" cardType="occupation" onClick={submit}
      touchInteraction={{ kind: 'play', requestKey: 'original-choice' }} />)
    const play = screen.getByRole('button', { name: 'Play this card' })
    expect(play).toBeDisabled()
    fireEvent.click(play)
    expect(submit).not.toHaveBeenCalled()
  })

  it('does not let an old successful submission close details opened under a later activation', async () => {
    let finish = (_accepted: boolean) => {}
    const pending = new Promise<boolean>(resolve => { finish = resolve })
    const submit = vi.fn().mockReturnValueOnce(pending)
    const Selection = ({ requestKey }: { requestKey: string }) => {
      const play = useCardPlayChoice(requestKey, submit)
      return <PlayerCard locale="en" cardId="A116_WoodCutter" cardType="occupation" onClick={() => play('A116_WoodCutter')}
        touchInteraction={{ kind: 'play', requestKey }} />
    }
    const view = render(<Selection requestKey="original-choice" />)
    const card = view.container.querySelector('[data-card-anchor]')!
    touch(card)
    fireEvent.click(screen.getByRole('button', { name: 'Play this card' }))
    view.rerender(<Selection requestKey="payment" />)
    view.rerender(<Selection requestKey="original-choice" />)
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    touch(card)
    expect(screen.getByRole('button', { name: 'Play this card' })).toBeEnabled()
    await act(async () => { finish(true); await pending })
    expect(screen.getByRole('dialog')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Play this card' })).toBeEnabled()
  })

  it('does not let an old failed submission release a newer in-flight selection after restoration', async () => {
    let failOld = (_accepted: boolean) => {}
    let acceptNew = (_accepted: boolean) => {}
    const oldPending = new Promise<boolean>(resolve => { failOld = resolve })
    const newPending = new Promise<boolean>(resolve => { acceptNew = resolve })
    const submit = vi.fn().mockReturnValueOnce(oldPending).mockReturnValueOnce(newPending)
    const Selection = ({ requestKey }: { requestKey: string }) => {
      const play = useCardPlayChoice(requestKey, submit)
      return <PlayerCard locale="en" cardId="A116_WoodCutter" cardType="occupation" onClick={() => play('A116_WoodCutter')}
        touchInteraction={{ kind: 'play', requestKey }} />
    }
    const view = render(<Selection requestKey="original-choice" />)
    const card = view.container.querySelector('[data-card-anchor]')!
    touch(card)
    fireEvent.click(screen.getByRole('button', { name: 'Play this card' }))
    view.rerender(<Selection requestKey="payment" />)
    view.rerender(<Selection requestKey="original-choice" />)
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    touch(card)
    fireEvent.click(screen.getByRole('button', { name: 'Play this card' }))
    await act(async () => { failOld(false); await oldPending })
    const play = screen.getByRole('button', { name: 'Play this card' })
    expect(play).toBeDisabled()
    fireEvent.click(play)
    expect(submit).toHaveBeenCalledTimes(2)
    await act(async () => { acceptNew(true); await newPending })
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('keeps failed card details open and permits retry after transport settlement', async () => {
    const submit = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true)
    const Selection = () => {
      const play = useCardPlayChoice('same-live-request', submit)
      return <PlayerCard locale="en" cardId="A116_WoodCutter" cardType="occupation"
        onClick={() => play('A116_WoodCutter')}
        touchInteraction={{ kind: 'play', requestKey: 'same-live-request' }} />
    }
    const { container } = render(<Selection />)
    touch(container.querySelector('[data-card-anchor]')!)
    const play = screen.getByRole('button', { name: 'Play this card' })
    fireEvent.click(play)
    await waitFor(() => expect(screen.getByRole('button', { name: 'Play this card' })).toBeEnabled())
    expect(screen.getByRole('dialog')).toBeVisible()
    fireEvent.click(play)
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(submit).toHaveBeenCalledTimes(2)
  })

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
