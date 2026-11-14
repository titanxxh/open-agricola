import { randomUUID } from 'node:crypto'
import { GameSession } from '../../server/game/authoritative-session'
import { PostgresDatabase } from '../../server/database/postgres'
import { ReplayResources } from '../../server/storage/replay-resources'
import { ResourceStore } from '../../server/storage/resource-store'
import { objectHash, S3ObjectStore } from '../../server/storage/s3-store'
import { encodeReplayFrame, type JsonValue } from '../../server/game/replay-codec'
import type { CustomCardDef } from '../../shared/contract/protocol/game'

export async function seedPrivateReplay({ databaseUrl, schema, prefix, dependencies, userId }: {
  databaseUrl: string; schema: string; prefix: string; dependencies: NodeJS.ProcessEnv; userId: string
}) {
  const db = new PostgresDatabase({ connectionString: databaseUrl, schema, max: 1 })
  const resources = new ReplayResources(new ResourceStore(db, S3ObjectStore.fromEnv(dependencies, prefix)))
  try {
    const viewer = await db.prepare('SELECT build_id FROM replay_viewer_builds ORDER BY created_at DESC LIMIT 1').get<{build_id:string}>()
    if (!viewer) throw new Error('Private viewer fixture was not uploaded')
    const roomId = `replay-${randomUUID()}`
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==','base64')
    const assetHash = objectHash(png)
    await resources.storage.stage(`replay-assets/${assetHash}`,png,'image/png')
    await resources.storage.reference('replay',roomId,[`replay-assets/${assetHash}`])
    const card: CustomCardDef = { cardType:'minor', cardJson:{id:'CUSTOM_PRIVATE_REPLAY',name:'Private crop',deck:'X',number:1,desc:['Private replay image.']},artUrl:`/replay-assets/${assetHash}` }
    const session = new GameSession(42,undefined,{playerCount:2,playerNames:['Alice','Bob']})
    session.state.players[0]!.minorHand = [card.cardJson.id]
    const capture = (): JsonValue => JSON.parse(JSON.stringify(session.buildSyncPayload(session.getState(),[],'debug').state))
    const first = capture()
    session.state.players[0]!.resources.wood += 3
    const second = capture()
    const now = Date.now()
    await db.prepare("INSERT INTO game_contexts(room_id,lifecycle,replay_status,created_at,updated_at) VALUES (?,'completed','available',?,?)").run(roomId,now,now)
    await db.prepare("INSERT INTO game_replays(room_id,schema_version,viewer_build_id,game_build_id,status,latest_step_no,missing_prefix,custom_cards_json,created_at,completed_at) VALUES (?,1,?,?,'completed',1,0,?,?,?)")
      .run(roomId,viewer.build_id,'a'.repeat(40),JSON.stringify([card]),now,now)
    let checkpoint = 0, firstHash = ''
    for (const [stepNo, frame] of [first,second].entries()) {
      const encoded = encodeReplayFrame({frame,previousFrame:stepNo ? first : null,stepNo,previousCheckpointStepNo:checkpoint})
      checkpoint = encoded.checkpointStepNo
      if (!stepNo) firstHash = encoded.frameHash
      await db.prepare("INSERT INTO game_replay_steps(room_id,step_no,room_version,checkpoint_step_no,player_index,command_type,intent_json,payload_kind,payload_gzip,frame_hash,created_at) VALUES (?,?,?,?,NULL,'initial','{}',?,?,?,?)")
        .run(roomId,stepNo,stepNo,checkpoint,encoded.payloadKind,encoded.payloadGzip,encoded.frameHash,now+stepNo)
    }
    await db.prepare('INSERT INTO game_results(room_id,started_at,finished_at,rounds_played,player_count,enable_community_deck,enable_parent_cards,enable_through_the_seasons,enable_farmers_of_the_moor) VALUES (?,?,?,?,2,0,0,0,0)').run(roomId,now-1000,now,14)
    for (let index=0;index<2;index++) await db.prepare('INSERT INTO game_result_players(room_id,player_index,game_player_id,user_id,display_name,score) VALUES (?,?,?,?,?,0)').run(roomId,index,`p${index+1}`,index===0?userId:null,index===0?'Alice':'Bob')
    return {roomId,firstHash,assetHash,viewerBuildId:viewer.build_id}
  } finally { resources.storage.objects.close(); await db.close() }
}
