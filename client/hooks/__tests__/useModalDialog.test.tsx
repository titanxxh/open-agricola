// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { StrictMode } from 'react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { useModalDialog } from '../useModalDialog'

const showModal = vi.fn(function (this: HTMLDialogElement) { this.setAttribute('open', '') })
const close = vi.fn(function (this: HTMLDialogElement) { this.removeAttribute('open') })

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = showModal
  HTMLDialogElement.prototype.close = close
})
afterEach(() => {
  cleanup()
  showModal.mockClear()
  close.mockClear()
})

function Modal({ onClose }: { onClose?: (dialog: HTMLDialogElement | null) => void }) {
  const dialogRef = useModalDialog()
  return (
    <dialog ref={dialogRef} aria-label="Modal">
      <button type="button" onClick={() => onClose?.(dialogRef.current)}>Close</button>
    </dialog>
  )
}

describe('useModalDialog', () => {
  it('opens the dialog as a modal on mount and closes it on unmount', () => {
    const { getByRole, unmount } = render(<Modal />)
    const dialog = getByRole('dialog', { hidden: true })

    expect(showModal.mock.contexts).toEqual([dialog])
    expect(dialog).toHaveAttribute('open')

    unmount()
    expect(close.mock.contexts).toEqual([dialog])
    expect(dialog).not.toHaveAttribute('open')
  })

  it('does not close again on unmount a dialog its owner already closed', () => {
    const { getByRole, unmount } = render(<Modal onClose={(dialog) => dialog?.close()} />)
    getByRole('button', { name: 'Close', hidden: true }).click()
    expect(close).toHaveBeenCalledTimes(1)

    unmount()
    expect(close).toHaveBeenCalledTimes(1)
  })

  it('leaves exactly one modal open after a strict-mode remount', () => {
    const { getByRole } = render(<StrictMode><Modal /></StrictMode>)

    expect(getByRole('dialog', { hidden: true })).toHaveAttribute('open')
    expect(showModal.mock.calls.length - close.mock.calls.length).toBe(1)
  })

  describe('hands focus back to the element that had it when the dialog opened', () => {
    function Page({ open }: { open: boolean }) {
      return (
        <>
          <button type="button">Opener</button>
          <button type="button">Elsewhere</button>
          {open && <Modal />}
        </>
      )
    }
    const button = (name: string) => screen.getByRole('button', { name, hidden: true })
    function openFrom(opener: string) {
      const view = render(<Page open={false} />)
      button(opener).focus()
      view.rerender(<Page open />)
      // showModal() moves focus into the dialog.
      button('Close').focus()
      return view
    }

    it('when focus is still inside the closed dialog', () => {
      const { rerender } = openFrom('Opener')
      rerender(<Page open={false} />)
      expect(button('Opener')).toHaveFocus()
    })

    it('when closing dropped focus onto the body, as WebKit does while a stylesheet loads', () => {
      const { rerender } = openFrom('Opener')
      close.mockImplementationOnce(function (this: HTMLDialogElement) {
        this.removeAttribute('open')
        ;(document.activeElement as HTMLElement | null)?.blur()
      })
      rerender(<Page open={false} />)
      expect(button('Opener')).toHaveFocus()
    })

    it('but not over focus its owner already moved outside the dialog', () => {
      const { rerender } = openFrom('Opener')
      close.mockImplementationOnce(function (this: HTMLDialogElement) {
        this.removeAttribute('open')
        button('Elsewhere').focus()
      })
      rerender(<Page open={false} />)
      expect(button('Elsewhere')).toHaveFocus()
    })
  })
})
