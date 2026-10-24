// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ClientInteractionState } from '../../../shared/contract/protocol/game'
import { useInteractionFocus } from '../interaction-focus'

const occupation: ClientInteractionState = {
  stateId: 'wait', playerIndex: 0, spaceId: 'lessons',
  promptKey: 'ui.interactionChooseOccupation', allowedCommands: ['resolveChoice'], anytimeActions: [],
  request: { kind: 'choice', options: [{ value: 'A116_WoodCutter', labelKey: 'occupations.A116_WoodCutter.name' }] },
}
const idle: ClientInteractionState = { stateId: 'idle', allowedCommands: ['takeAction'], anytimeActions: [] }

const Harness = ({ interaction = occupation, permitted = true }: {
  interaction?: ClientInteractionState
  permitted?: boolean
}) => {
  const focus = useInteractionFocus({ interaction, canFocus: permitted, playerId: 'p1', onViewPlayer: () => {} })
  return <div className="app">
    <div data-interaction-focus="actions">Action spaces</div>
    <div data-interaction-focus="occupation-hand" data-focus-player="p1">Occupations</div>
    <div data-interaction-focus="controls">Payment controls</div>
    {focus.hasTarget && <button onClick={focus.returnToTarget}>Return to current action</button>}
  </div>
}

beforeEach(() => {
  vi.spyOn(window, 'scrollBy').mockImplementation(() => {})
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    const top = this.dataset.interactionFocus === 'occupation-hand' ? 1200 : 10
    return { x: 0, y: top, top, left: 0, right: 320, bottom: top + 180, width: 320, height: 180, toJSON: () => ({}) }
  })
})
afterEach(() => { cleanup(); vi.restoreAllMocks() })

describe('Interaction Focus', () => {
  it('reveals the occupation hand once and leaves manual browsing alone until the shortcut is used', async () => {
    const view = render(<Harness />)
    await waitFor(() => expect(window.scrollBy).toHaveBeenCalledOnce())
    expect(document.querySelector('[data-interaction-focus="occupation-hand"]')).toHaveAttribute('data-interaction-focused', 'true')
    view.rerender(<Harness interaction={structuredClone(occupation)} />)
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 30)) })
    expect(window.scrollBy).toHaveBeenCalledOnce()
    fireEvent.click(screen.getByRole('button', { name: 'Return to current action' }))
    await waitFor(() => expect(window.scrollBy).toHaveBeenCalledTimes(2))
  })

  it('follows payment and the next occupation without returning until the action is complete', async () => {
    const view = render(<Harness />)
    await waitFor(() => expect(window.scrollBy).toHaveBeenCalledOnce())
    const payment: ClientInteractionState = {
      ...occupation, stateId: 'wait', playerIndex: 0,
      promptKey: 'ui.interactionChooseOne', allowedCommands: ['resolveChoice'], anytimeActions: [],
      request: { kind: 'choice', options: [{ value: 'pay', labelKey: 'ui.interactionConfirmButton' }] },
    }
    view.rerender(<Harness interaction={payment} />)
    await waitFor(() => expect(document.querySelector('[data-interaction-focus="controls"]')).toHaveAttribute('data-interaction-focused', 'true'))
    expect(document.querySelector('[data-interaction-focus="actions"]')).not.toHaveAttribute('data-interaction-focused')
    view.rerender(<Harness />)
    await waitFor(() => expect(window.scrollBy).toHaveBeenCalledTimes(2))
    view.rerender(<Harness interaction={idle} />)
    await waitFor(() => expect(document.querySelector('[data-interaction-focus="actions"]')).toHaveAttribute('data-interaction-focused', 'true'))
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('waits for local permission before showing a private target and ignores other players', async () => {
    const view = render(<Harness permitted={false} />)
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 30)) })
    expect(window.scrollBy).not.toHaveBeenCalled()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    view.rerender(<Harness />)
    await waitFor(() => expect(window.scrollBy).toHaveBeenCalledOnce())
    view.rerender(<Harness permitted={false} interaction={idle} />)
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 30)) })
    expect(window.scrollBy).toHaveBeenCalledOnce()
  })

  it('highlights a fully visible occupation hand without scrolling', async () => {
    vi.mocked(HTMLElement.prototype.getBoundingClientRect).mockImplementation(() => ({
      x: 0, y: 20, top: 20, left: 0, right: 320, bottom: 200, width: 320, height: 180, toJSON: () => ({}),
    }))
    render(<Harness />)
    await waitFor(() => expect(document.querySelector('[data-interaction-focus="occupation-hand"]')).toHaveAttribute('data-interaction-focused', 'true'))
    expect(window.scrollBy).not.toHaveBeenCalled()
  })

  it('focuses occupation hand multiselect through the same local target', async () => {
    render(<Harness interaction={{
      stateId: 'wait', playerIndex: 0, allowedCommands: ['commitSelection'], anytimeActions: [],
      request: { kind: 'selection', selection: { kind: 'occupation-hand', selectableCards: ['A116_WoodCutter'], minSelections: 1, maxSelections: 1 } },
    }} />)
    await waitFor(() => expect(window.scrollBy).toHaveBeenCalledOnce())
    expect(screen.getByRole('button', { name: 'Return to current action' })).toBeVisible()
  })

  it('keeps manual browsing during candidate refreshes but reveals a distinct identical request', async () => {
    const request = { ...occupation, requestKey: 'opaque-first' }
    const view = render(<Harness interaction={request} />)
    await waitFor(() => expect(window.scrollBy).toHaveBeenCalledOnce())
    view.rerender(<Harness interaction={{ ...request, request: {
      kind: 'choice', options: [{ value: 'A124_Knapper', labelKey: 'occupations.A124_Knapper.name' }],
    } }} />)
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 30)) })
    expect(window.scrollBy).toHaveBeenCalledOnce()
    view.rerender(<Harness interaction={{ ...request, requestKey: 'opaque-second' }} />)
    await waitFor(() => expect(window.scrollBy).toHaveBeenCalledTimes(2))
  })
})
