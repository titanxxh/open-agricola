// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { BrandMark } from '../BrandMark'

describe('BrandMark', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '/')
  })

  it('can expose the Open Agricola wordmark as a native home link', () => {
    render(
      <BrandMark
        title="Open Agricola"
        homeLinkLabel="Back to Lobby"
      />,
    )

    const link = screen.getByRole('link', { name: 'Back to Lobby' })
    expect(link).toHaveAttribute('href', import.meta.env.BASE_URL)
    expect(link).toHaveAttribute('title', 'Back to Lobby')
    expect(link).toHaveTextContent('Open Agricola')
  })

  it('preserves a saved bug report while dropping page-scoped parameters', () => {
    window.history.replaceState(
      null,
      '',
      '/open-agricola/?page=game&room=room-1&bugReport=draft-1&bugReportConnection=connected',
    )

    render(<BrandMark title="Open Agricola" homeLinkLabel="Back to Lobby" />)

    expect(screen.getByRole('link', { name: 'Back to Lobby' }))
      .toHaveAttribute('href', '/open-agricola/?bugReport=draft-1')
  })
})
