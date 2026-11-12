export class FeedbackError extends Error {
  readonly code: string
  readonly status: number
  constructor(code: string, status: number) { super(code); this.code = code; this.status = status }
}
