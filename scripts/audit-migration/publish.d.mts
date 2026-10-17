export function publishExisting(options: {
  root: string
  workspace: string
  request: unknown
}): Promise<{
  mode: string
  head: string
  results: Array<{ operation: string; state: string; head?: string; bodySha256?: string; kind?: string; commentId?: number; url?: string }>
  reviewsWaived: boolean
}>
