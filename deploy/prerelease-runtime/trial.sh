#!/usr/bin/env bash
# Executed in a fresh --network none container, with the revision mounted read-only.
set -euo pipefail
cd /app
export HOME=/tmp TMPDIR=/tmp PATH=/usr/lib/postgresql/18/bin:"$PATH"
if ! getent passwd "$(id -u)" >/dev/null; then
  # Host target owners can have a uid without an entry in this image.
  cp /etc/{passwd,group} /tmp/
  printf 'pretrial:x:%d:%d:Trial:/tmp:/bin/sh\n' "$(id -u)" "$(id -g)" >>/tmp/passwd
  printf 'pretrial:x:%d:\n' "$(id -g)" >>/tmp/group
  export LD_PRELOAD
  LD_PRELOAD=$(find /usr/lib -name libnss_wrapper.so -print -quit)
  export NSS_WRAPPER_PASSWD=/tmp/passwd NSS_WRAPPER_GROUP=/tmp/group
fi
initdb -D /tmp/postgres -A trust --username=pretrial >/dev/null
pg_ctl -D /tmp/postgres -o '-h 127.0.0.1 -k /tmp -c max_locks_per_transaction=1024' -l /tmp/postgres.log -w start
export DATABASE_URL=postgresql://pretrial@127.0.0.1:5432/postgres
export RUSTFS_ACCESS_KEY=pretrial RUSTFS_SECRET_KEY=disposable-trial-secret RUSTFS_CONSOLE_ENABLE=false RUSTFS_OBS_LOG_DIRECTORY=/tmp/logs
export S3_ENDPOINT=http://127.0.0.1:9000 S3_REGION=us-east-1 S3_BUCKET=pretrial S3_PREFIX=live/ S3_FORCE_PATH_STYLE=true
export S3_ACCESS_KEY_ID="$RUSTFS_ACCESS_KEY" S3_SECRET_ACCESS_KEY="$RUSTFS_SECRET_KEY"
mkdir /tmp/objects
/usr/local/lib/oa/trial-rustfs /tmp/objects >/tmp/objects.log 2>&1 &
node --input-type=module - <<'JS'
import {S3Client, CreateBucketCommand} from '@aws-sdk/client-s3';
import {setTimeout} from 'node:timers/promises';
const client = new S3Client({endpoint:process.env.S3_ENDPOINT,region:'us-east-1',forcePathStyle:true,
  credentials:{accessKeyId:process.env.S3_ACCESS_KEY_ID, secretAccessKey:process.env.S3_SECRET_ACCESS_KEY},maxAttempts:1});
for(let attempt=0;;attempt++) {
  try {await client.send(new CreateBucketCommand({Bucket:process.env.S3_BUCKET}));break}
  catch(error) {if(attempt>=45)throw error;await setTimeout(1000)}
}
JS
export APP_INSTANCES=1 BACKEND_HOST=127.0.0.1 BACKEND_PORT=5175 PUBLIC_APP_ORIGIN=https://pretrial.invalid/open-agricola/ PUBLIC_API_BASE=https://pretrial.invalid
export CORS_ORIGIN="$PUBLIC_API_BASE" ALLOW_ANONYMOUS_WS=false ACCOUNT_REGISTRATION_POLICY=invite_only REPLAY_TRUST_PROXY=true
export FORMAL_APP_ORIGIN=https://formal-trial.invalid FORMAL_API_BASE=https://formal-api-trial.invalid
export PRERELEASE_IDENTITY_SERVICE_KEY=disposable-trial-secret-aaaaaaaaaaaaaaaa PRERELEASE_TARGET_ID=prerelease-trial
export PRERELEASE_DATA_GENERATION=00000000-0000-4000-a000-000000000001
node --import ./scripts/typescript-runtime.mjs scripts/container-entry.ts >/tmp/app.log 2>&1 &
app=$!
for ((i=0;i<120;i++)); do
  if ! kill -0 "$app" 2>/dev/null; then cat /tmp/app.log >&2; exit 1; fi
  if node --input-type=module -e 'import http from "node:http";let req=http.get({host:"127.0.0.1",port:5175,path:"/api/app-location",headers:{Host:"pretrial.invalid","X-Forwarded-Proto":"https"}},async r=>{let body="";for await(const p of r)body+=p;try{process.exit(r.statusCode===200&&JSON.parse(body).buildId===process.env.GAME_BUILD_ID?0:1)}catch{process.exit(1)}});req.setTimeout(1000,()=>req.destroy());req.on("error",()=>process.exit(1))'; then exit 0; fi
  sleep 1
done
cat /tmp/app.log >&2
exit 1
