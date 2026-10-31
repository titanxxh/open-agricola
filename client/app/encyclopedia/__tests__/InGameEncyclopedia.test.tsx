// @vitest-environment jsdom
import { fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { LocaleProvider } from '../../../contexts/LocaleContext'
import { loadCardEncyclopedia } from '../../../services/card-encyclopedia'
import { InGameEncyclopedia } from '../InGameEncyclopedia'
import { encyclopediaBrowseStore } from '../encyclopedia-browse-store'
import { cardEntry, encyclopediaOf, itemFor } from './fixtures'

vi.mock('../../../services/card-encyclopedia', () => ({ loadCardEncyclopedia: vi.fn() }))
const load = vi.mocked(loadCardEncyclopedia)

const numbered = (count: number) => encyclopediaOf(Array.from({ length: count }, (_, index) => {
  const number = String(index + 1).padStart(2, '0')
  return itemFor(cardEntry(`T${number}_Entry`, `T${number}`, { group: 'A', text: { name: [{ literal: `Entry ${number}` }] } }))
}))

const renderPanel = (attentionWindow: string | null = null) => {
  const onClose = vi.fn()
  const panel = (window: string | null) => (
    <LocaleProvider>
      <InGameEncyclopedia locale="en" openedWindow={attentionWindow} attentionWindow={window} onClose={onClose} />
    </LocaleProvider>
  )
  const view = render(panel(attentionWindow))
  return { ...view, onClose, update: (window: string | null) => view.rerender(panel(window)) }
}
const panelDialog = () => screen.getByRole('dialog', { name: 'Card Encyclopedia' })
const cancel = (dialog: HTMLElement) => fireEvent(dialog, new Event('cancel', { cancelable: true }))

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', '') }
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open') }
  Element.prototype.scrollIntoView = vi.fn()
})

beforeEach(() => {
  window.localStorage.setItem('open-agricola-locale-v2', 'en')
  window.history.replaceState(null, '', '/?page=game&transport=ws&room=room-1')
  load.mockResolvedValue(numbered(30))
})

afterEach(() => {
  encyclopediaBrowseStore.reset()
  load.mockReset()
  vi.restoreAllMocks()
})

describe('in-game encyclopedia panel', () => {
  it('opens as a modal panel, loads the catalog on demand and never touches the game URL', async () => {
    const push = vi.spyOn(window.history, 'pushState')
    const replace = vi.spyOn(window.history, 'replaceState')
    expect(load).not.toHaveBeenCalled()
    renderPanel()

    expect(panelDialog()).toHaveAttribute('open')
    expect(await screen.findByRole('heading', { name: 'Results: 30' })).toBeInTheDocument()
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search cards' }), { target: { value: 'Entry' } })
    fireEvent.click(screen.getByRole('button', { name: 'Next page' }))
    fireEvent.click(await screen.findByRole('button', { name: 'View Entry 27' }))
    expect(screen.getByRole('dialog', { name: 'Entry 27' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Close details' }))

    expect(load).toHaveBeenCalledOnce()
    expect(push).not.toHaveBeenCalled()
    expect(replace).not.toHaveBeenCalled()
    expect(window.location.search).toBe('?page=game&transport=ws&room=room-1')
  })

  it('stays open when a nested detail is dismissed or its content is clicked', async () => {
    const { onClose } = renderPanel()
    fireEvent.click(await screen.findByRole('button', { name: 'View Entry 05' }))
    cancel(screen.getByRole('dialog', { name: 'Entry 05' }))
    expect(screen.queryByRole('dialog', { name: 'Entry 05' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'View Entry 06' }))
    fireEvent.click(screen.getByRole('dialog', { name: 'Entry 06' }))
    expect(screen.queryByRole('dialog', { name: 'Entry 06' })).toBeNull()
    fireEvent.click(within(panelDialog()).getByRole('heading', { name: 'Results: 30' }))

    expect(panelDialog()).toHaveAttribute('open')
    expect(onClose).not.toHaveBeenCalled()
  })

  it.each([
    ['its close button', () => fireEvent.click(screen.getByRole('button', { name: 'Close encyclopedia' }))],
    ['Escape', () => cancel(panelDialog())],
    ['the backdrop', () => fireEvent.click(panelDialog())],
  ])('closes from %s', async (_, dismiss) => {
    const { onClose } = renderPanel()
    await screen.findByRole('heading', { name: 'Results: 30' })
    const dialog = panelDialog()

    dismiss()

    expect(dialog).not.toHaveAttribute('open')
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('reopens on the same search and page', async () => {
    const first = renderPanel()
    fireEvent.change(await screen.findByRole('searchbox', { name: 'Search cards' }), { target: { value: 'Entry' } })
    fireEvent.click(screen.getByRole('button', { name: 'Next page' }))
    first.unmount()

    renderPanel()

    expect(await screen.findByText('Page 2 of 2')).toBeInTheDocument()
    expect(screen.getByRole('searchbox', { name: 'Search cards' })).toHaveValue('Entry')
  })

  it('asks for attention politely when a new local window opens, without closing or moving focus', async () => {
    const { onClose, update } = renderPanel(null)
    const search = await screen.findByRole('searchbox', { name: 'Search cards' })
    search.focus()
    const status = within(panelDialog()).getByRole('status')
    expect(status).toBeEmptyDOMElement()
    expect(screen.queryByRole('button', { name: 'Back to game' })).toBeNull()

    update('p1:sow')

    expect(status).toHaveTextContent('Your action is needed')
    expect(search).toHaveFocus()
    expect(panelDialog()).toHaveAttribute('open')
    const changes: MutationRecord[] = []
    const observer = new MutationObserver(records => changes.push(...records))
    observer.observe(status, { childList: true, subtree: true, characterData: true })
    update('p1:sow')
    observer.disconnect()
    expect(changes).toEqual([])
    expect(onClose).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Back to game' }))
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('does not ask for attention for the window that was already open', async () => {
    renderPanel('p1:idle')
    await screen.findByRole('heading', { name: 'Results: 30' })
    expect(within(panelDialog()).getByRole('status')).toBeEmptyDOMElement()
    expect(screen.queryByRole('button', { name: 'Back to game' })).toBeNull()
  })

  it('offers a retry and a way back to the game when the catalog fails to load', async () => {
    load.mockReset()
    load.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(numbered(30))
    const { onClose } = renderPanel()

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent("Couldn't load the encyclopedia")
    fireEvent.click(within(alert).getByRole('button', { name: 'Retry' }))
    expect(await screen.findByRole('heading', { name: 'Results: 30' })).toBeInTheDocument()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('returns to the game from a catalog load failure', async () => {
    load.mockReset()
    load.mockRejectedValue(new Error('offline'))
    const { onClose } = renderPanel()

    fireEvent.click(within(await screen.findByRole('alert')).getByRole('button', { name: 'Back to game' }))

    expect(onClose).toHaveBeenCalledOnce()
  })
})
