# How to Deploy Open Agricola

[English](HOW_TO_DEPLOY.md) | [中文](HOW_TO_DEPLOY_zh.md)

This guide is for developers who want to self-host the Open Agricola platform.

## Architecture Overview

```text
┌──────────────────────────────┐      ┌───────────────────────────────┐
│ GitHub Pages: main site      │      │ VPS                           │
│ index.html + JS/CSS          │─────▶│ Node.js backend               │
└──────────────┬───────────────┘      │   ├── HTTP API  /api/*        │
               │                      │   ├── WebSocket /ws            │
               ▼                      │   ├── Card art  /card-art/*    │
┌──────────────────────────────┐      │   └── SQLite    ./data/*.db   │
│ GitHub Pages: asset site     │      └───────────────────────────────┘
│ open-agricola-assets         │
└──────────────────────────────┘
```

The frontend and backend are fully separated. The frontend is a static GitHub Pages site; the backend runs in a Docker container on a VPS.

### Hosting Cost and Mainland-China Access (checked 2026-10-01)

For the current implementation, compare Linux VMs with **2 vCPU / 2 GiB RAM, persistent disk, public IPv4, and a continuously running process**. The backend needs long-lived WebSockets, SQLite, persistent Replay files, and native Node.js dependencies. One Docker Compose instance avoids a database migration or a room-state architecture change. The capacity probe below is a measured baseline, not a guarantee for every provider's advertised CPU or WAN bandwidth.

These are public official prices, not quotes from the owner's billing account. Annualized monthly prices mean twelve monthly payments. Domain registration/renewal, offsite backups, taxes where applicable, and traffic overages are separate. Stock, identity eligibility, and checkout prices must be checked before purchase.

| Candidate | Resources | Current server cost | Renewal and limits |
|---|---|---|---|
| Reuse an existing mainland VPS | Verify available CPU, RAM, disk, and existing services | **0 incremental rental** | Existing rental remains payable; filing and service classification still apply |
| [Tencent mainland flash sale](https://cloud.tencent.com/act/pro/featured-202607) | 4 CPU / 4 GB, 40 GB SSD, peak 3 Mbps, 300 GB outbound/month | **CNY 38 first year** | Personal verified new-user eligibility, limited sale stock; no CNY 38 renewal promise. Published list reference is CNY 780/year, with actual renewal determined at checkout |
| [Alibaba mainland ECS 99](https://www.aliyun.com/activity/ecs/99program) | 2 CPU / 2 GB, 40 GB ESSD Entry, fixed 3 Mbps, unlimited traffic | **CNY 99/year** | New and existing eligible users; same-price renewal during the activity through **2029-03-31**, once per paid year. Existing discount entitlements and configuration changes affect eligibility; not a permanent price promise |
| [Huawei Flexus L](https://www.huaweicloud.com/product/flexus-l.html) | 2 CPU / 2 GB, 40 GB, 2 Mbps, 100 GB/month | CNY 329.32/year displayed | Renewal checkout must be verified; older CNY 38 advertising was not confirmed current |
| [Tencent domestic-site Hong Kong Lighthouse](https://cloud.tencent.com.cn/announce/detail/2131) | 2 CPU / 2 GB, 40 GB SSD, peak 20 Mbps, 0.5 TB/month | **CNY 38/month**, CNY 456 annualized | Official list price applies to new purchases and renewals. [Short-cycle activity discounts](https://cloud.tencent.com/act/pro/lhsp2025) may reduce this; do not assume future discounts |
| [GreenCloud budget sale](https://greencloudvps.com/billing/store/budget-kvm-sale) | US 2 CPU / 4 GB / 35 GB, or Tokyo Softbank 4 CPU / 8 GB / 60 GB; IPv4 included | **USD 25/year US; USD 45/year Tokyo** | Public store showed stock at research time; renewal amount was not confirmed. These sale plans explicitly have no refund/money-back. Advertised carrier and port speed are not mainland route validation |
| [CloudCone US VPS](https://cloudcone.com/vps/) | 4 CPU / 2 GB, 60 GB SSD, IPv4, 7 TB/month | USD 46/year | [Creation page](https://app.cloudcone.com/vps/517/create?token=ssd-vps-2) allowed Los Angeles configuration and calculated the same current base renewal price; no lifetime lock was established. Mainland access untested |
| [RackNerd specials](https://www.racknerd.com/specials/) | Advertised 2 CPU / 2 GB, 35 GB SSD, IPv4, 5 TB/month | USD 35.99/year advertised | Official FAQ promises the same recurring price, but the purchase link did not resolve to the advertised VPS in this check; treat as an advertising candidate, not confirmed orderable stock |
| [Tencent international Tokyo / Singapore Lighthouse](https://www.tencentcloud.com/document/product/1103/47794) | 2 CPU / 2 GB, 40 GB, peak 20 Mbps, 512 GB/month | USD 4.20/month, USD 50.40 annualized | [USD 10.08/year first-purchase advertising](https://www.tencentcloud.com/act/pro/lighthouse) was not verified for a particular regional SKU or this owner. [International identity rules](https://www.tencentcloud.com/document/product/378/10495) apply |
| [AWS Lightsail IPv4 Linux](https://aws.amazon.com/lightsail/pricing/) | 2 CPU / 2 GB, 60 GB | USD 12/month, USD 144 annualized | Trial eligibility is separate; regional traffic allowances and excess outbound charges apply |
| [Akamai/Linode Asia-Pacific](https://www.akamai.com/cloud/pricing/asia-pacific) | 1 CPU / 2 GB, or 2 CPU / 4 GB | USD 12/month, or USD 24/month | The 2 GB plan has less CPU than the project's measured baseline; reusing an existing host may avoid new rental |
| [Oracle Always Free A1](https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm) | Current free allowance equivalent to 2 OCPU / 12 GB ARM; 200 GB combined boot/block storage | USD 0 within allowances | Home-region capacity may be unavailable and idle instances may be reclaimed. Requires an ARM image and application validation; not a dependable immediate production cutover |

Other options do not improve this project's cost sufficiently to justify a migration: [Alibaba international](https://www.alibabacloud.com/en/product/swas/pricing) lists 2 CPU / 2 GB at USD 15/month and has [separate international-account eligibility](https://www.alibabacloud.com/help/en/account/step-1-register-an-alibaba-cloud-account). [Hetzner's June 2026 prices](https://docs.hetzner.com/general/infrastructure-and-availability/price-adjustment/) put Singapore 2 CPU / 4 GB at USD 30.99/month before IPv4 and tax. [LightNode Hong Kong](https://go.lightnode.com/hong-kong-vps) shows conflicting headline and package prices, so its headline is not a confirmed purchase quote.

Free PaaS is not equivalent to this VPS deployment. [Render Free](https://render.com/docs/free) sleeps after 15 minutes without incoming HTTP/WS traffic and loses local files on restart, deployment, or sleep; it cannot attach a persistent disk. [Railway](https://railway.com/pricing) has a USD 5 Hobby minimum spend, with metered RAM, CPU, storage, and traffic rather than a fixed 2 GB VM. [Fly.io](https://docs.fly.io/about/pricing/) charges for Machines, volumes, and regional outbound traffic. [Cloudflare Workers' filesystem](https://developers.cloudflare.com/workers/runtime-apis/nodejs/fs/) is temporary and memory-backed; hosting this backend there would require a persistence/runtime redesign. A free [Cloudflare Tunnel](https://developers.cloudflare.com/tunnel/) is not a mainland reliability guarantee: the separate [China Network](https://developers.cloudflare.com/china-network/) requires Enterprise plus a China subscription and an ICP number.

#### Reuse a Blog Domain for an Overseas Backend

An owned blog domain can also provide a separate backend hostname, such as `agricola-api.example.com`. Add an `A` record for that label pointing to the overseas VPS IPv4, configure the VPS to serve that hostname with a valid TLS certificate, and use its HTTPS API and WSS endpoint in the frontend. No additional registered domain is needed; the existing domain's renewal still applies. [Cloudflare subdomain setup](https://developers.cloudflare.com/dns/manage-dns-records/how-to/create-subdomain/). A Hong Kong/overseas origin does not require mainland ICP filing under the provider's [region-based rules](https://help.aliyun.com/zh/icp-filing/basic-icp-service/user-guide/icp-filing-server-access-information-check); the domain's registrar location alone does not determine this.

Start a direct-route evaluation with that record set to **DNS only**: clients connect to the VPS, and the VPS must provide TLS. A proxied Cloudflare record instead sends clients through Cloudflare, so its route must be evaluated separately. [Proxy behavior](https://developers.cloudflare.com/dns/proxy-status/). DNS records do not set the application port; retain `:8443` in a test URL if the existing service still uses it. For a new deployment, plan HTTPS/WSS ingress on 443. Changing the public hostname also requires backend public-URL configuration, frontend API/WS configuration, and applicable OAuth/GitHub App callback updates.

The cheapest first evaluation is a new hostname on the existing overseas backend, with **zero additional VPS or domain purchase cost**. The new hostname passed the Mobile-network probe checks recorded below; the owner subsequently confirmed the health endpoint is reachable on their unproxied China Mobile phone, while account login remains unverified. On 2026-10-01 the owner's blog deployment configuration named `titanxxh.com` and `139.162.99.38`; SSH as its configured `xxh` user found active Nginx, 1 CPU, about 961 MiB total RAM, 610 MiB available, and 15 GB free disk. This is below the game's measured baseline, so sharing it would require a lower-load acceptance test. The owned `ali-kr` host had 2 CPUs, about 1.6 GiB RAM, 27 GB free disk, and an existing service on 443; it is another reuse candidate, with ingress and mainland routes still to validate. These resource snapshots do not prove either host can sustain the game workload.

For a new host, the Tokyo USD 45/year sale merits route testing before a nonrefundable annual purchase; the Hong Kong CNY 38/month plan allows a shorter initial evaluation. The cheaper US offers remain candidates only when their final hostname and application pass mainland-network tests. No advertised overseas region, carrier name, or low price alone proves mainland reachability.

On 2026-10-01, the owner completed a DNS-only A record for `openagapi.titanxxh.com` to `74.208.219.191`. The failed `socat-relay` was stopped and disabled; Caddy now publishes host ports 443 and 8443 and serves both the old DuckDNS name and the new hostname. The application container was not restarted. Let's Encrypt issued a valid certificate for the new hostname, and both old-hostname health checks still passed from the owned mainland VPS. The 443 mapping is also present in the repository Compose file; deploy a ref containing that change before relying on a future `deploy-backend.sh` run to preserve it.

At 22:05 UTC+8, [new-hostname port 443](https://api.globalping.io/v1/measurements/2xpMwUX5AluN7qO8r00021Ekv) and [new-hostname port 8443](https://api.globalping.io/v1/measurements/2r63IBvYEEyo8tKEj00021Ekv) returned HTTP 200 with valid TLS at **eight mainland probes: two Mobile (Beijing, Guangzhou), three Telecom (Xi'an, Dongguan, Guangzhou), and three Unicom (Shanghai twice, Shenzhen)**, plus one Singapore control. New-hostname port 443 completed in 0.63–0.97 seconds on Mobile and 0.62–1.85 seconds across all mainland probes. In the concurrent [old-hostname port 443 control](https://api.globalping.io/v1/measurements/2FGZ9cDZH93ouNaCk00021Ekv), both Mobile probes failed with `ECONNRESET`; Telecom, Unicom, and Singapore succeeded. With the same IP and port, this supports a hostname/SNI-related failure, without identifying who causes the reset.

From the owned mainland VPS, an empty login POST returned the expected HTTP 400 `missing_fields`; a WebSocket upgrade returned HTTP 101, followed by the expected authentication timeout because no session was supplied. These are ingress/protocol checks, not successful account login or an authenticated game. No frontend release or OAuth callback switch was performed. The owner subsequently confirmed `{"ok":true}` at the new health endpoint on their unproxied China Mobile cellular connection. Repository frontend variables still point to the old DuckDNS API/WSS address; the latest successful Pages deployment and backend both use v0.6.1 (`d109b5ff288c7aff68c2abdb8c8cdade9fd74bcf`). Publishing a frontend with the new address remains a separate pending step; successful account login has not been verified.

#### Mainland Route Measurements (2026-10-01, 20:26–20:33 UTC+8)

Earlier price comparisons did not establish mainland reachability for the proposed new instances. This follow-up used Globalping remote probes, not the owner's phone. A normalized [measurement snapshot](performance/hosting-route-measurements-2026-10-01.json) preserves probe metadata, statistics, TLS status, and source IDs. The first batch returned **nine mainland probes: three China Mobile, three China Telecom, and three China Unicom**, plus one Singapore control per target. Actual mainland cities were Beijing, Taishan, Guilin, Guangzhou, Xi'an, Shenzhen, and Shanghai; Guangzhou and Shanghai each included multiple probes. Requested Ningbo/Zhenjiang probes were unavailable for supplementary IPv4 measurements and are not counted. Each ping probe sent ten packets; HTTPS checks used the fixed target IP with the test hostname supplied as Host/SNI.

| Target and primary measurement | China Mobile | China Telecom | China Unicom | Scope |
|---|---|---|---|---|
| [Owned Korean VPS ping](https://api.globalping.io/v1/measurements/2MyAvkqw48T1VAjHw00021EjK) | Probe mean RTT 70–119 ms; 0–20% ICMP nonresponse | 64–72 ms; 0–10% nonresponse | 41–74 ms; no nonresponse | Existing IP, not a deployed game |
| [GreenCloud Tokyo Softbank ping](https://api.globalping.io/v1/measurements/2eLGvowagPSPEw3X100021EjK) | 59–94 ms; 0–10% nonresponse | 76–121 ms; 10–40% nonresponse | 91–120 ms; no nonresponse | Official regional/line-label test IP `103.201.131.7` |
| [GreenCloud Chicago DC2 ping](https://api.globalping.io/v1/measurements/2090DVhzOEJBDjZw000021EjK) | 253–269 ms | 233–272 ms | 276–363 ms | Official DC2 test IP `173.249.214.11`; higher latency than the tested Asian IPs |
| [CloudCone LA LG HTTPS, first round](https://api.globalping.io/v1/measurements/2aDRYTTEtNFOSRCsb00021EjL) | 3/3 HTTP 200, but total times 0.55, 7.05, and 10.71 seconds | 3/3 HTTP 200 | 3/3 HTTP 200 | Looking Glass only; not established as the USD 46/year DC4 route |
| [RackNerd LA DC03 LG HTTPS](https://api.globalping.io/v1/measurements/2zPTi7l8YbkSEN61500021EjL) | 0/3 HTTP success; TCP/TLS timeouts around 15 seconds | 3/3 HTTP 200 | 3/3 HTTP 200 | Looking Glass only, fixed IP `107.174.51.158` |
| [Current backend health](https://api.globalping.io/v1/measurements/2xrR6xGIcjrDbOLsx00021EjL) | 0/3; `ECONNRESET` | 3/3 HTTP 200 | 3/3 HTTP 200 | Actual `/api/health` with DuckDNS SNI on 8443; password/WS flows not exercised |

The [CloudCone repeat](https://api.globalping.io/v1/measurements/2O5jKtft1Y2xJT2dV00021EjP) selected Kunming, Taishan, and Beijing Mobile: only Taishan succeeded; Kunming and Beijing timed out during TLS at about 15 seconds. Singapore succeeded in both rounds. This is sufficient to remove that LA candidate from the priority list for this owner's Mobile access, but does not establish every CloudCone region or subscriber IP has the same problem.

A separate [Korean-host HTTPS control](https://api.globalping.io/v1/measurements/2qGMvLVGPhfU3t9SZ00021EjP), using its fixed IP:443 and `example.com` as the control hostname, returned HTTP 404 at Beijing, Guilin, and Guangzhou Mobile, as well as Singapore. The returned certificate was for `google.com`, not the control hostname (`ERR_TLS_CERT_ALTNAME_INVALID`); this was not a browser-valid HTTPS endpoint. It proves completion of TCP/TLS/HTTP to the existing ingress/fallback in those paths; **404 is not game health or login success**, and that port still belongs to the existing Reality service. The [blog-IP ping](https://api.globalping.io/v1/measurements/2CSg28gHpgEKydJvw00021EjL) was 56–84 ms on Mobile, 171–241 ms on Telecom, and 283–490 ms on Unicom, so the inspected blog host is not uniformly low-latency across operators either.

Official test-address sources: [GreenCloud datacenter table](https://greencloudvps.com/data-centers.php), [CloudCone LA Looking Glass](https://lg-la.us.cloudc.one/), and [RackNerd LA DC03 Looking Glass](https://lg-lax03.racknerd.com/). Test-node results cannot guarantee a subsequently allocated IP or its load. Ten ICMP packets cannot establish sustained loss, and ICMP nonresponse is not automatically TCP/application loss. The probe operator is known, but these are not necessarily cellular 4G/5G access paths. There was no final custom-domain password login, WSS gameplay, bandwidth load, or repeated evening-peak acceptance test.

No official public test address was found for the specific Tencent Hong Kong Lighthouse ordinary/accelerated configurations, so **Tencent Hong Kong was not measured**. Its CNY 38/month base plan does not include a demonstrated mainland-optimized route. The optional [Quality Traffic Package](https://cloud.tencent.com/document/product/1207/104332) must be purchased and enabled, applies to IPv4 outbound toward mainland China, and is separately priced. [Current prices](https://cloud.tencent.com/document/product/1207/104334) include CNY 19.5 for 10 GB and CNY 94.9 for 50 GB, each valid for six months, not an automatically resetting monthly allowance. For illustration, buying 10 GB every month adds CNY 19.5/month to the base rental; actual game traffic and accelerated-route performance remain unmeasured.

The resulting priority is to validate a custom-domain game deployment on the already owned Korean host before buying another VM. Tokyo Softbank remains a lower-latency network candidate requiring HTTPS/WSS and load validation; its Telecom ICMP result is a reason for further checking. CloudCone LA and RackNerd LA are not priority choices for the observed Mobile requirement. Tencent Hong Kong remains an untested candidate, rather than an accepted solution.

#### Mainland Filing: Check the Project Classification First

This is an online multiplayer tabletop game, so do not assume ordinary personal-site filing is sufficient. Tencent's official [game-site FAQ](https://cloud.tencent.cn/document/product/243/19628) requires a game publication approval number for game-classified sites; its [website information rules](https://cloud.tencent.com/document/product/243/19644) restrict personal filing for content requiring prior approval. This does **not** establish the final classification of this particular open-source project. Obtain the actual hosting provider's assessment of the complete service before purchasing or scheduling a mainland cutover. Describe accounts, multiplayer rooms, user-created cards, and publication features accurately; free access and open-source code are not evidence of an exemption.

If the provider accepts the proposed service and filing subject:

1. Use a domain whose approved suffix/registrar and verified registrant meet the filing requirements. For personal filing, the registrant must match the subject. A borrowed DuckDNS subdomain does not establish ownership of a qualifying registered domain. [Alibaba domain requirements](https://help.aliyun.com/zh/icp-filing/basic-icp-service/user-guide/prepare-and-check-the-domain-name).
2. Check the existing server in the provider's filing console before buying another one. Alibaba's current server checklist requires a mainland subscription ECS with cumulative purchased duration **greater than three months** and public bandwidth; an annual qualifying plan clears that duration boundary. SSH can confirm region/resources but cannot confirm paid duration or available filing codes. [Server eligibility](https://help.aliyun.com/zh/icp-filing/basic-icp-service/user-guide/icp-filing-server-access-information-check).
3. Budget server and domain costs separately. [Alibaba's basic filing service is free](https://help.aliyun.com/zh/icp-filing/product-overview/product-billing); paid concierge services are optional. Domain first-year promotions do not establish renewal cost. [Domain pricing](https://help.aliyun.com/zh/dws/product-overview/domain-name-fees).
4. Submit identity, contact, domain, and accurate service information, complete the provider's checks and SMS verification, then await the provincial authority. Alibaba documents **1–2 working days for initial review and generally 1–20 working days for authority review**; corrections and holidays add time. [Progress and timing](https://help.aliyun.com/zh/icp-filing/the-progress-of-inquires-1).
5. After approval, follow the provider's instructions for displaying the filing number and completing public-security filing. Tencent's guide specifies public-security filing within 30 days of service opening. [Filing guide](https://cloud.tencent.com/document/product/243/39038). An existing ICP number at another provider still requires [access filing when moving to Alibaba](https://help.aliyun.com/zh/icp-filing/basic-icp-service/user-guide/icp-filing-application-overview).

Filing requirements also apply to a mainland backend accessed through a nonstandard port such as 8443; an [IP-only website](https://cloud.tencent.cn/document/product/243/18910) is not an exemption. Keeping the static frontend abroad does not remove the mainland backend's access requirements. Hong Kong/overseas hosting does not require mainland ICP filing; it does not guarantee mainland reachability or determine other service obligations.

#### Choose and Verify Before Cutover

The lowest **incremental** server expense is reusing an owned machine. Among the verified new mainland offers, Tencent is cheapest for an eligible first-year flash purchase; Alibaba has the clearest low renewal price during its activity. For an owner using a domestic cloud account who needs a new Hong Kong host, Tencent's CNY 38/month plan is a practical candidate, subject to actual route tests. These are bounded recommendations among checked offers, not a claim to the cheapest host worldwide.

The owner's 2026-10-01 SSH checks found a Shanghai `ecs.e-c1m1.large` with 2 CPUs, about 1.6 GiB total guest RAM, 31 GB free disk, no swap, and an existing VLESS Reality listener on 443. This shows a reuse candidate, not its billing/filing eligibility or game capacity. Sharing that host requires a deliberate ingress plan and workload validation. Its existing backup copies must not become the only backups on the same host as the migrated application.

On the same date, the existing production app and Caddy consumed about 200 MiB and 25 MiB at idle, and the persistent application volume occupied 120 MB. Those values are snapshots, not peak memory, disk-growth, or concurrency limits. Keep the full persistent volume and encryption keys when migrating, and use a fresh consistent backup rather than an older offsite snapshot.

The current DuckDNS endpoint also has evidence of domain/SNI-related resets on some China Mobile routes: [the original endpoint](https://api.globalping.io/v1/measurements/2NuU1pD7mHK38bS2C00021EiP) and [fixed-IP with original SNI](https://api.globalping.io/v1/measurements/2xMedIwsAbB0GasgW00021EiQ) failed at four of five mainland mobile probes, while the same IP/port with [control SNI](https://api.globalping.io/v1/measurements/2h7HlfkN6Wr8Y5O4A00021EiQ) returned a server TLS alert. The control proves arrival at a TLS service, not successful login. A new domain might address this, but has not been tested; changing the VPS alone is not a demonstrated fix.

Verify the final hostname with valid TLS, password login, WSS authentication, room creation, gameplay, reconnect, and a backup/restore on China Mobile, China Telecom, and China Unicom before switching production. Cross-border [Lighthouse routes may suffer latency/loss](https://www.tencentcloud.com/document/product/1103/41264), including Hong Kong. Mainland hosting also requires checking outbound dependencies: the inspected Shanghai host reached GitHub/Resend endpoints but timed out on Google APIs and Docker Hub. Those checks did not validate real OAuth/email delivery; use an owner-built image if needed and test the complete feature flows.

---

## 1. Deploy the Backend

There are two deployment cases:

- **Case A:** a new VPS with only a public IP and no domain
- **Case B:** an existing domain and HTTPS through Nginx plus Let's Encrypt or Certbot

Both cases start with the common steps below.

### 1.1 Common Setup

#### Capacity Baseline

Use **2 vCPU and 2 GiB RAM** as the single-instance capacity baseline. The exact probe and Replay-write rerun are recorded in [`docs/performance/replay-room-capacity.md`](performance/replay-room-capacity.md). This specification supports at most **30 ordinary `waiting + playing` rooms**. Increase that limit only after a new run of the same probe.

#### Install Docker

```bash
# One-command Docker installation on Ubuntu, Debian, or CentOS
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
# Log in through SSH again for the docker group change to take effect
```

#### Clone the Repository

```bash
git clone https://github.com/YOUR_USER/open-agricola.git
cd open-agricola
git checkout main
```

#### Configure Environment Variables

```bash
cp .env.example .env
```

Edit `.env`. Later steps override some values; start with the common settings:

```env
BACKEND_PORT=5175
NODE_ENV=production
PERSIST_ROOMS=sqlite
ALLOW_ANONYMOUS_WS=false
REPLAY_NEW_ROOMS_ENABLED=false
REPLAY_VIEWER_BUILD_ID=
REPLAY_VIEWER_ROOT=./data/replay-viewers
REPLAY_ASSET_ROOT=./data/replay-assets
REPLAY_REMOVAL_LEDGER_PATH=./data/replay-removals.jsonl
REPLAY_TRUST_PROXY=false
GAME_BUILD_ID=
# Set CORS_ORIGIN and other environment-specific values later
```

Keep `REPLAY_TRUST_PROXY=false` when the backend port is exposed directly. Set it to `true` only when the backend is reachable exclusively through a trusted Caddy or Nginx proxy that overwrites `X-Forwarded-For`. The repository's `docker-compose.prod.yml` uses an isolated Caddy container as the only ingress and therefore pins `REPLAY_TRUST_PROXY=true`.

The first Replay rollout requires `PERSIST_ROOMS=sqlite`. Build and append a Viewer Build before enabling recording:

```bash
REPLAY_VIEWER_ROOT="$PWD/data/replay-viewers" \
pnpm run build:replay-viewer
# The final stdout line is REPLAY_VIEWER_BUILD_ID
```

The command writes Viewer code, styles, and the card manifest into a separate read-only Build. It reads board art, card art, and fonts from the pinned asset repository instead of storing them in the persistent volume. Publishing creates a per-file SHA-256 manifest, uses the manifest's own SHA-256 as the directory name, and revalidates the complete directory. It never overwrites an existing directory with the same ID.

`docker-compose.prod.yml` stores data in the `app-data:/app/data` named volume. Start once with `REPLAY_NEW_ROOMS_ENABLED=false`, append the Build, and only then enable recording. Put the previous command's final output in `.env` as `REPLAY_VIEWER_BUILD_ID`, and put the output of `git rev-parse HEAD` in `GAME_BUILD_ID`:

```bash
set -a
source .env
set +a
test -n "$REPLAY_VIEWER_BUILD_ID"
test -n "$GAME_BUILD_ID"
docker compose -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.prod.yml exec app \
  mkdir -p "/app/data/replay-viewers/$REPLAY_VIEWER_BUILD_ID"
docker compose -f docker-compose.prod.yml cp \
  "data/replay-viewers/$REPLAY_VIEWER_BUILD_ID/." \
  "app:/app/data/replay-viewers/$REPLAY_VIEWER_BUILD_ID"
# After the copy succeeds, set REPLAY_NEW_ROOMS_ENABLED=true in .env
docker compose -f docker-compose.prod.yml up -d --force-recreate app
```

New room creation is rejected if the manifest, content hash, or entry-point validation fails. The feature flag, Build ID, and custom-card runtime version are locked when the room is created. Custom-card art is copied into `REPLAY_ASSET_ROOT` under a content-addressed filename. Existing Replay rooms continue using their locked settings, and disabling the feature does not migrate games already in progress.

Bug Reports use a separate GitHub App installed only on `titanxxh/open-agricola-issues`:

1. Grant only `Issues: Read and write`, and install it only on the issues repository.
2. Set the callback URL to `<PUBLIC_API_BASE>/api/v1/issue-submission-connection/github/callback`.
3. Set the webhook URL to `<PUBLIC_API_BASE>/api/v1/github-app/webhook`, configure a dedicated webhook secret, and subscribe to GitHub App authorization and Issues events.
4. Add the App ID, Client ID and secret, private key escaped as single-line `\n`, webhook secret, installation ID, and issues-only repository ID to `.env`.
5. Generate a random 32-byte encryption key, configure `BUG_REPORT_TOKEN_ENCRYPTION_KEYS` as a JSON key ring, and point `BUG_REPORT_TOKEN_ACTIVE_KEY_ID` at one key.
6. Start with `BUG_REPORTS_ENABLED=false` and complete migrations. Set it to `true` only after validating both Hosted and personal-GitHub delivery paths. Disabling the flag hides only the new entry point; it does not discard existing drafts or delivery queues.

After the feature is enabled, a missing or invalid HTTP(S) frontend URL in `PUBLIC_APP_ORIGIN` makes the health check return `503` and pauses OAuth, new drafts, and delivery. This prevents issues without game links.

```env
BUG_REPORTS_ENABLED=false
BUG_REPORT_GITHUB_APP_ID=
BUG_REPORT_GITHUB_CLIENT_ID=
BUG_REPORT_GITHUB_CLIENT_SECRET=
BUG_REPORT_GITHUB_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\n...\n-----END RSA PRIVATE KEY-----"
BUG_REPORT_GITHUB_WEBHOOK_SECRET=
BUG_REPORT_GITHUB_INSTALLATION_ID=
BUG_REPORT_GITHUB_REPOSITORY_ID=
BUG_REPORT_TOKEN_ENCRYPTION_KEYS={"v1":"<32-byte-base64-key>"}
BUG_REPORT_TOKEN_ACTIVE_KEY_ID=v1
```

#### Build and Start

```bash
docker compose up -d --build
```

#### Verify

```bash
curl http://localhost:5175/api/health
# Expected: {"ok":true}
```

View logs:

```bash
docker compose logs -f app
```

---

### 1.2 Case A: New VPS with a Public IP and No Domain

#### Option A1: Plain HTTP for Testing Only

This is the simplest option. GitHub Pages uses HTTPS and cannot connect to an HTTP backend because browsers block mixed content. The frontend must also be served over HTTP from the VPS rather than GitHub Pages.

1. Edit `.env`:

   ```env
   CORS_ORIGIN=*
   ```

2. Build the frontend locally for the VPS public IP:

   ```bash
   VITE_API_BASE=http://YOUR_VPS_IP:5175 pnpm run build
   ```

3. Upload `dist/` to the VPS and serve it with a basic HTTP server:

   ```bash
   cd dist
   python3 -m http.server 8080 &
   ```

4. Open `http://YOUR_VPS_IP:8080`.
5. Use `ws://YOUR_VPS_IP:5175/ws` as the WebSocket address.

> This option sends passwords in clear text. Use it only for local testing or a private network.

#### Option A2: Caddy with Automatic HTTPS

With any domain, including a free subdomain, Caddy can obtain and renew a Let's Encrypt certificate automatically.

Optional free-domain providers:

- [DuckDNS](https://www.duckdns.org/)
- [No-IP](https://www.noip.com/)
- [FreeDNS](https://freedns.afraid.org/)

1. Point the domain's DNS A record to the VPS IP.
2. Create `deploy/Caddyfile`:

   ```caddy
   your-game.duckdns.org {
       reverse_proxy app:5175
   }
   ```

3. Create `docker-compose.prod.yml` without replacing the repository's original Compose file:

   ```yaml
   services:
     app:
       build: .
       expose:
         - "5175"
       environment:
         - NODE_ENV=production
         - BACKEND_PORT=5175
         - BACKEND_HOST=0.0.0.0
         - PERSIST_ROOMS=sqlite
         - ALLOW_ANONYMOUS_WS=false
         - DB_PATH=./data/open-agricola.db
         - CARD_ART_DIR=./data/card-art
         - REPLAY_NEW_ROOMS_ENABLED=${REPLAY_NEW_ROOMS_ENABLED:-false}
         - REPLAY_VIEWER_BUILD_ID=${REPLAY_VIEWER_BUILD_ID:-}
         - REPLAY_VIEWER_ROOT=${REPLAY_VIEWER_ROOT:-./data/replay-viewers}
         - REPLAY_ASSET_ROOT=${REPLAY_ASSET_ROOT:-./data/replay-assets}
         - REPLAY_TRUST_PROXY=true
         - GAME_BUILD_ID=${GAME_BUILD_ID:-}
         - CORS_ORIGIN=https://YOUR_USER.github.io
       volumes:
         - app-data:/app/data
         - app-output:/app/output
       restart: unless-stopped

     caddy:
       image: caddy:alpine
       ports:
         - "80:80"
         - "443:443"
       volumes:
         - ./deploy/Caddyfile:/etc/caddy/Caddyfile:ro
         - caddy-data:/data
       depends_on:
         - app
       restart: unless-stopped

   volumes:
     app-data:
     app-output:
     caddy-data:
   ```

4. Start the stack:

   ```bash
   docker compose -f docker-compose.prod.yml up -d --build
   ```

5. Verify it:

   ```bash
   curl https://your-game.duckdns.org/api/health
   ```

6. Set frontend `VITE_API_BASE=https://your-game.duckdns.org`.

Caddy obtains and renews the certificate automatically.

---

### 1.3 Case B: Existing Domain and HTTPS with Nginx

Use this when the VPS already runs Nginx with a Certbot-managed certificate. Docker exposes only an HTTP port; Nginx provides the reverse proxy and TLS termination.

1. Edit `.env`:

   ```env
   CORS_ORIGIN=https://YOUR_USER.github.io
   ```

2. Bind the `docker-compose.yml` port mapping to `127.0.0.1`:

   ```yaml
   ports:
     - "127.0.0.1:5175:5175"
   ```

3. Start Docker:

   ```bash
   docker compose up -d --build
   ```

4. Add an Nginx server block or location for the backend API. Because these examples overwrite `X-Forwarded-For`, also set `REPLAY_TRUST_PROXY=true` in the backend `.env`.

   **Subdomain, recommended:** `api.your-domain.com`

   Obtain its certificate first:

   ```bash
   sudo certbot --nginx -d api.your-domain.com
   ```

   Add `/etc/nginx/sites-available/open-agricola-api`:

   ```nginx
   server {
       listen 443 ssl;
       server_name api.your-domain.com;

       ssl_certificate     /etc/letsencrypt/live/api.your-domain.com/fullchain.pem;
       ssl_certificate_key /etc/letsencrypt/live/api.your-domain.com/privkey.pem;

       location / {
           proxy_pass http://127.0.0.1:5175;
           proxy_http_version 1.1;

           # Required WebSocket forwarding
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection "upgrade";

           proxy_set_header Host $host;
           proxy_set_header X-Real-IP $remote_addr;
           proxy_set_header X-Forwarded-For $remote_addr;
           proxy_set_header X-Forwarded-Proto $scheme;

           proxy_read_timeout 86400s;
           proxy_send_timeout 86400s;
       }
   }

   server {
       listen 80;
       server_name api.your-domain.com;
       return 301 https://$host$request_uri;
   }
   ```

   **Subpath:** `your-domain.com/agricola-api/`

   Add this to an existing server block:

   ```nginx
   location /agricola-api/ {
       rewrite ^/agricola-api/(.*) /$1 break;
       proxy_pass http://127.0.0.1:5175;
       proxy_http_version 1.1;
       proxy_set_header Upgrade $http_upgrade;
       proxy_set_header Connection "upgrade";
       proxy_set_header Host $host;
       proxy_set_header X-Real-IP $remote_addr;
       proxy_set_header X-Forwarded-For $remote_addr;
       proxy_read_timeout 86400s;
       proxy_send_timeout 86400s;
   }
   ```

5. Enable and reload Nginx:

   ```bash
   # Required only for the subdomain option
   sudo ln -s /etc/nginx/sites-available/open-agricola-api /etc/nginx/sites-enabled/

   sudo nginx -t
   sudo systemctl reload nginx
   ```

6. Verify it:

   ```bash
   curl https://api.your-domain.com/api/health
   ```

7. Set frontend `VITE_API_BASE` to `https://api.your-domain.com`, or `https://your-domain.com/agricola-api` for the subpath option.

> Nginx must forward WebSocket traffic. Without the `Upgrade` and `Connection` headers, HTTP APIs work but multiplayer connections fail.

---

## 2. Deploy the Frontend to GitHub Pages

### Prerequisites

- In repository **Settings → Pages**, set Source to **GitHub Actions**.
- In **Settings → Environments → github-pages → Deployment branches and tags**, allow `main` and tags matching `v*`. Release deployments run from the tag ref and are rejected without the tag rule.

### Configuration

Under **Settings → Secrets and variables → Actions → Variables**, add:

| Variable | Value | Example |
|---|---|---|
| `VITE_API_BASE` | Complete backend URL | `https://api.your-domain.com`, or `http://VPS_IP:5175` for HTTP-only testing |
| `VITE_WS_BASE` | Optional WebSocket URL; derived automatically by default | `wss://api.your-domain.com/ws` |
| `VITE_SANDBOX_EXECUTOR` | Optional Workshop playtest executor | `browser` runs the engine Worker and local compilation entirely in the browser; unset or another value uses `/api/game/new-sandbox` on the server |

### Trigger a Deployment

Publishing a GitHub Release triggers `.github/workflows/deploy-pages.yml` through `release: published`:

```bash
gh release create v0.3.0 --generate-notes
```

Alternatively, use **Releases → Draft a new release**, create a `vX.Y.Z` tag, generate release notes, and publish. A release does not deploy the backend. A manual `workflow_dispatch` from the Actions page deploys the latest frontend from `main`.

After deployment, the site is available at `https://YOUR_USER.github.io/open-agricola/`.

### Manual Build without GitHub Actions

```bash
VITE_API_BASE=https://api.your-domain.com pnpm run build
pnpm dlx gh-pages -d dist
```

### Main-Site Image Assets

`public-assets.ref` pins a Git commit in the asset repository. `public-assets.required.json` declares every path required by the main site. Production builds and the default local startup read the asset site's `asset-version.txt` and `asset-manifest.json`. Both must match `public-assets.ref`, and the manifest must contain every required path; unavailable metadata, malformed responses, version mismatches, or missing files fail startup/build. These requests use only the public Pages endpoint, without GitHub API credentials. Test configuration reads only the local contract and does not use the network.

New builds load all public images and fonts from `https://titanxxh.github.io/open-agricola-assets/assets/...` with `?v=<public-assets.ref>` for cache invalidation. The main site, initial HTML background preload, generated CSS, and immutable Replay Viewer use the same Pages source for every visitor. Replay CSP permits images/fonts from that asset-site path. There is no runtime raw-source fallback or geographic switching. Public asset binaries are not bundled into the main Pages artifact. The asset repository deliberately publishes current files only; the query parameter is a cache key, not a historical file snapshot.

For local asset work, override the complete asset repository with a checkout:

```bash
PUBLIC_ASSET_LOCAL_DIR=../open-agricola-assets pnpm dev
```

Startup verifies every required file. A missing file fails startup; it never mixes local and remote assets or falls back to the remote source. This override is accepted only by the local development server, not CI or production builds.

To update public assets, first publish `open-agricola-assets` to its Pages site and wait for its workflow to verify every live file against that commit. Then update `public-assets.ref` to the deployed `asset-version.txt`, synchronize `public-assets.required.json`, and follow the main repository's normal release flow. Asset commits that change only documentation also change the deployment marker. The current checked Pages deployment is `8675d8a6dc3950b616c64043f0d7809f7abc3a3e`. Older Viewer Builds retain their code, but public art/fonts follow the current asset site; archive historical public artwork only if a future requirement explicitly calls for it.

Local validation on 2026-10-02 downloaded and byte-checked all 1,132 live files (117,711,722 bytes), restarted via `./restart-local.sh --players 2`, passed the background-preload and Replay E2E tests, and decoded a Pages card-frame image and loaded Carlito inside the Replay CSP. Fast tests passed 749 files / 8,032 tests; lint had zero errors (456 warnings), and the production frontend build passed. Main-site and new Viewer output contained no raw asset URLs. These checks do not publish the frontend or deploy the backend; production rollout must include the new frontend, Viewer Build, and Pages-compatible Replay CSP. [Verification record](performance/frontend-route-measurements-2026-10-02.json).

### Mainland Frontend Access (checked 2026-10-02)

The measurements below describe the frontend before this source correction: HTML/JS/CSS on `titanxxh.github.io`, and public assets on `raw.githubusercontent.com`. The live entry bundle `index-DafwQMKi.js` already contains `https://openagapi.titanxxh.com`; the old frontend-variable observation above describes 2026-10-01, not the current bundle.

Globalping HTTPS GET checks at **13:05–13:07 UTC+8** used probe-side DNS, mainland consumer-network selectors, and a Singapore control. Actual returned mainland probes varied by request: three Mobile (AS9808), one or two Telecom (AS4134), and three Unicom (two AS17621, one AS17623). The [normalized evidence](performance/frontend-route-measurements-2026-10-02.json) records exact URLs, probe metadata, errors, TLS results, and source IDs.

| Production target | Mobile | Telecom | Unicom |
|---|---|---|---|
| [Homepage](https://api.globalping.io/v1/measurements/22Fb5d1zJTdBjowix00021EzR) | 3/3 HTTP 200 | 1/1 HTTP 200 | 3/3 HTTP 200 |
| [Entry JS](https://api.globalping.io/v1/measurements/26kwR6RHOQYUTiRdh00021EzR) / [CSS](https://api.globalping.io/v1/measurements/2E8kkoS29ki6MKk5Y00021EzT) | 3/3 each | JS 1/1; CSS 2/2 | 3/3 each |
| [Pinned card image, first check](https://api.globalping.io/v1/measurements/2jdfypjZVWMx0YmV400021EzR) | 1/3; two `ECONNRESET` | 0/1; 15-second timeout | 3/3 HTTP 200 |
| [Same card image, repeat](https://api.globalping.io/v1/measurements/2zaL3NFDQwAuXWMCy00021EzT) / [current background](https://api.globalping.io/v1/measurements/2XrOpklJDAMDQ1zCq00021EzT) | 0/3 each; `ECONNRESET` | 0/2 each; 15-second timeouts | 3/3 each |
| [New backend health endpoint](https://api.globalping.io/v1/measurements/2AiIfinmNOwL7A0Bf00021EzR) | 3/3 HTTP 200 | 1/1 HTTP 200 | 3/3 HTTP 200 |

All Singapore controls returned HTTP 200. Successful responses had authorized TLS. Pages homepage response timings were 0.30–1.00 seconds across mainland probes; response bodies can be truncated by the measurement service, so these are **not** full-download or browser page-load timings. This sample confirms current asset-path failures on Mobile and Telecom while the tested Pages entry points remain reachable; it does not establish the cause of resets, universal blocking, long-term reliability, complete browser rendering, or authenticated multiplayer success.

The source correction uses the existing asset Pages site for all new main-site and Replay Viewer builds. The deployment gate verifies its current version and complete required-file manifest; no commit directories or archived public-asset copies are introduced. `PUBLIC_ASSET_LOCAL_DIR` remains development-only. If Pages later fails the same checks, evaluate an independently hosted mirror or frontend build.

A custom-domain CNAME alone still points to [GitHub Pages hosting](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/managing-a-custom-domain-for-your-github-pages-site). Cloudflare [DNS-only records](https://developers.cloudflare.com/dns/proxy-status/) leave traffic going directly to the origin; ordinary proxying is not its separate [China Network](https://developers.cloudflare.com/china-network/). Validate any proposed delivery path on all three carriers, then test password login, authenticated WSS, gameplay, and reconnect before treating mainland support as accepted.

#### Optional Future Mirror Selection

For an entire-site mirror, an owned entry hostname can use [intelligent DNS](https://www.alibabacloud.com/help/en/dns/pubz-intelligent-analysis) to resolve mainland requests to the mirror and other requests to the overseas deployment. Selection normally follows the recursive resolver's egress IP; EDNS Client Subnet can improve it. This is approximate geographic routing, not precise visitor identification. Both destinations must serve the entry hostname with valid TLS and compatible paths. DNS cannot rewrite a hostname, URL path, or asset base in HTML; the existing `github.io` and `raw.githubusercontent.com` names are not under the owner's DNS control.

All new builds currently use the asset Pages site for every visitor. If an independent mirror is needed later, an implementation option is a small endpoint on the owned backend that classifies the incoming IP and returns an approved asset base. The browser could retain the selection briefly, verify reachability with a small asset, fall back on failure, and offer a manual override. This optional routing has not been implemented. IP classification follows the observed network exit, including any proxy; geolocation alone does not prove that the selected host works. Runtime switching would need to cover CSS fonts, the initial HTML background preload, normal image helpers, and Replay Viewers; changing only `publicAssetUrl()` would be insufficient because CSS URLs are fixed during builds. Both paths must follow the chosen public-asset publishing contract.

An alternative HTTP entry can perform country-based redirects: Cloudflare documents [country rules](https://developers.cloudflare.com/rules/url-forwarding/examples/redirect-country-subdomains/) using `ip.src.country`. Such [redirect rules require proxied traffic](https://developers.cloudflare.com/rules/url-forwarding/single-redirects/create-dashboard/), and visitors must reach that entry before it can redirect them. Browser-only detection on the Pages site likewise requires that site to load first. For a whole-site redirect, preserve the application path, query parameters and URL fragment, and account for origin-scoped browser storage and backend CORS/public-link configuration. Keep both deployments on the same release and retain manual fallback links.

#### Mirror Hosting Options (checked 2026-10-02)

A mirror selected for mainland visitors need not be physically hosted in mainland China; its final hostname and delivery path must pass mainland-network tests. The pinned asset repository's [complete tree](https://api.github.com/repos/titanxxh/open-agricola-assets/git/trees/94c1b4f8864a946c79c66940fb3357b4101cb08c?recursive=1) contains all 1,132 required files, totaling 117,711,722 bytes (about 112 MiB). A local checkout was incomplete and is not the size or completeness baseline.

- **GitHub Pages asset mirror:** the existing `https://titanxxh.github.io/open-agricola-assets/assets/website-bg/16qiufen.webp` returned HTTP 200 at **13:31 UTC+8 on nine mainland probes: three Mobile, three Telecom, and three Unicom**, plus a Singapore control. [Measurement](https://api.globalping.io/v1/measurements/2mcHR830K7mpcIKU700021Ezr). A local full download matched the pinned raw file byte-for-byte by SHA-256. The corresponding `<commit>/assets/...` Pages URL returned 404. The source correction intentionally follows the asset repository's existing current-only contract, using its published version marker and manifest instead of adding commit directories. The earlier hosting investigation itself did not deploy or switch the application. [Pages limits](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits) are 1 GB per published site and a soft 100 GB/month bandwidth limit. Retained commit versions count toward site size. This changes the delivery hostname but shares the GitHub provider, so it is not independent disaster recovery.
- **Existing backend host:** serve a complete pinned copy as static files through Caddy or Nginx. There is no additional server rental, but disk, bandwidth, and impact on gameplay need validation. Current successful health checks establish only ingress reachability, not mirror throughput.
- **Tencent EdgeOne Makers/Pages:** the [current free edition](https://pages.edgeone.ai/document/limits-and-quotas) permits 5 GB total deployment storage, 20,000 files per project, 25 MB per file, and 500 builds/month, with custom domains and free TLS certificates. [Domain rules](https://pages.edgeone.ai/document/domain-overview) require mainland visitors using default project/deployment domains to use preview links that expire after three hours. A public mirror therefore needs an owned custom hostname. Mainland or global acceleration including mainland requires ICP filing; global acceleration excluding mainland does not, but provides no mainland nodes and still requires route testing. Do not assume the separate EdgeOne CDN Free plan's advertising applies to Makers quotas or that all future quotas are fixed.
- **Cloudflare Pages/R2:** [Pages](https://developers.cloudflare.com/pages/platform/limits/) offers a free tier with 20,000 files and 25 MiB per file. [R2 Standard](https://developers.cloudflare.com/r2/pricing/) includes 10 GB-month storage, one million Class A and ten million Class B operations/month, with no egress charge; excess storage/operations are billed. Neither free product is proof of mainland reliability or access to the separate China Network.

---

## 3. Update a Deployment

### Backend

Deploy the backend only from an owner-controlled machine. Keep the SSH private key on that machine and provide `ACCOUNT_REGISTRATION_POLICY` through the server's `.env`; neither belongs in GitHub Actions.

```bash
./deploy-backend.sh root@your-game.duckdns.org v0.3.0 /root/open-agricola
```

Before switching versions, `deploy-backend.sh` builds the new image while the old version remains online, stops the app, and archives the complete `app-data` volume as `backups/pre-<ref>-<timestamp>.tgz`. The archive includes SQLite, card art, Replay Viewer builds, Replay assets, and the removal ledger. It also refreshes `backups/replay-removals.latest.jsonl` and stores a mode-600 `.env` snapshot at `backups/env-pre-<ref>-<timestamp>`.

After creating the archive, the target image operates on a disposable writable copy. It runs target database migrations, replays the removal ledger, runs SQLite `integrity_check`, deserializes every active room, and validates Replay metadata, Head and Segment records, content-addressed assets, and Viewer builds. Custom Replay paths under `/app/data` are mapped to the extracted copy while the original archive remains unchanged.

On success, the script writes a matching `.manifest.json` containing the archive SHA-256 and size, source and target Builds, target ref, database schemas before and after migration, Replay schema, and validation counts. A backup or semantic-validation failure restores the previous app and fails the local deployment command. Losing the local SSH session after the app stops but before the new version starts also restores the old container.

The script retains the five newest pre-deploy backups and matching manifests, and removes archives older than 30 days under ADR-0010's backup-copy ceiling. Manual archives without the `pre-` prefix are unaffected. Backup archives, manifests, and ledger snapshots use mode 600; `backups/` uses mode 700. Downtime covers only archive creation, semantic validation, and new-container startup, not image building. See [Data Backup](#data-backup) for recovery.

SQLite and card art live in the Docker volume, so rebuilding the container does not delete them.

### Frontend

Publish a GitHub Release to redeploy the frontend as described in [Trigger a Deployment](#trigger-a-deployment).

---

## Authentication OAuth

Production can enable password registration with Resend email verification and GitHub or Google OAuth. `ACCOUNT_REGISTRATION_POLICY` controls every registration entry point.

Required backend settings:

- `PUBLIC_APP_ORIGIN`: the frontend address opened by users. Include the base path for a GitHub Pages subpath deployment, such as `https://your-user.github.io/open-agricola/`.
- `PUBLIC_API_BASE`: the browser-accessible backend origin, such as `https://api.your-domain.com`. It is used for OAuth provider callbacks and email verification links and is required in production.
- `CORS_ORIGIN`: when frontend and backend have different origins, set this to the frontend origin.
- `ACCOUNT_GITHUB_OAUTH_CLIENT_ID` / `ACCOUNT_GITHUB_OAUTH_CLIENT_SECRET`: credentials for the account login and registration GitHub OAuth App.
- `ACCOUNT_GOOGLE_OAUTH_CLIENT_ID` / `ACCOUNT_GOOGLE_OAUTH_CLIENT_SECRET`: credentials for the account login and registration Google OAuth Client.

Configure provider callback URLs on the backend origin:

```text
https://<backend-origin>/api/auth/oauth/github/callback
https://<backend-origin>/api/auth/oauth/google/callback
```

Never set these in production:

- `ALLOW_ANONYMOUS_WS=true`
- `ENABLE_AUTH_TEST_HELPERS=1`

---

## 4. Verification Checklist

- [ ] `curl https://your-backend/api/health` returns `{"ok":true}`.
- [ ] The frontend URL displays the login page.
- [ ] On the first deployment, use `ACCOUNT_REGISTRATION_POLICY=open` to register the first administrator named in `ADMIN_USERS`.
- [ ] The administrator can generate an invitation in Settings; then change `ACCOUNT_REGISTRATION_POLICY` to `invite_only` and restart the backend.
- [ ] A new user can register with GitHub or Google plus an invitation code.
- [ ] Login succeeds and opens the lobby.
- [ ] A room can be created and a game started.
- [ ] WebSocket connects without errors in the browser console.
- [ ] Two browser windows can join the same two-player room.
- [ ] Original participants can open the three-step Bug Report flow in active and completed games; nonparticipants are rejected.
- [ ] Personal GitHub and Hosted Identity can each create an issue whose body contains only the observation, Reporter ID, and game anchor.
- [ ] Settings can disconnect an Issue Submission Connection, and revoking GitHub authorization invalidates the connection.
- [ ] Workshop cards can be created and browsed.
- [ ] Card art uploads and displays correctly.
- [ ] Data remains after `docker compose down && docker compose up -d`.

---

## 5. Environment Variable Reference

### Backend: Docker and `.env`

| Variable | Default | Description |
|---|---|---|
| `BACKEND_PORT` | `5175` | HTTP and WebSocket listen port |
| `BACKEND_HOST` | `0.0.0.0` | Bind address |
| `NODE_ENV` | — | Set to `production` for production mode |
| `PERSIST_ROOMS` | `sqlite` | Room persistence: `sqlite` or `json` |
| `ALLOW_ANONYMOUS_WS` | `true` in development, `false` in production | Whether anonymous WebSocket connections are allowed |
| `CORS_ORIGIN` | `*` | Allowed frontend origin; required in production |
| `PUBLIC_APP_ORIGIN` | — | Public frontend URL; include `/open-agricola/` for a Pages subpath |
| `PUBLIC_API_BASE` | — | Public backend origin for OAuth callbacks and email verification; required in production |
| `EMAIL_DELIVERY` | `log` | Email mode; password registration in production requires `resend` |
| `RESEND_API_KEY` | — | Resend API key, available only to the backend container |
| `EMAIL_FROM` | — | Sender address, such as `Open Agricola <no-reply@mail.example.com>` |
| `EMAIL_REPLY_TO` | — | Optional reply-to address |
| `ACCOUNT_GITHUB_OAUTH_CLIENT_ID` | — | Account GitHub OAuth App client ID |
| `ACCOUNT_GITHUB_OAUTH_CLIENT_SECRET` | — | Account GitHub OAuth App client secret |
| `ACCOUNT_GOOGLE_OAUTH_CLIENT_ID` | — | Account Google OAuth client ID |
| `ACCOUNT_GOOGLE_OAUTH_CLIENT_SECRET` | — | Account Google OAuth client secret |
| `BUG_REPORTS_ENABLED` | `false` | Whether new Bug Report drafts can be created |
| `BUG_REPORT_GITHUB_APP_ID` | — | Issues-only GitHub App ID |
| `BUG_REPORT_GITHUB_CLIENT_ID` | — | GitHub App Client ID |
| `BUG_REPORT_GITHUB_CLIENT_SECRET` | — | GitHub App Client secret |
| `BUG_REPORT_GITHUB_PRIVATE_KEY` | — | GitHub App private key escaped with single-line `\n` |
| `BUG_REPORT_GITHUB_WEBHOOK_SECRET` | — | GitHub App webhook secret |
| `BUG_REPORT_GITHUB_INSTALLATION_ID` | — | App installation ID for the issues-only repository |
| `BUG_REPORT_GITHUB_REPOSITORY_ID` | — | Numeric repository ID of `titanxxh/open-agricola-issues` |
| `BUG_REPORT_TOKEN_ENCRYPTION_KEYS` | — | AES-256-GCM key-ring JSON; every value is 32-byte base64 |
| `BUG_REPORT_TOKEN_ACTIVE_KEY_ID` | — | Key-ring ID used for new tokens |
| `ENABLE_AUTH_TEST_HELPERS` | — | May be `1` only locally or in E2E; forbidden in production |
| `DB_PATH` | `./data/open-agricola.db` | SQLite file path |
| `CARD_ART_DIR` | `./data/card-art` | Uploaded card-art directory |
| `REPLAY_VIEWER_ROOT` | `./data/replay-viewers` | Immutable Replay Viewer Build directory |
| `REPLAY_VIEWER_BUILD_ID` | — | Immutable Viewer Build ID locked by new rooms |
| `REPLAY_ASSET_ROOT` | `./data/replay-assets` | Content-addressed custom-card assets for Replay |
| `REPLAY_REMOVAL_LEDGER_PATH` | `./data/replay-removals.jsonl` | Append-only Replay removal ledger outside SQLite; restore with the latest copy |
| `REPLAY_NEW_ROOMS_ENABLED` | `false` | Whether new rooms record Replay; requires a Viewer Build first |
| `REPLAY_TRUST_PROXY` | `false` | Set only when the backend is reachable exclusively through a trusted proxy that overwrites `X-Forwarded-For` |
| `GAME_BUILD_ID` | — | Current backend Git commit; deployment scripts set it automatically |
| `ADMIN_USERS` | — | Comma-separated administrator usernames |
| `ACCOUNT_REGISTRATION_POLICY` | required | Use `open` for the first administrator, then `invite_only`; `disabled` blocks new accounts |
| `GITHUB_OAUTH_CLIENT_ID` / `GITHUB_OAUTH_CLIENT_SECRET` | — | GitHub OAuth App credentials for Workshop pull requests |
| `GITHUB_UPSTREAM_OWNER` / `GITHUB_UPSTREAM_REPO` | `titanxxh` / `open-agricola` | Workshop pull-request target |
| `WORKSHOP_PR_ENABLED` | `false` | Whether Workshop pull requests are enabled |
| `WORKSHOP_REVIEW_GITHUB_APP_ID` | — | Workshop Review GitHub App ID |
| `WORKSHOP_REVIEW_GITHUB_PRIVATE_KEY` | — | App private key escaped with single-line `\n` |
| `WORKSHOP_REVIEW_GITHUB_INSTALLATION_ID` | — | App installation ID for the main repository |
| `WORKSHOP_REVIEW_GITHUB_WEBHOOK_SECRET` | — | HMAC secret for `/api/github/webhook` |
| `OFFSITE_BACKUP_TARGET` | — | SSH destination for scheduled offsite backups, such as `root@1.2.3.4`; read only by `backup-offsite.sh` |
| `OFFSITE_BACKUP_REMOTE_DIR` | `/root/open-agricola-backups` | Remote backup directory; read only by `backup-offsite.sh` |

### Resend Email Verification

1. Add and verify a sending domain in Resend.
2. Create a Sending access API key.
3. Add these values to the backend `.env`:

   ```env
   EMAIL_DELIVERY=resend
   RESEND_API_KEY=re_xxx
   EMAIL_FROM="Open Agricola <no-reply@mail.example.com>"
   ```

4. Confirm that `PUBLIC_API_BASE` is the public backend HTTPS URL and `PUBLIC_APP_ORIGIN` is the frontend URL.

### Frontend: Build-Time Variables

| Variable | Default | Description |
|---|---|---|
| `VITE_API_BASE` | `''`, meaning same-origin | Backend API URL |
| `VITE_WS_BASE` | Derived from the API base | WebSocket URL |
| `PUBLIC_ASSET_LOCAL_DIR` | — | Local development only: a complete asset-repository checkout; remote mixing and fallback are disabled |

---

## 6. Troubleshooting

### WebSocket Connection Fails

- Confirm that backend HTTPS works. GitHub Pages uses HTTPS, so WebSocket must use `wss://`.
- Confirm that the reverse proxy forwards WebSocket upgrade headers; Nginx needs `proxy_set_header Upgrade`.
- Check `VITE_WS_BASE`.
- Set a sufficiently long Nginx `proxy_read_timeout`, such as `86400s`.

### CORS Error

- Ensure `.env` `CORS_ORIGIN` exactly matches the frontend origin, including `https://` and excluding a trailing slash.
- When using a custom domain, ensure it matches the domain users actually open.

### Mixed Content Is Blocked

- Browsers block an HTTPS page from loading HTTP resources.
- Configure backend HTTPS through Option A2 or Case B.
- For temporary testing only, serve both frontend and backend over HTTP as in Option A1.

### Card Images Do Not Display

- This affects display only, not gameplay.
- Confirm that `public-assets.ref` points at a published asset-repository commit and that `public-assets.required.json` lists every needed path.

### Data Backup

A backup must contain SQLite, Viewer builds, Replay assets, card art, and the deletion ledger. Before every version switch, `deploy-backend.sh` creates an equivalent `backups/pre-<ref>-<timestamp>.tgz` and pairs it with `pre-<ref>-<timestamp>.manifest.json`, proving that the target image migrated and restored a disposable copy successfully. The manifest's `targetBuildId` proves only build compatibility; `archiveSha256` and `archiveSizeBytes` bind the actual archive. Before restoring with another build, rerun `scripts/validate-backup.ts` against that build.

The following manual procedure is for backups outside deployment. It assumes the default ledger path `/app/data/replay-removals.jsonl`. Stop the backend first so the archive does not cross a Room Commit:

```bash
mkdir -p backups
OA_BACKUP_NAME="open-agricola-$(date -u +%Y%m%dT%H%M%SZ).tgz"
docker compose -f docker-compose.prod.yml stop app
docker compose -f docker-compose.prod.yml run --rm --no-deps \
  -v "$PWD/backups:/backup" app sh -c \
  "tar -C /app/data -czf /backup/$OA_BACKUP_NAME . && \
   if [ -f /app/data/replay-removals.jsonl ]; then \
     cp /app/data/replay-removals.jsonl /backup/replay-removals.latest.jsonl; \
   else \
     : > /backup/replay-removals.latest.jsonl; \
   fi"
docker compose -f docker-compose.prod.yml up -d app
```

A manual archive is a verified restore point only after read-only validation with the target image. Keep the matching manifest:

```bash
OA_BACKUP_STEM="${OA_BACKUP_NAME%.tgz}"
OA_VALIDATE_DIR="$(mktemp -d)"
OA_BUILD_ID="$(git rev-parse HEAD)"
OA_BACKUP_SHA256="$(sha256sum "backups/$OA_BACKUP_NAME" | cut -d ' ' -f 1)"
OA_BACKUP_SIZE_BYTES="$(stat -c '%s' "backups/$OA_BACKUP_NAME")"
tar -C "$OA_VALIDATE_DIR" -xzf "backups/$OA_BACKUP_NAME"
docker compose -f docker-compose.prod.yml run --rm --no-deps \
  -v "$OA_VALIDATE_DIR:/validation-data" \
  -e DB_PATH=/validation-data/open-agricola.db \
  -e BACKUP_STEM="$OA_BACKUP_STEM" \
  -e BACKUP_CREATED_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  -e SOURCE_BUILD_ID="$OA_BUILD_ID" \
  -e TARGET_BUILD_ID="$OA_BUILD_ID" \
  -e TARGET_REF=manual \
  -e BACKUP_SHA256="$OA_BACKUP_SHA256" \
  -e BACKUP_SIZE_BYTES="$OA_BACKUP_SIZE_BYTES" \
  app node --import tsx scripts/validate-backup.ts \
  > "backups/$OA_BACKUP_STEM.manifest.json"
rm -rf -- "$OA_VALIDATE_DIR"
chmod 600 "backups/$OA_BACKUP_STEM.manifest.json"
```

`replay-removals.latest.jsonl` is the newest append-only deletion fact. Store it separately from ordinary backups. Immediately after every Replay removal, run `./backup-offsite.sh ledger-only` to update its offsite copy without stopping the app. Never roll it back with an older data archive.

#### Scheduled Backups and Offsite Copies

Production cron runs `backup-offsite.sh` daily at 20:00 UTC, or 04:00 Beijing time. It protects data between releases and copies backups off the production host:

1. Stop the app, archive `app-data` as `backups/daily-<timestamp>.tgz`, refresh `backups/replay-removals.latest.jsonl`, and restart the app. Downtime covers only archive creation. Backups and deployments share `backups/.maintenance.lock`: cron skips a backup during deployment, and deployment waits for a backup already in progress.
2. After service returns, use the current image to run the same restore validation as a pre-deploy backup against a disposable copy. Write the matching `.manifest.json` and an `.env` snapshot when `.env` exists. On validation failure, delete this run's artifacts and exit nonzero without affecting production; retention cleanup and offsite synchronization still run.
3. Retain the seven newest local `daily-*` archives. Every local archive, including `pre-*` and manual backups, has a 30-day maximum age under ADR-0010, calculated by minute to avoid day rounding. `deploy-backend.sh` still owns the count limit for `pre-*`; manual archives remain operator-managed.
4. Use rsync to copy `backups/`, including pre-deploy, daily, manual, manifest, and environment snapshots, to `OFFSITE_BACKUP_REMOTE_DIR` on `OFFSITE_BACKUP_TARGET`. Do not upload local archives older than 30 days. Do not use `--delete`; remote retention is independent, so an accidental local deletion does not propagate.
5. Synchronize `replay-removals.latest.jsonl` separately. Replace the remote ledger only when the local copy is a prefix-compatible superset of it. A divergent prefix fails the script and preserves the remote copy, preventing a rolled-back ledger from overwriting offsite deletion facts.
6. Remotely retain the newest 30 `daily-*` archives and 10 `pre-*` archives, while enforcing the 30-day maximum on every archive, including manual ones. Never automatically delete `replay-removals.latest.jsonl`. Install the autonomous `deploy/offsite-retention.sh` cron on the offsite host so the 30-day ceiling still applies if production is lost or unreachable.

Initial production-host setup:

```bash
# 1. Host dependencies: production needs rsync, cron, and logrotate; offsite needs rsync
apt-get update && apt-get install -y rsync cron logrotate
systemctl is-active cron
ssh root@<OFFSITE_IP> 'command -v rsync || (apt-get update && apt-get install -y rsync)'

# 2. SSH trust from production to offsite; skip ssh-keygen when the key exists
test -f ~/.ssh/id_ed25519 || ssh-keygen -t ed25519 -N '' -f ~/.ssh/id_ed25519
ssh-copy-id root@<OFFSITE_IP>

# 3. Configure the destination in .env
echo 'OFFSITE_BACKUP_TARGET=root@<OFFSITE_IP>' >> /root/open-agricola/.env

# 4. Verify the complete path manually
/root/open-agricola/backup-offsite.sh

# 5. Install cron and log rotation
cd /root/open-agricola
cp deploy/open-agricola-backup.cron /etc/cron.d/open-agricola-backup
chmod 644 /etc/cron.d/open-agricola-backup
cp deploy/open-agricola-backup.logrotate /etc/logrotate.d/open-agricola-backup

# 6. Install autonomous 30-day retention on the offsite host
scp deploy/offsite-retention.sh root@<OFFSITE_IP>:/root/offsite-retention.sh
ssh root@<OFFSITE_IP> 'chmod +x /root/offsite-retention.sh'
scp deploy/open-agricola-offsite-retention.cron root@<OFFSITE_IP>:/etc/cron.d/open-agricola-offsite-retention
ssh root@<OFFSITE_IP> 'chmod 644 /etc/cron.d/open-agricola-offsite-retention && systemctl is-active cron'
```

The scripts update with normal Git deployment. Reinstall the cron file after changing its definition. To restore from the offsite host, first pull the archive, matching manifest, `env-<stem>` snapshot, and latest ledger into production `backups/`:

```bash
rsync "root@<OFFSITE_IP>:/root/open-agricola-backups/{<stem>.tgz,<stem>.manifest.json,env-<stem>,replay-removals.latest.jsonl}" backups/
cp "backups/env-<stem>" .env && chmod 600 .env
```

Before restoring, prepare the archive, matching manifest, and latest ledger. Confirm that the manifest `targetBuildId` equals the build to be started; otherwise rerun the validator with the target image against a copy of the archive. Replace data while the backend is stopped. The command explicitly replays the ledger, and service startup replays it idempotently again:

```bash
OA_RESTORE_ARCHIVE=open-agricola-YYYYMMDDTHHMMSSZ.tgz
OA_RESTORE_STEM="${OA_RESTORE_ARCHIVE%.tgz}"
OA_TARGET_BUILD_ID="$(git rev-parse HEAD)"
test -f "backups/$OA_RESTORE_ARCHIVE"
test -f "backups/$OA_RESTORE_STEM.manifest.json"
test -f backups/replay-removals.latest.jsonl
test "$(sha256sum "backups/$OA_RESTORE_ARCHIVE" | cut -d ' ' -f 1)" = \
  "$(jq -r .archiveSha256 "backups/$OA_RESTORE_STEM.manifest.json")"
test "$(stat -c '%s' "backups/$OA_RESTORE_ARCHIVE")" -eq \
  "$(jq -r .archiveSizeBytes "backups/$OA_RESTORE_STEM.manifest.json")"
test "$OA_TARGET_BUILD_ID" = \
  "$(jq -r .targetBuildId "backups/$OA_RESTORE_STEM.manifest.json")"
docker compose -f docker-compose.prod.yml stop app
docker compose -f docker-compose.prod.yml run --rm --no-deps \
  -e OA_RESTORE_ARCHIVE="$OA_RESTORE_ARCHIVE" \
  -v "$PWD/backups:/backup:ro" app sh -c \
  'tar -tzf "/backup/$OA_RESTORE_ARCHIVE" >/dev/null &&
   find /app/data -mindepth 1 -maxdepth 1 -exec rm -rf -- {} \; &&
   tar -C /app/data -xzf "/backup/$OA_RESTORE_ARCHIVE" &&
   cp /backup/replay-removals.latest.jsonl /app/data/replay-removals.jsonl &&
   node --import tsx scripts/replay-removal.ts apply-ledger'
docker compose -f docker-compose.prod.yml up -d app
```

After restoration, sample every Room ID in the ledger. Game Context may return only a `removed` Tombstone; manifests and segments must be unreadable, and asset hashes with no remaining Replay reference must return 404.

### Remove a Replay

The CLI accepts only an exact Room ID and one of three reasons: `removed`, `moderation`, or `legal`. Stop the backend and run a dry run first. Execute only after confirming the Room and asset hashes in its output:

```bash
OA_ROOM_ID=replace-with-exact-room-id
docker compose -f docker-compose.prod.yml stop app
docker compose -f docker-compose.prod.yml run --rm --no-deps app \
  node --import tsx scripts/replay-removal.ts remove \
  --room-id "$OA_ROOM_ID" --reason moderation --dry-run
docker compose -f docker-compose.prod.yml run --rm --no-deps app \
  node --import tsx scripts/replay-removal.ts remove \
  --room-id "$OA_ROOM_ID" --reason moderation
mkdir -p backups
docker compose -f docker-compose.prod.yml cp \
  app:/app/data/replay-removals.jsonl backups/replay-removals.latest.jsonl
docker compose -f docker-compose.prod.yml up -d app
```

When a legal request explicitly requires erasing the Game Result Archive, use reason `legal` with `--erase-result`. This mode cannot be combined with `--asset-hash`:

```bash
OA_ROOM_ID=replace-with-exact-room-id
docker compose -f docker-compose.prod.yml stop app
docker compose -f docker-compose.prod.yml run --rm --no-deps app \
  node --import tsx scripts/replay-removal.ts remove \
  --room-id "$OA_ROOM_ID" --reason legal --erase-result --dry-run
docker compose -f docker-compose.prod.yml run --rm --no-deps app \
  node --import tsx scripts/replay-removal.ts remove \
  --room-id "$OA_ROOM_ID" --reason legal --erase-result
mkdir -p backups
docker compose -f docker-compose.prod.yml cp \
  app:/app/data/replay-removals.jsonl backups/replay-removals.latest.jsonl
docker compose -f docker-compose.prod.yml up -d app
```

If the violating content is custom-card art, also pass its exact 64-character content hash. The dry run lists every Room referencing that asset that will also become a Tombstone:

```bash
OA_ASSET_HASH=replace-with-64-character-sha256
docker compose -f docker-compose.prod.yml stop app
docker compose -f docker-compose.prod.yml run --rm --no-deps app \
  node --import tsx scripts/replay-removal.ts remove \
  --room-id "$OA_ROOM_ID" --reason legal \
  --asset-hash "$OA_ASSET_HASH" --dry-run
docker compose -f docker-compose.prod.yml run --rm --no-deps app \
  node --import tsx scripts/replay-removal.ts remove \
  --room-id "$OA_ROOM_ID" --reason legal \
  --asset-hash "$OA_ASSET_HASH"
mkdir -p backups
docker compose -f docker-compose.prod.yml cp \
  app:/app/data/replay-removals.jsonl backups/replay-removals.latest.jsonl
docker compose -f docker-compose.prod.yml up -d app
```

An asset removal may use an existing Tombstone Room whose ledger proves the reference. The violating hash becomes a permanent ledger rule: restoring an old backup automatically removes new references, and later rooms cannot archive the same content. The operation is idempotent. Ordinary whole-Replay removal deletes only assets no longer referenced by another Replay. On success, immediately run `./backup-offsite.sh ledger-only` to back up the latest `replay-removals.jsonl` offsite.

### Rotate Bug Report Token Keys

1. Generate a new random 32-byte key, add it to `BUG_REPORT_TOKEN_ENCRYPTION_KEYS`, and retain the old key.
2. Set `BUG_REPORT_TOKEN_ACTIVE_KEY_ID` to the new key ID and restart the backend. New connections and later token refreshes use the new key.
3. Keep the old key while any connection still requires it. Wait until rows using the old key disappear from `issue_submission_connections.key_id`, and until old `oauth_states.pkce_verifier_key_id` rows disappear or expire.
4. After confirming both Hosted and personal-GitHub submissions, remove the old key from the key ring and restart again. Never change the key material associated with an existing key ID during rotation.

### Local Development without Docker

```bash
pnpm install
./restart-local.sh
```

When `VITE_API_BASE` is unset, it defaults to the empty string for same-origin use. In development, the frontend automatically connects to `localhost:5175`.
