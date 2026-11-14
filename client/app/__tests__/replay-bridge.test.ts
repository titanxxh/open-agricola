// @vitest-environment jsdom
import { isArrayBuffer } from 'node:util/types'
import { MessageChannel } from 'node:worker_threads'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { attachReplayBridge, serveReplayBridge } from '../replay-bridge'
import type { ReplayBridgeContext } from '../../../shared/contract/protocol/replay-bridge'
import type { ReplayManifest } from '../../../shared/contract/protocol/replay'

const context: ReplayBridgeContext = {
  protocolVersion: 1, nonce: 'c'.repeat(32), environment: 'prerelease', targetId: 'pre',
  appBuildId: 'a'.repeat(40), generationId: '11111111-1111-1111-1111-111111111111',
  roomId: 'room-1', viewerBuildId: 'b'.repeat(64), schemaVersion: 1, mode: { kind: 'archive' },
}
const manifest: ReplayManifest = { ok: true, kind: 'replayManifest', apiVersion: 1, roomId: 'room-1',
  viewerBuildId: 'b'.repeat(64), schemaVersion: 1, gameBuildId: 'a'.repeat(40), firstStepNo: 0, lastStepNo: 0,
  participants: [], customCards: [], segments: [{ checkpointStepNo: 0, firstStepNo: 0, lastStepNo: 0 }],
  steps: [], corruptRanges: [], missingPrefix: false }
const close: (() => void)[] = []
afterEach(() => { close.splice(0).forEach(fn => fn()); vi.unstubAllGlobals(); document.body.innerHTML = '' })

function fixture(options: { read?: typeof fetch; source?: ReplayManifest; context?: ReplayBridgeContext } = {}) {
  const { port1, port2 } = new MessageChannel()
  let active = true
  const listeners = new Set<() => void>()
  close.push(() => { port1.close(); port2.close() })
  const stop = serveReplayBridge(port1, options.context ?? context, options.source ?? manifest, {
    authority: { assert() { if (!active) throw new Error('expired') }, remainingMs: () => active ? 1000 : 0,
      revision: () => active ? 1 : 2, subscribe(fn) { listeners.add(fn); return () => { listeners.delete(fn) } } },
    read: options.read ?? (async url => {
      if (url === '/api/v1/replays/room-1/manifest') return new Response(JSON.stringify(options.source ?? manifest))
      throw new Error('unexpected_network')
    }),
  })
  close.push(stop)
  const next = () => new Promise<unknown>(resolve => port2.once('message', resolve))
  return { port: port2, next, revoke() { active = false; listeners.forEach(fn => fn()) } }
}

describe('authenticated parent replay bridge', () => {
  it('serves the bound manifest through a private port and closes it on idle revocation', async () => {
    const { port, next, revoke } = fixture()
    const result = next()
    port.postMessage({ type: 'read', nonce: context.nonce, requestId: 'r1', read: { kind: 'manifest' } })
    const message = await result
    expect(message).toMatchObject({ type: 'data', requestId: 'r1', status: 200, contentType: 'application/json' })
    if (!message || typeof message !== 'object' || !('bytes' in message) || !isArrayBuffer(message.bytes)) throw new Error('missing bytes')
    expect(JSON.parse(new TextDecoder().decode(message.bytes))).toEqual(manifest)
    const closed = next()
    revoke()
    expect(await closed).toEqual({ type: 'close', nonce: context.nonce })
  })
  it('rechecks the current server lifecycle before forwarding an initial manifest', async () => {
    const read = vi.fn(async () => new Response(JSON.stringify({ok:false,code:'context_expired'}), {status:410}))
    const {port,next} = fixture({read})
    const result = next()
    port.postMessage({type:'read',nonce:context.nonce,requestId:'r1',read:{kind:'manifest'}})
    const message = await result
    expect(message).toMatchObject({type:'data',requestId:'r1',status:410})
    expect(read).toHaveBeenCalledWith('/api/v1/replays/room-1/manifest',expect.objectContaining({credentials:'include',cache:'no-store'}))
    if (!message || typeof message !== 'object' || !('bytes' in message) || !isArrayBuffer(message.bytes)) throw new Error('missing bytes')
    expect(JSON.parse(new TextDecoder().decode(message.bytes))).toEqual({ok:false,code:'context_expired'})
  })

  it.each([
    { type: 'read', nonce: 'old', requestId: 'r1', read: { kind: 'manifest' } },
    { type: 'read', nonce: context.nonce, requestId: 'r1', read: { kind: 'manifest', url: 'https://attacker.example' } },
    { type: 'read', nonce: context.nonce, requestId: 'r1', read: { kind: 'segment', checkpointStepNo: -1 } },
    { type: 'read', nonce: context.nonce, requestId: 'r1', read: { kind: 'manifest' }, method: 'POST' },
  ])('retires malformed, old-session and arbitrary URL requests without delivering data', async request => {
    const { port, next } = fixture()
    const result = next()
    port.postMessage(request)
    expect(await result).toEqual({ type: 'close', nonce: context.nonce })
  })

  it('rejects a segment outside the bound manifest and duplicate request ids', async () => {
    const { port, next } = fixture()
    const denied = next()
    port.postMessage({ type: 'read', nonce: context.nonce, requestId: 'r1', read: { kind: 'segment', checkpointStepNo: 20 } })
    expect(await denied).toEqual({ type: 'error', nonce: context.nonce, requestId: 'r1', code: 'denied' })
    const duplicate = next()
    port.postMessage({ type: 'read', nonce: context.nonce, requestId: 'r1', read: { kind: 'manifest' } })
    expect(await duplicate).toEqual({ type: 'close', nonce: context.nonce })
  })

  it('aborts pending work on revocation and discards a late success', async () => {
    let entered = () => {}, release = () => {}, signal: AbortSignal | null | undefined
    const reached = new Promise<void>(resolve => { entered = resolve })
    const barrier = new Promise<void>(resolve => { release = resolve })
    const { port, next, revoke } = fixture({ read: async (_url, init) => {
      signal = init?.signal; entered(); await barrier
      return new Response(JSON.stringify({ok:true,kind:'replaySegment',roomId:'room-1',schemaVersion:1,viewerBuildId:context.viewerBuildId,checkpointStepNo:0,steps:[]}))
    } })
    const result = next()
    port.postMessage({ type:'read', nonce:context.nonce, requestId:'r1', read:{kind:'segment',checkpointStepNo:0} })
    await reached
    revoke()
    expect(await result).toEqual({type:'close',nonce:context.nonce})
    expect(signal?.aborted).toBe(true)
    release()
  })

  it('cancels the exact request without retiring the current channel', async () => {
    let entered = () => {}, release = () => {}, signal: AbortSignal | null | undefined
    const reached = new Promise<void>(resolve => { entered = resolve })
    const barrier = new Promise<void>(resolve => { release = resolve })
    const { port, next } = fixture({ read: async (_url, init) => { signal = init?.signal; entered(); await barrier; throw new Error('late') } })
    port.postMessage({type:'read',nonce:context.nonce,requestId:'r1',read:{kind:'segment',checkpointStepNo:0}})
    await reached
    port.postMessage({type:'cancel',nonce:context.nonce,requestId:'r1'})
    const result = next()
    port.postMessage({type:'lease',nonce:context.nonce,requestId:'r2'})
    expect(await result).toEqual({type:'lease',nonce:context.nonce,requestId:'r2',remainingMs:1000})
    expect(signal?.aborted).toBe(true)
    release()
  })

  it('accepts a handshake only from the current iframe Window and exact nonce/context', () => {
    const channels = vi.fn(function () { const channel = new MessageChannel(); close.push(()=>{channel.port1.close();channel.port2.close()}); return channel })
    vi.stubGlobal('MessageChannel',channels)
    const frame = document.createElement('iframe'), other = document.createElement('iframe')
    document.body.append(frame,other)
    const stop = attachReplayBridge(frame,context,manifest)
    close.push(stop)
    const ready = {type:'open-agricola-replay-bridge-ready',context}
    window.dispatchEvent(new MessageEvent('message',{source:other.contentWindow,origin:'null',data:ready}))
    window.dispatchEvent(new MessageEvent('message',{source:frame.contentWindow,origin:'null',data:{...ready,context:{...context,nonce:'d'.repeat(32)}}}))
    window.dispatchEvent(new MessageEvent('message',{source:frame.contentWindow,origin:'null',data:{...ready,context:{...context,roomId:'other'}}}))
    expect(channels).not.toHaveBeenCalled()
    window.dispatchEvent(new MessageEvent('message',{source:frame.contentWindow,origin:'null',data:ready}))
    expect(channels).toHaveBeenCalledTimes(1)
    window.dispatchEvent(new MessageEvent('message',{source:frame.contentWindow,origin:'null',data:ready}))
    expect(channels).toHaveBeenCalledTimes(1)
  })

  it.each([{roomId:'another-room'},{viewerBuildId:'f'.repeat(64)},{schemaVersion:2},{checkpointStepNo:4},{kind:'replayManifest'}])('rejects a response for a different bound context %j', async patch => {
    const {port,next}=fixture({read:async()=>new Response(JSON.stringify({ok:true,kind:'replaySegment',roomId:'room-1',viewerBuildId:context.viewerBuildId,schemaVersion:1,checkpointStepNo:0,steps:[],...patch}))})
    const result=next()
    port.postMessage({type:'read',nonce:context.nonce,requestId:'r1',read:{kind:'segment',checkpointStepNo:0}})
    expect(await result).toEqual({type:'error',nonce:context.nonce,requestId:'r1',code:'unavailable'})
  })

  it('bounds in-flight work and aborts all reads when a peer exceeds the limit', async () => {
    let entered=()=>{},release=()=>{}
    const reached=new Promise<void>(resolve=>{entered=resolve}),wait=new Promise<void>(resolve=>{release=resolve})
    const signals: Array<AbortSignal|null|undefined>=[]
    const {port,next}=fixture({read:async(_url,init)=>{signals.push(init?.signal);if(signals.length===4)entered();await wait;throw new Error('late')}})
    for(let id=1;id<=4;id++)port.postMessage({type:'read',nonce:context.nonce,requestId:`r${id}`,read:{kind:'segment',checkpointStepNo:0}})
    await reached
    const result=next()
    port.postMessage({type:'read',nonce:context.nonce,requestId:'r5',read:{kind:'segment',checkpointStepNo:0}})
    expect(await result).toEqual({type:'close',nonce:context.nonce})
    expect(signals).toHaveLength(4)
    expect(signals.every(signal=>signal?.aborted)).toBe(true)
    release()
  })

})
