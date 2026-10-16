import type ts from 'typescript'

export interface NormalizingSnapshotViolation {
  file: string
  line: number
  column: number
  helper: string
  message: string
}

export function snapshotSourcePartition(
  program: ts.Program,
  includedFiles: ReadonlySet<string>,
): { runtimeFiles: string[]; observationFiles: string[] }

export function normalizingSnapshotViolations(
  source: string,
  file: string,
  program: ts.Program,
): NormalizingSnapshotViolation[]
