import WebSocket from 'ws'
import { BROWSER_AUTH_HEADER, BROWSER_AUTH_VERSION, BROWSER_WS_PROTOCOL } from '../../../shared/contract/browser-auth'

export const BROWSER_TEST_ORIGIN = 'https://frontend.example'
export const browserRequestHeaders = {
  Origin: BROWSER_TEST_ORIGIN,
  [BROWSER_AUTH_HEADER]: String(BROWSER_AUTH_VERSION),
}

export function openBrowserSocket(url: string, cookie: string): WebSocket {
  return new WebSocket(url, BROWSER_WS_PROTOCOL, { headers: { Cookie: cookie, Origin: BROWSER_TEST_ORIGIN } })
}
