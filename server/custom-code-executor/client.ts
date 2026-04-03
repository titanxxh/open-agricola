import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import {
  invokeCustomCodeEffect,
  invokeCustomCodeListener,
  validateAndCompileCustomCode,
} from './engine.ts'
import type {
  CustomCodeEffectInvocation,
  CustomCodeEffectResult,
  CustomCodeListenerInvocation,
  CustomCodeListenerResult,
  CustomCodeValidateResult,
} from '../../shared/cards/custom-code-types.ts'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const bridgePath = join(__dirname, 'http-bridge.ts')

const executorUrl = () => process.env.CUSTOM_CODE_EXECUTOR_URL ?? 'http://127.0.0.1:5181'

const isLocalTestMode = () => process.env.NODE_ENV === 'test' && !process.env.CUSTOM_CODE_EXECUTOR_URL

async function postJson<T>(path: string, body: unknown): Promise<T> {
  if (isLocalTestMode()) {
    if (path === '/validate') {
      const payload = body as { source: string; cardId: string }
      return validateAndCompileCustomCode(payload.source, payload.cardId) as T
    }
    throw new Error(`Local async executor path not implemented: ${path}`)
  }

  const response = await fetch(new URL(path, executorUrl()), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return response.json() as Promise<T>
}

function postJsonSync<T>(path: string, body: unknown): T {
  if (isLocalTestMode()) {
    if (path === '/invoke/effect') {
      return invokeCustomCodeEffect(body as CustomCodeEffectInvocation) as T
    }
    if (path === '/invoke/listener') {
      return invokeCustomCodeListener(body as CustomCodeListenerInvocation) as T
    }
    throw new Error(`Local sync executor path not implemented: ${path}`)
  }

  const stdout = execFileSync(
    process.execPath,
    ['--import', 'tsx', bridgePath],
    {
      input: JSON.stringify({
        url: executorUrl(),
        path,
        body,
      }),
      encoding: 'utf-8',
      maxBuffer: 1024 * 1024,
    },
  )
  return JSON.parse(stdout) as T
}

export const validateAndCompileCustomCodeRemote = async (
  source: string,
  cardId: string,
): Promise<CustomCodeValidateResult> =>
  postJson<CustomCodeValidateResult>('/validate', { source, cardId })

export const invokeCustomCodeEffectSync = (
  request: CustomCodeEffectInvocation,
): CustomCodeEffectResult =>
  postJsonSync<CustomCodeEffectResult>('/invoke/effect', request)

export const invokeCustomCodeListenerSync = (
  request: CustomCodeListenerInvocation,
): CustomCodeListenerResult =>
  postJsonSync<CustomCodeListenerResult>('/invoke/listener', request)
