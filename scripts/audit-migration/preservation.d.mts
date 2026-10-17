export function preserveAssertions(before: string, after: string, file?: string): {
  file: string
  retainedAssertions: number
  addedAssertions: number
}
export function checkPreservation(root: string, options: Map<string, string>): {
  mode: string
  base: string
  head: string
  files: ReturnType<typeof preserveAssertions>[]
  limits: string
}
