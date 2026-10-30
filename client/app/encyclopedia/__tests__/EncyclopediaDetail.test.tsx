// @vitest-environment jsdom
import { fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { EncyclopediaDetail } from '../EncyclopediaDetail'
import { encyclopediaShareUrl } from '../encyclopedia-url'
import { BASEBOARDS, cardEntry, COOKING_HEARTH, itemFor, MARKET_WORK, parentEntry, stubImages } from './fixtures'

vi.stubGlobal('Image', stubImages(() => 'load'))

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', '') }
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open') }
})

const writeText = vi.fn<(text: string) => Promise<void>>()
Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
afterEach(() => writeText.mockReset())

const fact = (label: string) => {
  const term = screen.getByText(label, { selector: 'dt' })
  return term.nextElementSibling as HTMLElement
}

describe('encyclopedia detail', () => {
  it('marks only the fields that fall back to English and says when both languages are missing', () => {
    const entry = cardEntry('A004_Baseboards', 'A004', {
      text: {
        name: [{ key: 'cardFaces.A004_Baseboards.name' }],
        body: [{ key: 'cardFaces.A004_Baseboards.description' }],
        rules: [{ key: 'cardFaces.A004_Baseboards.rules' }],
      },
    })
    render(<EncyclopediaDetail entryKey={entry.key} item={itemFor(entry, { body: 'fallback', rules: 'missing' })} locale="zh" onClose={() => {}} />)

    expect(screen.getByRole('heading', { level: 2, name: '护壁板' })).toBeInTheDocument()
    expect(screen.getAllByText('此项暂无中文，显示英文')).toHaveLength(1)
    expect(within(screen.getByRole('region', { name: '牌面文字' })).getByText('此项暂无中文，显示英文')).toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: '规则补充' })).getByText('中英文均暂缺')).toBeInTheDocument()
  })

  it('lists every printed cost option and the fields that do not apply', () => {
    render(<EncyclopediaDetail entryKey={BASEBOARDS.key} item={itemFor(BASEBOARDS)} locale="en" onClose={() => {}} />)

    expect(fact('Deck or expansion')).toHaveTextContent('Deck A')
    expect(fact('Card type')).toHaveTextContent('Minor Improvement')
    expect(fact('Cost')).toHaveTextContent(/^Printed resource cost2\s*or\s*1$/)
    expect(within(fact('Cost')).getAllByRole('img').map(icon => icon.getAttribute('aria-label'))).toEqual(['Food', 'Grain'])
    expect(fact('Points')).toHaveTextContent('No fixed points listed')
    expect(screen.queryByText('Players', { selector: 'dt' })).toBeNull()
    expect(screen.getByText(/Static card data/)).toBeInTheDocument()
  })

  it('shows return-card upgrades, fixed points and printed player counts', () => {
    const { unmount } = render(<EncyclopediaDetail entryKey={COOKING_HEARTH.key} item={itemFor(COOKING_HEARTH)} locale="en" onClose={() => {}} />)
    expect(fact('Deck or expansion')).toHaveTextContent('Standard Major Improvements')
    expect(fact('Card type')).toHaveTextContent('Major Improvement')
    expect(fact('Cost')).toHaveTextContent('Upgrade by returning a card · Fireplace')
    expect(fact('Points')).toHaveTextContent('Fixed points: 1')
    unmount()

    render(<EncyclopediaDetail entryKey={MARKET_WORK.key} item={itemFor(MARKET_WORK)} locale="en" onClose={() => {}} />)
    expect(fact('Players')).toHaveTextContent('1, 5, 6')
    expect(fact('Cost')).toHaveTextContent('Cost not applicable')
    expect(fact('Points')).toHaveTextContent('Points not applicable')
    expect(fact('Card type')).toHaveTextContent('Moor Special Action')
  })

  it('keeps fractional and negative fixed points and the bonus marker as printed', () => {
    const mother = { ...parentEntry('PR02', 'mother', -0.25), score: { fixed: -0.25, extraVp: true } }
    render(<EncyclopediaDetail entryKey={mother.key} item={itemFor(mother)} locale="en" onClose={() => {}} />)

    expect(fact('Points')).toHaveTextContent('Fixed points: -0.25')
    expect(fact('Points')).toHaveTextContent('Marked with bonus points')
    expect(fact('Cost')).toHaveTextContent('Cost not applicable')
  })

  it('copies a link that carries only the page and the entry', async () => {
    writeText.mockResolvedValue()
    render(<EncyclopediaDetail entryKey={BASEBOARDS.key} item={itemFor(BASEBOARDS)} locale="en" onClose={() => {}} />)

    fireEvent.click(screen.getByRole('button', { name: 'Copy card link' }))

    expect(await screen.findByText('Card link copied')).toHaveAttribute('role', 'status')
    expect(writeText).toHaveBeenCalledWith(encyclopediaShareUrl(BASEBOARDS.key))
    expect([...new URL(writeText.mock.calls[0][0]).searchParams.keys()]).toEqual(['page', 'entry'])
  })

  it('says so when the clipboard refuses the link', async () => {
    writeText.mockRejectedValue(new Error('denied'))
    render(<EncyclopediaDetail entryKey={BASEBOARDS.key} item={itemFor(BASEBOARDS)} locale="en" onClose={() => {}} />)

    fireEvent.click(screen.getByRole('button', { name: 'Copy card link' }))

    expect(await screen.findByText("Couldn't copy the link")).toHaveAttribute('role', 'status')
  })

  it('closes from the close button, back to results and Escape', () => {
    const onClose = vi.fn()
    render(<EncyclopediaDetail entryKey={BASEBOARDS.key} item={itemFor(BASEBOARDS)} locale="en" onClose={onClose} />)

    fireEvent.click(screen.getByRole('button', { name: 'Close details' }))
    fireEvent.click(screen.getByRole('button', { name: 'Back to results' }))
    fireEvent(screen.getByRole('dialog'), new Event('cancel', { cancelable: true }))

    expect(onClose).toHaveBeenCalledTimes(3)
  })

  it('reports an unknown entry instead of substituting another card', () => {
    const onClose = vi.fn()
    render(<EncyclopediaDetail entryKey="card:A004_Baseboard" item={undefined} locale="en" onClose={onClose} />)

    expect(screen.getByRole('heading', { name: 'Not in the encyclopedia' })).toBeInTheDocument()
    expect(screen.getByText("The linked entry isn't in the current catalog.")).toBeInTheDocument()
    expect(screen.queryByText('Baseboards')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Copy card link' })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Back to catalog' }))
    expect(onClose).toHaveBeenCalledOnce()
  })
})
