export type WorkflowTarget = { issue: number; pr: number; head: string } | { kind: 'tooling'; head: string }
export type Assignment = WorkflowTarget & { version: 1; id: string; worker: string; epoch: number; operations: string[]; authority: string }
export type ControlRequest =
  | { kind: 'pause' | 'resume'; authority: string; finishOnly?: WorkflowTarget[] }
  | { kind: 'grant'; authority: string; assignment: WorkflowTarget & { id: string; worker: string; operations: string[] } }
  | { kind: 'remote-ci-policy'; authority: string; id: string; issue: number; pr: number; head: string }
export interface ControlState { version: 1; epoch: number; mode: 'paused' | 'active'; authority: string; finishOnly: WorkflowTarget[]; waivers: Array<{ id: string; issue: number; pr: number; head: string; gates: string[]; authority: string }> }
export function readJson(file: string): unknown
export function atomicJson(file: string, value: unknown): void
export function workflowDirectory(root: string, workspace: string): string
export function readControl(workspace: string): ControlState
export function withControlLock<T>(workspace: string, callback: () => T | Promise<T>): Promise<T>
export function applyControl(options: { root?: string; workspace: string; request: ControlRequest }): Promise<ControlState | { claim: Assignment; file: string }>
export function withOwnedOperation<T>(options: { root: string; workspace: string; assignment: Assignment | string; operation: string }, callback: (claim: Assignment) => T | Promise<T>): Promise<T>
