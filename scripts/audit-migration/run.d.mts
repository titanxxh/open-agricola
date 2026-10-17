export function runValidation(root: string, options: Map<string, string>): Promise<{
  version: number
  head: string
  tree: string
  batch: string
  targets: string[]
  steps: Array<{ name: string; status: string; result: unknown }>
  status: string
  output: string
  raw: string
  prepush: string
  remoteChecked: boolean
}>
