// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LocaleProvider } from '../../contexts/LocaleContext'
import { AuthProvider } from '../../contexts/AuthContext'
import { LoginPage } from '../LoginPage'
import { PageRouter } from '../PageRouter'

afterEach(() => {
  cleanup()
  window.localStorage.clear()
  window.history.replaceState(null, '', '/')
  vi.unstubAllGlobals()
})

describe('authentication presentation', () => {
  it('presents local login before a separately named provider group', () => {
    window.localStorage.setItem('open-agricola-locale-v2', 'en')
    vi.stubGlobal('fetch', vi.fn(async () =>
      new Response(JSON.stringify({ ok: false }), { status: 401 }),
    ))

    render(
      <LocaleProvider>
        <AuthProvider>
          <LoginPage />
        </AuthProvider>
      </LocaleProvider>,
    )

    const localForm = screen.getByRole('form', { name: 'Sign in with username and password' })
    const providerGroup = screen.getByRole('group', { name: 'Other sign-in options' })

    expect(localForm.compareDocumentPosition(providerGroup) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(within(localForm).getByRole('button', { name: 'Sign In' })).toBeInTheDocument()
    expect(within(providerGroup).getByRole('link', { name: 'Sign in with GitHub' })).toBeInTheDocument()
  })

  it('presents both registration paths without preferring providers in the copy', async () => {
    const user = userEvent.setup()
    window.localStorage.setItem('open-agricola-locale-v2', 'en')
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request) => {
      if (String(input).endsWith('/api/auth/registration-policy')) {
        return new Response(JSON.stringify({ ok: true, policy: 'open' }))
      }
      return new Response(JSON.stringify({ ok: false }), { status: 401 })
    }))

    render(
      <LocaleProvider>
        <AuthProvider>
          <LoginPage />
        </AuthProvider>
      </LocaleProvider>,
    )

    await user.click(screen.getByRole('tab', { name: 'Register' }))

    const localForm = screen.getByRole('form', { name: 'Register with username and email' })
    const providerGroup = screen.getByRole('group', { name: 'Other registration options' })

    expect(screen.getByText('Choose either username and email or GitHub or Google to create an account.')).toBeInTheDocument()
    expect(localForm.compareDocumentPosition(providerGroup) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(within(localForm).getByRole('button', { name: 'Register with username' })).toBeInTheDocument()
    expect(within(providerGroup).getByRole('link', { name: 'Register with GitHub' })).toBeInTheDocument()
  })

  it('associates login helpers and validation errors with their controls', async () => {
    const user = userEvent.setup()
    window.localStorage.setItem('open-agricola-locale-v2', 'en')
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request) => {
      if (String(input).endsWith('/api/auth/login')) {
        return new Response(JSON.stringify({ ok: false, code: 'email_not_verified' }), { status: 403 })
      }
      return new Response(JSON.stringify({ ok: false }), { status: 401 })
    }))

    render(
      <LocaleProvider>
        <AuthProvider>
          <LoginPage />
        </AuthProvider>
      </LocaleProvider>,
    )

    const username = screen.getByLabelText('Username')
    const password = screen.getByLabelText('Password')

    expect(username).toHaveAttribute('aria-describedby', 'login-username-hint')
    expect(password).toHaveAttribute('aria-describedby', 'login-password-hint')
    expect(document.getElementById('login-username-hint')).toHaveTextContent('2-30 characters')

    await user.type(username, 'wrong')
    await user.type(password, 'password123')
    await user.click(screen.getByRole('button', { name: 'Sign In' }))

    expect(screen.getByRole('alert')).toHaveAttribute('id', 'login-error')
    expect(username).toHaveAttribute('aria-invalid', 'true')
    expect(username).toHaveAttribute('aria-errormessage', 'login-error')
    expect(password).toHaveAttribute('aria-errormessage', 'login-error')
    expect(screen.getByLabelText('Email')).toHaveAttribute('aria-describedby', 'login-verification-email-hint')
  })

  it('associates registration helpers and errors without merging their copy', async () => {
    const user = userEvent.setup()
    window.localStorage.setItem('open-agricola-locale-v2', 'en')
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request) => {
      if (String(input).endsWith('/api/auth/registration-policy')) {
        return new Response(JSON.stringify({ ok: true, policy: 'open' }))
      }
      return new Response(JSON.stringify({ ok: false }), { status: 401 })
    }))

    render(
      <LocaleProvider>
        <AuthProvider>
          <LoginPage />
        </AuthProvider>
      </LocaleProvider>,
    )

    await user.click(screen.getByRole('tab', { name: 'Register' }))

    const username = screen.getByLabelText('Username')
    const password = screen.getByLabelText('Password')
    const confirmation = screen.getByLabelText('Confirm Password')

    expect(username).toHaveAttribute('aria-describedby', 'register-username-hint')
    expect(document.getElementById('register-username-hint')).toHaveTextContent('2-30 characters')

    await user.type(username, 'newuser')
    await user.type(screen.getByLabelText('Email'), 'new@example.com')
    await user.type(password, 'password123')
    await user.type(confirmation, 'different123')
    await user.click(screen.getByRole('button', { name: 'Register with username' }))

    expect(screen.getByRole('alert')).toHaveAttribute('id', 'register-error')
    expect(password).toHaveAttribute('aria-invalid', 'true')
    expect(password).toHaveAttribute('aria-errormessage', 'register-error')
    expect(confirmation).toHaveAttribute('aria-errormessage', 'register-error')
  })

  it('replaces expired onboarding with a route back to registration', async () => {
    const user = userEvent.setup()
    window.localStorage.setItem('open-agricola-locale-v2', 'en')
    window.history.replaceState(null, '', '/?page=onboarding')
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request) => {
      const url = String(input)
      if (url.endsWith('/api/auth/registration-policy')) {
        return new Response(JSON.stringify({ ok: true, policy: 'open' }))
      }
      if (url.endsWith('/api/auth/onboarding/complete')) {
        return new Response(JSON.stringify({ ok: false, code: 'oauth_onboarding_expired' }), { status: 400 })
      }
      return new Response(JSON.stringify({ ok: false }), { status: 401 })
    }))

    render(
      <LocaleProvider>
        <AuthProvider>
          <PageRouter />
        </AuthProvider>
      </LocaleProvider>,
    )

    await user.type(await screen.findByLabelText('Username'), 'newuser')
    await user.type(screen.getByLabelText('Password'), 'password123')
    await user.type(screen.getByLabelText('Confirm Password'), 'password123')
    await user.click(screen.getByRole('button', { name: 'Complete registration' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Registration session expired')
    expect(screen.queryByRole('button', { name: 'Complete registration' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Start registration again' }))

    expect(await screen.findByRole('tab', { name: 'Register' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('form', { name: 'Register with username and email' })).toBeInTheDocument()
  })

  it('associates onboarding helpers and validation errors with their controls', async () => {
    const user = userEvent.setup()
    window.localStorage.setItem('open-agricola-locale-v2', 'en')
    window.history.replaceState(null, '', '/?page=onboarding')
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request) => {
      if (String(input).endsWith('/api/auth/registration-policy')) {
        return new Response(JSON.stringify({ ok: true, policy: 'open' }))
      }
      return new Response(JSON.stringify({ ok: false }), { status: 401 })
    }))

    render(
      <LocaleProvider>
        <AuthProvider>
          <PageRouter />
        </AuthProvider>
      </LocaleProvider>,
    )

    const username = await screen.findByLabelText('Username')
    const password = screen.getByLabelText('Password')

    expect(username).toHaveAttribute('aria-describedby', 'onboarding-username-hint')
    expect(password).toHaveAttribute('aria-describedby', 'onboarding-password-hint')

    await user.type(username, 'newuser')
    await user.type(password, 'short')
    await user.type(screen.getByLabelText('Confirm Password'), 'short')
    await user.click(screen.getByRole('button', { name: 'Complete registration' }))

    expect(screen.getByRole('alert')).toHaveAttribute('id', 'onboarding-error')
    expect(password).toHaveAttribute('aria-invalid', 'true')
    expect(password).toHaveAttribute('aria-errormessage', 'onboarding-error')
  })
})
