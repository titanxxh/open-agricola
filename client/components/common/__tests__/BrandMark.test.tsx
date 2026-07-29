// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { BrandMark } from '../BrandMark'

describe('BrandMark', () => {
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
})
