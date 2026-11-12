import type { IncomingMessage, ServerResponse } from 'node:http'
import { BugReportFeedbackService, FeedbackError } from './bug-report/feedback-service'
import { corsHeaders } from './http-origin'

const ADMIN_ROUTE = '/api/admin/bug-report-feedback'
const INBOX_ROUTE = '/api/v1/inbox'

function positiveInteger(value: string | null): number {
  const result = value !== null && /^[1-9]\d*$/.test(value) ? Number(value) : NaN
  if (!Number.isSafeInteger(result)) throw new FeedbackError('invalid_inbox_query', 400)
  return result
}

async function readBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = []
  let bytes = 0
  for await (const chunk of req.iterator({ destroyOnReturn: false })) {
    const buffer = Buffer.from(chunk)
    bytes += buffer.length
    if (bytes > 32768) {
      req.resume()
      throw new FeedbackError('feedback_body_too_large', 413)
    }
    chunks.push(buffer)
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')) }
  catch { throw new FeedbackError('invalid_feedback', 400) }
}

export function createBugReportFeedbackHandler({ service, authenticate, requireAdmin }: {
  service: BugReportFeedbackService
  authenticate: (req: IncomingMessage) => Promise<{ id: string } | null>
  requireAdmin: (req: IncomingMessage, res: ServerResponse) => Promise<{ id: string } | null>
}) {
  return async (req: IncomingMessage, res: ServerResponse): Promise<boolean> => {
    const url = new URL(req.url ?? '/', 'http://localhost')
    const { pathname } = url
    const detail = /^\/api\/v1\/inbox\/([^/]+)(\/read)?$/.exec(pathname)
    if (pathname !== ADMIN_ROUTE && pathname !== INBOX_ROUTE && !detail) return false
    res.setHeader('Cache-Control', 'no-store')
    res.setHeader('X-Content-Type-Options', 'nosniff')
    const send = (status: number, body: unknown) => {
      res.writeHead(status, { ...corsHeaders(), 'Content-Type': 'application/json; charset=utf-8' })
      res.end(JSON.stringify(body))
    }
    try {
      if (pathname === ADMIN_ROUTE) {
        const admin = await requireAdmin(req, res)
        if (!admin) return true
        if (req.method === 'GET') {
          send(200, { ok: true, report: await service.getReport(positiveInteger(url.searchParams.get('issue'))) })
        } else if (req.method === 'POST') {
          const feedback = await service.recordFeedback(admin.id, await readBody(req))
          send(200, { ok: true, report: await service.getReport(feedback.issueNumber) })
        } else {
          res.setHeader('Allow', 'GET, POST')
          send(405, { ok: false, code: 'method_not_allowed' })
        }
        return true
      }
      const user = await authenticate(req)
      if (!user) { send(401, { ok: false, code: 'not_authenticated' }); return true }
      if (pathname === INBOX_ROUTE && req.method === 'GET') {
        send(200, { ok: true, ...await service.listInbox(user.id, {
          ...(url.searchParams.has('before') ? { before: positiveInteger(url.searchParams.get('before')) } : {}),
          ...(url.searchParams.has('limit') ? { limit: positiveInteger(url.searchParams.get('limit')) } : {}),
        }) })
      } else if (detail && req.method === (detail[2] ? 'POST' : 'GET')) {
        const id = positiveInteger(detail[1] ?? null)
        const message = detail[2] ? await service.markRead(user.id, id) : await service.getMessage(user.id, id)
        send(200, { ok: true, message })
      } else {
        res.setHeader('Allow', detail?.[2] ? 'POST' : 'GET')
        send(405, { ok: false, code: 'method_not_allowed' })
      }
    } catch (error) {
      send(error instanceof FeedbackError ? error.status : 503, { ok: false,
        code: error instanceof FeedbackError ? error.code : 'feedback_unavailable' })
    }
    return true
  }
}
