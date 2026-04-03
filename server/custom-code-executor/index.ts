import { createServer } from 'node:http'
import type { IncomingMessage, ServerResponse } from 'node:http'
import {
  extractManifestFromCompiledCode,
  invokeCustomCodeEffect,
  invokeCustomCodeListener,
  parseEffectHook,
  validateAndCompileCustomCode,
} from './engine.ts'
import type {
  CustomCodeEffectInvocation,
  CustomCodeListenerInvocation,
} from '../../shared/cards/custom-code-types.ts'

const EXECUTOR_PORT = Number(process.env.CUSTOM_CODE_EXECUTOR_PORT ?? '5181')
const EXECUTOR_HOST = process.env.CUSTOM_CODE_EXECUTOR_HOST ?? '0.0.0.0'

const sendJson = (res: ServerResponse, status: number, payload: unknown) => {
  res.writeHead(status, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(payload))
}

const readBody = (req: IncomingMessage): Promise<string> =>
  new Promise((resolve) => {
    let data = ''
    req.on('data', (chunk: Buffer) => { data += chunk.toString() })
    req.on('end', () => resolve(data))
  })

const parseBody = async <T>(req: IncomingMessage): Promise<T | null> => {
  try {
    return JSON.parse(await readBody(req)) as T
  } catch {
    return null
  }
}

const server = createServer(async (req, res) => {
  if (req.method === 'GET' && req.url === '/health') {
    sendJson(res, 200, { ok: true })
    return
  }

  if (req.method === 'POST' && req.url === '/validate') {
    const body = await parseBody<{ source?: string; cardId?: string }>(req)
    if (!body?.source || !body.cardId) {
      sendJson(res, 400, { ok: false, error: 'Missing source or cardId' })
      return
    }
    const result = validateAndCompileCustomCode(body.source, body.cardId)
    sendJson(res, 200, result)
    return
  }

  if (req.method === 'POST' && req.url === '/manifest') {
    const body = await parseBody<{ compiledCode?: string; cardId?: string }>(req)
    if (!body?.compiledCode || !body.cardId) {
      sendJson(res, 400, { ok: false, error: 'Missing compiledCode or cardId' })
      return
    }
    try {
      sendJson(res, 200, {
        ok: true,
        manifest: extractManifestFromCompiledCode(body.compiledCode, body.cardId),
      })
    } catch (error) {
      sendJson(res, 400, { ok: false, error: error instanceof Error ? error.message : String(error) })
    }
    return
  }

  if (req.method === 'POST' && req.url === '/invoke/effect') {
    const body = await parseBody<CustomCodeEffectInvocation>(req)
    if (!body?.compiledCode || !body.cardId || !body.hook) {
      sendJson(res, 400, { ok: false, error: 'Missing invocation payload' })
      return
    }
    const hook = parseEffectHook(body.hook)
    if (!hook) {
      sendJson(res, 400, { ok: false, error: 'Unknown hook' })
      return
    }
    sendJson(res, 200, invokeCustomCodeEffect({ ...body, hook }))
    return
  }

  if (req.method === 'POST' && req.url === '/invoke/listener') {
    const body = await parseBody<CustomCodeListenerInvocation>(req)
    if (!body?.compiledCode || !body.cardId || !body.registrationId || !body.context) {
      sendJson(res, 400, { ok: false, error: 'Missing invocation payload' })
      return
    }
    sendJson(res, 200, invokeCustomCodeListener(body))
    return
  }

  sendJson(res, 404, { ok: false, error: 'Not found' })
})

server.listen(EXECUTOR_PORT, EXECUTOR_HOST, () => {
  console.log(`[custom-code-executor] listening on ${EXECUTOR_HOST}:${EXECUTOR_PORT}`)
})
