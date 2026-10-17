import type { Assignment } from './control.mjs'
export interface DeliveryRequest { assignment: Assignment | string; issue?: number; pr: number; head: string; worktree: string; raw: string; prepush: string; repository?: string; merge?: boolean; localOnly?: boolean; legacyKind?: string; reconcile?: boolean }
export function localProof(request: Pick<DeliveryRequest, 'head' | 'worktree' | 'raw' | 'prepush'>): { head: string; tree: string; sourceFingerprint: string; rawCandidateFingerprint: string; rawCandidateFiles: number }
export function workflowStatus(root: string, workspace: string, request: { pr: number; head: string; issue?: number; repository?: string; worktree?: string; raw?: string; prepush?: string }): unknown
export function deliver(options: { root: string; workspace: string; request: DeliveryRequest }): Promise<unknown>
export function reconcileDelivery(options: { root: string; workspace: string; request: DeliveryRequest }): unknown
export function workflowCommand(root: string, action: string, options: Map<string, string>): Promise<unknown>
