import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { test, expect } from '@playwright/test'

// Opt-in only: creates a real bot PR. Run with an isolated database and the Workshop App.
test.skip(process.env.WORKSHOP_LIVE_ACCEPTANCE !== '1', 'requires explicit live GitHub acceptance environment')
test('real bot submission survives a lost browser response', async ({page,request}) => {
  test.setTimeout(240_000)
  await mkdir('/tmp/workshop-live-acceptance',{recursive:true,mode:0o700})
  const backend = process.env.BACKEND_URL!
  const frontend = process.env.FRONTEND_URL!
  const suffix = Date.now().toString(36)
  const username = `workshopqa_${suffix}`
  const oauth = await request.post(`${backend}/api/test/oauth/github/callback`,{data:{providerUserId:username,providerLogin:username,email:`${username}@example.com`,displayName:'Workshop App acceptance'}})
  expect(oauth.ok(),await oauth.text()).toBe(true)
  const cookie = (response: typeof oauth,name:string) => {
    const header = response.headersArray().find(header => header.name.toLowerCase() === 'set-cookie' && header.value.startsWith(`${name}=`))!
    return header.value.split(';')[0]!.slice(name.length+1)
  }
  const onboarding = cookie(oauth,'oa_onboarding')
  const registered = await request.post(`${backend}/api/auth/onboarding/complete`,{headers:{Cookie:`oa_onboarding=${onboarding}`},data:{username,displayName:'Workshop App acceptance',password:'isolated-workshop-test-724',confirmPassword:'isolated-workshop-test-724'}})
  expect(registered.ok(),await registered.text()).toBe(true)
  const session = cookie(registered,'oa_session')
  await page.context().addCookies([{name:'oa_session',value:session,url:frontend}])
  const headers = {Cookie:`oa_session=${session}`}
  const cardId = `CUSTOM_WorkshopAcceptance_${suffix}`
  const meta = {id:cardId,name:'Workshop delivery acceptance',deck:'CUSTOM',number:0,desc:['Temporary acceptance fixture. No card effect.'],cost:{},vp:0}
  const create = await request.post(`${backend}/api/workshop/cards`,{headers,data:{card_id:cardId,card_type:'minor',name:meta.name,description:'Temporary Workshop App delivery verification for #1008. Do not merge.',card_json:{...meta,card_type:'minor',implemented:true,locales:{zh:{name:'工坊投稿验收',desc:['临时验收卡，无卡牌效果。']}}},effect_code:`const CARD_DEF = ${JSON.stringify({cardType:'minor',meta})}; const CARD_IMPL = {}`}})
  expect(create.ok(),await create.text()).toBe(true)
  const {id} = await create.json()
  const workspace = (await (await request.get(`${backend}/api/workshop/cards/${id}/workspace`,{headers})).json()).workspace
  const pinned = await request.post(`${backend}/api/workshop/cards/${id}/pin-version`,{headers,data:{baseRevision:workspace.revision}})
  expect(pinned.ok(),await pinned.text()).toBe(true)
  const {versionId} = await pinned.json()
  const pass = await request.post(`${backend}/api/workshop/cards/${id}/sandbox-pass`,{headers,data:{versionId,authorConfirmed:true,runtimeErrors:[]}})
  expect(pass.ok(),await pass.text()).toBe(true)
  // No GitHub identity or token is attached to this ordinary site's author session.
  await page.goto(`${frontend}/?page=workshop&card=${id}`)
  await page.getByRole('button',{name:'投稿记录与恢复'}).click()
  let lost = false
  await page.route(`**/api/workshop/cards/${id}/submit-review`,async route => {
    if (route.request().method() === 'POST' && !lost) {
      lost = true
      await route.fetch({timeout:180_000})
      await route.abort('failed')
    } else await route.continue()
  })
  await page.getByRole('checkbox').check()
  await page.getByRole('button',{name:'发起 PR',exact:true}).click()
  const link = page.getByRole('link',{name:'查看审核 PR'})
  await expect(link).toBeVisible({timeout:180_000})
  const prUrl = await link.getAttribute('href')
  expect(prUrl).toMatch(/^https:\/\/github.com\/titanxxh\/open-agricola\/pull\/\d+$/)
  const status = await (await request.get(`${backend}/api/workshop/cards/${id}/submit-review`,{headers})).json()
  await writeFile('/tmp/workshop-live-acceptance/receipt.json',JSON.stringify({cardId,id,versionId,session,prUrl,submissionId:status.submissionId,backend,frontend}),{mode:0o600})
  await expect.poll(async () => (await (await request.get(`${backend}/api/workshop/cards/${id}/submit-review`,{headers})).json()).ok,{timeout:120_000,intervals:[5000]}).toBe(true)
  await expect(page.getByText('已提交，等待维护者审核',{exact:false})).toBeVisible({timeout:30_000})
  await page.screenshot({path:test.info().outputPath('live-workshop-bot-pr.png')})
})

test('reopens an existing real submission after a server restart', async ({page}) => {
  test.skip(!process.env.WORKSHOP_LIVE_RECEIPT, 'requires an existing isolated acceptance receipt')
  const receipt = JSON.parse(await readFile(process.env.WORKSHOP_LIVE_RECEIPT!,'utf8'))
  await page.context().addCookies([{name:'oa_session',value:receipt.session,url:receipt.frontend}])
  await page.goto(`${receipt.frontend}/?page=workshop&card=${receipt.id}`)
  await page.getByRole('button',{name:'投稿记录与恢复'}).click()
  await expect(page.getByRole('link',{name:'查看审核 PR'})).toHaveAttribute('href',receipt.prUrl)
  await expect(page.getByText('已提交，等待维护者审核',{exact:false})).toBeVisible()
  await page.screenshot({path:test.info().outputPath('recovered-workshop-bot-pr.png')})
})
