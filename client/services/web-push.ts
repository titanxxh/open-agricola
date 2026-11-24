import {
  isWebPushId, WEB_PUSH_CLICK_PATH, WEB_PUSH_DEVICE_PATH,
  WEB_PUSH_UNBIND_PATH, type WebPushClick, type WebPushKind, type WebPushPreferences, type WebPushTarget,
} from '../../shared/contract/web-push'
import { API_BASE } from '../config'
import { browserApiFetch } from './browser-api'
import { findPagesWorkerRegistration } from './pages-worker'

const DEVICE = 'open-agricola:web-push-device-v1'
const PENDING_UNBIND = 'open-agricola:web-push-unbind-v1'

type LocalBinding = { deviceId: string; userId: string }
export type WebPushStatus = {
  publicKey: string | null
  deviceCount: number | null
  allowed: WebPushPreferences
  preferences: WebPushPreferences
}

export const webPushEnabledBuild = import.meta.env.VITE_STABLE_PAGES_WORKER === '1'

function storedValue(key: string): unknown {
  try { return JSON.parse(localStorage.getItem(key) ?? 'null') } catch { return null }
}

function currentDevice(): LocalBinding | null {
  const value = storedValue(DEVICE)
  return value && typeof value === 'object' && 'deviceId' in value && isWebPushId(value.deviceId)
    && 'userId' in value && typeof value.userId === 'string' ? { deviceId: value.deviceId, userId: value.userId } : null
}

function pendingUnbinds(): string[] {
  const values = storedValue(PENDING_UNBIND)
  return Array.isArray(values) ? values.filter(isWebPushId) : []
}

function fetchWebPush(path: string, body: unknown, signal = AbortSignal.timeout(10_000)) {
  return browserApiFetch(`${API_BASE}${path}`, {
    method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body), signal,
  })
}

export async function drainWebPushUnbinds(): Promise<void> {
  if (!webPushEnabledBuild) return
  for (const deviceId of pendingUnbinds()) {
    try {
      const response = await fetchWebPush(WEB_PUSH_UNBIND_PATH, { deviceId })
      if (!response.ok) continue
      localStorage.setItem(PENDING_UNBIND, JSON.stringify(pendingUnbinds().filter(id => id !== deviceId)))
    } catch { return }
  }
}

async function localPushRegistration(capability: 'webPush' | 'retireSubscription'): Promise<ServiceWorkerRegistration | null> {
  if (!webPushEnabledBuild || !('PushManager' in window)) return null
  return findPagesWorkerRegistration(capability)
}

export const findWebPushRegistration = () => localPushRegistration('webPush')

export async function reconcileWebPushDevice(
  userId: string | null,
  options: { unsubscribe?: boolean; onlyUserId?: string } = {},
): Promise<void> {
  if (!webPushEnabledBuild) return
  const binding = currentDevice()
  if (binding && binding.userId !== userId && (!options.onlyUserId || binding.userId === options.onlyUserId)) {
    localStorage.setItem(PENDING_UNBIND, JSON.stringify([...new Set([...pendingUnbinds(), binding.deviceId])]))
    localStorage.removeItem(DEVICE)
    if (options.unsubscribe) {
      // Explicit sign-out tries local unsubscribe even if there is no network.
      const registration = await localPushRegistration('retireSubscription').catch(() => null)
      const subscription = await registration?.pushManager.getSubscription().catch(() => null)
      if (!currentDevice()) await subscription?.unsubscribe().catch(() => false)
    }
  }
  await drainWebPushUnbinds()
}

/** Ignore a session response issued before a different tab changed this browser's device. */
export function captureWebPushAccountReconciliation(): (userId: string | null) => void {
  const initial = webPushEnabledBuild ? currentDevice()?.deviceId : undefined
  return userId => {
    if (webPushEnabledBuild && currentDevice()?.deviceId === initial) {
      void reconcileWebPushDevice(userId).catch(() => {})
    }
  }
}

function readPreferences(value: unknown): WebPushPreferences {
  if (!value || typeof value !== 'object' || !('draft' in value) || typeof value.draft !== 'boolean'
    || !('bug-report-inbox' in value) || typeof value['bug-report-inbox'] !== 'boolean'
    || ('turn' in value && typeof value.turn !== 'boolean')) throw new Error('Invalid notification preferences')
  return { draft: value.draft, 'bug-report-inbox': value['bug-report-inbox'], turn: 'turn' in value && value.turn === true }
}

const isDeviceCount = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0

export async function getAccountPushDeviceCount(userId: string): Promise<number> {
  const response = await fetchWebPush(WEB_PUSH_DEVICE_PATH, { operation: 'summary', accountId: userId })
  if (!response.ok) throw new Error('Notification device count unavailable')
  const data: unknown = await response.json()
  if (!data || typeof data !== 'object' || !('deviceCount' in data) || !isDeviceCount(data.deviceCount)) {
    throw new Error('Invalid notification device count')
  }
  return data.deviceCount
}

async function readStatus(response: Response): Promise<WebPushStatus> {
  if (!response.ok) throw new Error('Notification settings unavailable')
  const value: unknown = await response.json()
  if (!value || typeof value !== 'object' || !('ok' in value) || value.ok !== true || !('publicKey' in value)
    || (value.publicKey !== null && typeof value.publicKey !== 'string')
    || ('deviceCount' in value && !isDeviceCount(value.deviceCount))
    || !('allowed' in value)
    || !('preferences' in value)) throw new Error('Invalid notification settings')
  return {
    deviceCount: 'deviceCount' in value && isDeviceCount(value.deviceCount) ? value.deviceCount : null,
    publicKey: value.publicKey, allowed: readPreferences(value.allowed), preferences: readPreferences(value.preferences),
  }
}

export async function getWebPushStatus(registration: ServiceWorkerRegistration, userId: string): Promise<WebPushStatus> {
  await drainWebPushUnbinds()
  const current = currentDevice()
  if (current && current.userId !== userId) throw new Error('Notification account changed')
  const device = current ?? { deviceId: crypto.randomUUID(), userId }
  const subscription = await registration.pushManager.getSubscription()
  const status = await readStatus(await fetchWebPush(WEB_PUSH_DEVICE_PATH, {
    operation: 'status', accountId: userId, deviceId: device.deviceId, endpoint: subscription?.endpoint ?? null,
  }))
  const latest = currentDevice()
  if (latest?.deviceId === device.deviceId) return status
  if (current || (latest && latest.userId !== userId)) throw new Error('Notification account changed')
  if (latest) return getWebPushStatus(registration, userId)
  if (Object.values(status.allowed).some(Boolean)) localStorage.setItem(DEVICE, JSON.stringify(device))
  return status
}

function applicationServerKey(value: string) {
  return Uint8Array.from(atob(value.replaceAll('-', '+').replaceAll('_', '/')), char => char.charCodeAt(0))
}

export async function setWebPushPreference(args: {
  registration: ServiceWorkerRegistration
  userId: string
  key: string
  kind: WebPushKind
  enabled: boolean
  locale: string
}): Promise<WebPushStatus> {
  const { registration, userId, key, kind, enabled, locale } = args
  // Subscribe while the browser still has the click's user activation.
  const device = currentDevice()
  if (!device || device.userId !== userId) throw new Error('Notification account changed')
  const subscription = enabled
    ? await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: applicationServerKey(key) })
    : await registration.pushManager.getSubscription()
  if (currentDevice()?.deviceId !== device.deviceId) throw new Error('Notification account changed')
  const status = await readStatus(await fetchWebPush(WEB_PUSH_DEVICE_PATH, {
    operation: 'set', accountId: userId, deviceId: device.deviceId, subscription: subscription?.toJSON() ?? null, kind, enabled, locale,
  }))
  if (!Object.values(status.preferences).some(Boolean)) await subscription?.unsubscribe().catch(() => false)
  return status
}

export async function resolveWebPushClick(click: WebPushClick, accountId: string, signal: AbortSignal): Promise<WebPushTarget> {
  const response = await fetchWebPush(WEB_PUSH_CLICK_PATH, { ...click, accountId }, signal)
  if (!response.ok) return { kind: 'unavailable' }
  const value: unknown = await response.json()
  if (value && typeof value === 'object' && 'kind' in value && value.kind === click.kind) {
    if ((value.kind === 'draft' || value.kind === 'turn') && 'roomId' in value && typeof value.roomId === 'string') return { kind: value.kind, roomId: value.roomId }
    if (value.kind === 'bug-report-inbox' && 'messageId' in value && typeof value.messageId === 'number'
      && Number.isSafeInteger(value.messageId) && value.messageId > 0) return { kind: 'bug-report-inbox', messageId: value.messageId }
  }
  return { kind: 'unavailable' }
}
