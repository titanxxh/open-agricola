// @vitest-environment jsdom
import { MessageChannel } from 'node:worker_threads'
import { Buffer } from 'node:buffer'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ReplayBridgeTransport } from '../../../replay-viewer/src/bridge-transport'
import { parseReplayBridgeRequest, type ReplayBridgeContext } from '../../../shared/contract/protocol/replay-bridge'

const context: ReplayBridgeContext = { protocolVersion:1,nonce:'c'.repeat(32),environment:'prerelease',targetId:'pre',
  appBuildId:'a'.repeat(40),generationId:'11111111-1111-1111-1111-111111111111',roomId:'room-1',viewerBuildId:'b'.repeat(64),schemaVersion:1,mode:{kind:'archive'} }
const cleanups: (()=>void)[]=[]
afterEach(()=>{cleanups.splice(0).forEach(clean=>clean());vi.useRealTimers();vi.restoreAllMocks();vi.unstubAllGlobals()})
async function fixture() {
  vi.useFakeTimers({toFake:['performance','setTimeout','clearTimeout','setInterval','clearInterval']})
  // Native Node MessagePorts deliver ArrayBuffers in Node's realm, outside jsdom.
  vi.stubGlobal('ArrayBuffer',Buffer.alloc(0).buffer.constructor)
  const channel = new MessageChannel()
  const transport = new ReplayBridgeTransport(context,window.location.origin)
  cleanups.push(()=>{transport.close();channel.port1.close();channel.port2.close()})
  const first = new Promise<unknown>(resolve=>channel.port1.once('message',resolve))
  window.dispatchEvent(new MessageEvent('message',{source:window.parent,origin:window.location.origin,
    data:{type:'open-agricola-replay-bridge-connect',context},ports:[channel.port2]}))
  const request = parseReplayBridgeRequest(await first)
  if(request?.type !== 'lease') throw new Error('Viewer did not request a lease')
  const reply = async (remainingMs:number)=>{
    const received = new Promise<void>(resolve=>channel.port2.addEventListener('message',()=>resolve(),{once:true}))
    channel.port1.postMessage({type:'lease',nonce:context.nonce,requestId:request.requestId,remainingMs})
    await received
  }
  return {transport,reply,port:channel.port1}
}

describe('Viewer shared authorization lease',()=>{
  it('waits until the iframe load completes before announcing its channel',()=>{
    vi.useFakeTimers()
    const state=vi.spyOn(document,'readyState','get').mockReturnValue('loading')
    const announce=vi.spyOn(window.parent,'postMessage')
    const transport=new ReplayBridgeTransport(context,window.location.origin)
    cleanups.push(()=>transport.close())
    expect(announce).not.toHaveBeenCalled()
    state.mockReturnValue('complete')
    vi.advanceTimersByTime(250)
    expect(announce).toHaveBeenCalledTimes(1)
  })
  it('subtracts the entire message round trip and cannot create a new lease on receipt',async()=>{
    const {transport,reply}=await fixture()
    vi.advanceTimersByTime(200)
    await reply(500)
    expect(transport.check()).toBe(true)
    vi.advanceTimersByTime(299)
    expect(transport.check()).toBe(true)
    vi.advanceTimersByTime(2)
    expect(transport.check()).toBe(false)
  })
  it('clears an idle display when the parent stops replying despite a longer identity lease',async()=>{
    const {transport,reply}=await fixture()
    await reply(30_000)
    const closed=vi.fn()
    transport.subscribe(closed)
    vi.advanceTimersByTime(3_001)
    expect(transport.check()).toBe(false)
    expect(closed).toHaveBeenCalledTimes(1)
  })
  it.each(['pageshow','visibilitychange'])('reads the manifest after an initial visible %s',async event=>{
    vi.spyOn(document,'visibilityState','get').mockReturnValue('visible')
    const {transport,reply,port}=await fixture()
    await reply(30_000)
    const manifest={ok:true,kind:'replayManifest',apiVersion:1,roomId:'room-1',viewerBuildId:'b'.repeat(64),
      schemaVersion:1,gameBuildId:'a'.repeat(40),firstStepNo:0,lastStepNo:0,participants:[],customCards:[],
      segments:[{checkpointStepNo:0,firstStepNo:0,lastStepNo:0}],steps:[],corruptRanges:[],missingPrefix:false}
    const reads: unknown[]=[]
    port.on('message',data=>{
      const request=parseReplayBridgeRequest(data)
      if(request?.type!=='read') return
      reads.push(request.read)
      const bytes=new TextEncoder().encode(JSON.stringify(manifest)).buffer
      port.postMessage({type:'data',nonce:context.nonce,requestId:request.requestId,bytes,contentType:'application/json',status:200},[bytes])
    })
    if(event==='pageshow') window.dispatchEvent(new PageTransitionEvent(event,{persisted:false}))
    else document.dispatchEvent(new Event(event))
    const response=await transport.read({kind:'manifest'},new AbortController().signal)
    expect(await response.json()).toEqual(manifest)
    expect(reads).toEqual([{kind:'manifest'}])
    expect(transport.check()).toBe(true)
  })
  it.each(['pageshow','visibilitychange'])('retires cached display on a real %s resume and rejects late payloads',async event=>{
    const visibility=vi.spyOn(document,'visibilityState','get').mockReturnValue('visible')
    const {transport,reply,port}=await fixture()
    await reply(30_000)
    const closed=vi.fn()
    transport.subscribe(closed)
    const next=new Promise<unknown>(resolve=>port.once('message',resolve))
    const pending=transport.read({kind:'manifest'},new AbortController().signal)
    const rejected=expect(pending).rejects.toThrow('replay_bridge_expired')
    const request=parseReplayBridgeRequest(await next)
    if(request?.type!=='read') throw new Error('Viewer did not request a manifest')
    if(event==='pageshow') window.dispatchEvent(new PageTransitionEvent(event,{persisted:true}))
    else {
      visibility.mockReturnValue('hidden')
      document.dispatchEvent(new Event(event))
      visibility.mockReturnValue('visible')
      document.dispatchEvent(new Event(event))
    }
    const bytes=new TextEncoder().encode('{"ok":true}').buffer
    port.postMessage({type:'data',nonce:context.nonce,requestId:request.requestId,bytes,contentType:'application/json',status:200},[bytes])
    port.postMessage({type:'lease',nonce:context.nonce,requestId:'r1',remainingMs:30_000})
    await rejected
    expect(transport.check()).toBe(false)
    expect(closed).toHaveBeenCalledTimes(1)
    await expect(transport.read({kind:'manifest'},new AbortController().signal)).rejects.toThrow()
  })
  it('retires an initially hidden display when it first becomes visible',async()=>{
    const visibility=vi.spyOn(document,'visibilityState','get').mockReturnValue('hidden')
    const {transport,reply}=await fixture()
    await reply(30_000)
    visibility.mockReturnValue('visible')
    document.dispatchEvent(new Event('visibilitychange'))
    expect(transport.check()).toBe(false)
    await expect(transport.read({kind:'manifest'},new AbortController().signal)).rejects.toThrow()
  })
})
