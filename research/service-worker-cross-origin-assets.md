# Chromium 与 WebKit 的跨域公开素材缓存

## 结论

两种浏览器都能用 Service Worker 返回经 CORS 读取、经 SHA-256 校验后写入 Cache Storage 的响应。普通图片、CSS 字体和 HTML 动态插入的季节背景预加载都通过了双源浏览器实验。在普通 HTTP 缓存立即过期、浏览器进程已重启的条件下，每种浏览器从 Cache Storage 命中三个素材，资产端收到零请求。该证据覆盖协议和浏览器行为，生产 Pages 构建仍需单独验收。 [浏览器实验](#浏览器实验)

## 规范与当前加载路径

- Fetch 允许 Service Worker 用 `cors` 类型的响应回答 `no-cors` 请求。它拒绝把 `cors` 响应给 `same-origin` 请求，也拒绝把 `opaque` 响应给非 `no-cors` 请求。Worker 可以用 `mode: 'cors'`、`credentials: 'omit'` 重新读取公开素材并校验字节。源站的 `Access-Control-Allow-Origin: *` 可用于这种无凭据请求。 [Fetch 响应类型检查](https://fetch.spec.whatwg.org/#http-fetch) [Fetch CORS 检查](https://fetch.spec.whatwg.org/#cors-check) [Service Worker 跨域缓存](https://www.w3.org/TR/service-workers/#cross-origin-resources)
- 主站的 `index.html` 在应用启动前用同一个 URL 写入 CSS 变量和 `<link rel="preload" as="image">`，后者未声明 `crossorigin`。Vite 使用同一个公开素材基址替换 HTML 和 CSS，并供前端 URL 构造读取。季节背景请求可能早于应用与 Worker 之间的任何版本消息。 [季节背景预加载](https://github.com/titanxxh/open-agricola/blob/de0901f9689a21caa33dd76d673c0ff615262fcf/index.html#L51-L57) [构建中的素材地址](https://github.com/titanxxh/open-agricola/blob/de0901f9689a21caa33dd76d673c0ff615262fcf/scripts/public-assets.ts#L249-L269) [字体声明](https://github.com/titanxxh/open-agricola/blob/de0901f9689a21caa33dd76d673c0ff615262fcf/client/styles/base.css#L17-L25)
- 2026-11-18 对资产 Pages 发带主站 `Origin` 头的 GET，`meeples.png`、`Dominican.woff2` 和 `19lidong.webp` 都返回 `200`、`Access-Control-Allow-Origin: *`、`Cache-Control: max-age=600` 和 ETag。此处核对的是线上 HTTP 响应头。 [普通图片](https://titanxxh.github.io/open-agricola-assets/assets/revised/meeples.png) [字体](https://titanxxh.github.io/open-agricola-assets/assets/revised/fonts/Dominican.woff2) [季节背景](https://titanxxh.github.io/open-agricola-assets/assets/website-bg/19lidong.webp)

## 浏览器实验

2026-11-18 用 Node.js 24.19.0、Playwright 1.65.0、Chromium 158.0.8127.18 和 Linux WebKit 27.2 执行。两个临时 HTTP 服务分别监听 `127.0.0.1` 和 `localhost`，各自使用独立回环端口。两源符合浏览器本地安全上下文条件。源站以 `public-assets.ref` 固定的资产仓提交 `bafe84726e8af3d86ffdc3bb2d527bd266428a8a` 提取上述三个资产字节。应用基线为 `de0901f9689a21caa33dd76d673c0ff615262fcf`。 [资产 pin](https://github.com/titanxxh/open-agricola/blob/de0901f9689a21caa33dd76d673c0ff615262fcf/public-assets.ref) [本地安全上下文规范](https://www.w3.org/TR/secure-contexts/#is-origin-trustworthy)

1. 源站给三个资产返回 `Cache-Control: public, max-age=0, must-revalidate`、`Access-Control-Allow-Origin: *` 和内容 ETag，并记录每次到达源站的路径及状态。
2. 启动页注册 Worker。受控测试页使用无 `crossorigin` 的 `<img>`、与项目相同的动态图片预加载、引用预加载 URL 的 CSS 背景和 CSS `@font-face`。等待图片 `decode()`、预加载 `load` 和字体 `document.fonts.load()` 完成。
3. Worker 对三条受测素材 URL 查 Cache Storage。未命中时用 `fetch(url, { mode: 'cors', credentials: 'omit' })`，用 `crypto.subtle.digest('SHA-256', bytes)` 校验预先从 Git 对象取出的哈希，匹配才写入，向页面返回原响应。Worker 单独记录每条请求的 `mode`、`destination`、写入或命中和响应 `type`。
4. 三条确认写入后关闭浏览器，用同一持久用户目录重启并访问另一条页面地址。重新核验页面由 Worker 控制、三个素材可用、三个 Cache Storage 命中、资产端收到零请求。对照组在独立用户目录禁用 Worker，同样访问一次、重启进程和复访。另用错误预期哈希的 URL 验证图片仍可解码，Cache Storage 无对应条目。

| 条件 | Chromium 158.0.8127.18 | Linux WebKit 27.2 |
| --- | --- | --- |
| 首次受控加载 | 3 次源站 `200`，3 次校验写入 | 3 次源站 `200`，3 次校验写入 |
| 重启后复访 | 3 次 Cache Storage 命中，0 次源站请求 | 3 次 Cache Storage 命中，0 次源站请求 |
| 禁用 Worker 后重启复访 | 3 次源站 `304` | 3 次源站 `200` |
| 哈希不符 | 图像解码成功，跳过写入 | 图像解码成功，跳过写入 |

三个资产从 Worker 返回的响应类型始终为 `cors`。两种浏览器向 Worker 报告普通图片和背景预加载的请求模式为 `no-cors`。CSS 字体的目的地均为 `font`，Chromium 向 Worker 报告 `cors`，受测 WebKit 向 Worker 报告 `no-cors`。在同一 WebKit 页面连续导航的早期试验中，复访时背景预加载没有产生 Worker 命中日志，源站也没有收到请求。用持久用户目录重启进程后可对三种素材逐一取得 Worker 命中证据。

## 对 Pages 验收的影响

- 按受控客户端、资产源和路径筛选 GET。不要用 `Request.mode` 筛选图片或字体，也不要为了给 Worker 校验而改普通图片和现有预加载的请求属性。Worker 能主动获取 CORS 响应。若将来调整预加载属性，预加载与实际使用的模式和凭据需要匹配。 [浏览器实验](#浏览器实验) [HTML preload 规范](https://html.spec.whatwg.org/multipage/links.html#link-type-preload)
- Chromium 和 WebKit 验收分别保留 Worker 命中、素材解码或字体加载、资产端请求数和无 Worker 对照证据。仅看页面的 `transferSize` 无法判断 Worker 自己是否向资产端发请求。若复访在同一页面进程内执行，浏览器还可能在请求到达 Worker 之前复用已有素材。 [Resource Timing 的跨域及 Worker 限制](https://www.w3.org/TR/resource-timing/#sec-cross-origin-resources) [浏览器实验](#浏览器实验)
- 日常浏览器 CI 使用固定素材检出。`E2E_PUBLIC_ASSET_DIR` 可令本地开发服务器改为自己提供素材，Chromium 也可经测试映射访问本地素材站。应用构建仍输出生产 URL。可用独立双源验收让 HTTP 过期和资产端计数可重复，另用实际 Pages 产物验证根路径注册、线上 CORS、字体及季节背景加载。 [日常 CI 的本地素材路径](https://github.com/titanxxh/open-agricola/blob/de0901f9689a21caa33dd76d673c0ff615262fcf/docs/operations/ci-checks.md#L83-L86) [Chromium 素材站映射](https://github.com/titanxxh/open-agricola/blob/de0901f9689a21caa33dd76d673c0ff615262fcf/playwright.config.ts#L1-L14)
- Replay Viewer 继续按已发布 URL 和 CSP 取素材。其独立的 credentialless Viewer 未纳入双源实验。正式验收应检查历史 Viewer 的旧 URL 和图、字体回归。 [不可变 Viewer](https://github.com/titanxxh/open-agricola/blob/de0901f9689a21caa33dd76d673c0ff615262fcf/docs/architecture/client.md#L130-L136) [历史素材 URL](https://github.com/titanxxh/open-agricola/blob/de0901f9689a21caa33dd76d673c0ff615262fcf/docs/HOW_TO_DEPLOY.md#L774-L778)

浏览器实验没有运行项目 Vite 产物、移动 Safari、两个版本同时打开的页面、回滚或真实 CDN 传播窗口。这些属于后续实现验收。此处的 Linux WebKit 结果只覆盖受测引擎与条件。
