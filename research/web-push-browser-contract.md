# Web Push 的浏览器与房间入口约束

研究问题见[哪些环境支持 Web Push，订阅和点击能依赖哪些行为？](https://github.com/titanxxh/open-agricola/issues/1827)。于 2026-11-18 核对标准、厂商资料和 Open Agricola 源码。源码基线为 [main `de0901f96`](https://github.com/titanxxh/open-agricola/tree/de0901f9689a21caa33dd76d673c0ff615262fcf)。本次证据来自文档和静态代码检查。实机项目列在文末。

## 授权和安装

| 环境 | 厂商已公开的行为 |
| --- | --- |
| 桌面 Chrome、Android Chrome | 普通网站可以请求站点通知授权。Chrome 公布的 Web Push 支持覆盖桌面和 Android，普通站点使用时无须安装。允许、阻止和撤销权限均由浏览器管理。 [Chrome Web Push](https://developer.chrome.com/blog/notification-actions) · [桌面通知权限](https://support.google.com/chrome/answer/3220216?co=GENIE.Platform%3DDesktop&hl=en) · [Android 通知权限](https://support.google.com/chrome/answer/3220216?co=GENIE.Platform%3DAndroid&hl=en) |
| Firefox 桌面和 Android | Mozilla 支持网站在标签页未打开时推送。Firefox 桌面默认需要浏览器在运行，Mozilla 在部分 Windows 用户上另提供关闭浏览器时接收的能力。Android 通过 Mozilla Push 和 Google 消息服务投递。 [Mozilla Web Push](https://support.mozilla.org/en-US/kb/push-notifications-firefox) · [浏览器关闭时的通知](https://support.mozilla.org/en-US/kb/closed-browser-notifications) |
| macOS Safari | Safari 16.1 与 macOS Ventura 起支持标准 Web Push。普通网站可以在用户点击订阅按钮后请求授权，无须添加到 Dock。 [Safari 16.1 说明](https://webkit.org/blog/13399/webkit-features-in-safari-16-1/) |
| iOS 和 iPadOS | 16.4 起支持添加到主屏幕的 Web App，用户要在该 App 中主动操作以触发系统授权。26 起添加到主屏幕默认以 Web App 打开，用户也可关掉这个选项，将图标作为浏览器书签。主屏幕快捷方式和可订阅的 Web App 要按实际运行模式区分。 [Web Push 与主屏幕 Web App](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/) · [Safari 26 的安装行为](https://webkit.org/blog/17333/webkit-features-in-safari-26-0/) |

经典模式使用安全上下文、活动的 Service Worker 注册和用户授权。订阅入口可基于能力检测和实际订阅结果呈现，用于提示当前设备是否可用。浏览器和系统可以撤销或限制权限，标签页关闭后的投递与浏览器进程被退出、系统限制后台运行是不同场景。站点的交付承诺应以目标设备证据为准。 [Push API 工作草案](https://www.w3.org/TR/2026/WD-push-api-20261116/) · [Chrome 订阅流程](https://web.dev/articles/push-notifications-subscribing-a-user)

## 订阅、退出和缓存停用

- **经典订阅的浏览器归属。** `ServiceWorkerRegistration.pushManager` 创建绑定注册范围的订阅，范围和存储上下文用于匹配注册。站点账号切换不属于 Push API 事件，原浏览器订阅仍可能有效。同一存储上下文和范围中常规更新 Worker 脚本会更新原注册的活动 Worker，规范没有规定该更新必须换订阅。浏览器和推送服务可独立刷新订阅或更换端点和密钥。 [Push API §3.4](https://www.w3.org/TR/2026/WD-push-api-20261116/#push-subscription) · [Service Workers 更新流程](https://www.w3.org/TR/2026/CRD-service-workers-20261029/#update-algorithm)
- **注销的影响。** 最新 Push API 草案要求在关联注册注销时停用没有 `window-accessible scope` 的经典订阅。已被旧 Worker 控制的页面可能持续受其控制直到卸载，`unregister()` 返回不能证明所有页面已切换。若缓存和经典推送共用注册，想保留提醒时可以停用素材拦截并删除对应缓存。注销是整支 Worker 的退役动作。 [Push API 停用规则](https://www.w3.org/TR/2026/WD-push-api-20261116/#subscription-deactivation) · [Service Worker 注销规则](https://www.w3.org/TR/2026/CRD-service-workers-20261029/#dom-serviceworkerregistration-unregister)
- **撤权和失效。** 浏览器撤权后停用相关订阅。规范允许浏览器在撤权时发送 `pushsubscriptionchange`，实际同步服务端还要考虑事件支持及网络失败。发送到已过期订阅时，RFC 8030 规定推送服务返回 HTTP 404。这给服务端提供了清理失效端点的依据。推送服务受理请求也尚未证明用户看到提醒。 [Push API §3.4 与 §4](https://www.w3.org/TR/2026/WD-push-api-20261116/#subscription-deactivation) · [RFC 8030 §7.3](https://www.rfc-editor.org/rfc/rfc8030.html#section-7.3)
- **账号关联。** Open Agricola 现在通过 API 的 host-only HttpOnly Cookie 识别登录，退出当前会话和退出所有会话已有不同入口。推送方案需要明确服务端如何解除订阅与账号的绑定，以及当前设备、其他设备、离线退出和重登各自的行为；浏览器授权和站点身份是独立状态。账号 A 退出后 B 在同一浏览器登录时，旧端点不能随 B 登录自动沿用 A 的提醒。已交给推送服务的消息仍可能在短时间内抵达，通知显示的内容和点击后的鉴权要按这个情形验收。端点 URL 属于应保密的能力凭据。 [登录边界](https://github.com/titanxxh/open-agricola/blob/de0901f9689a21caa33dd76d673c0ff615262fcf/docs/adr/0035-github-pages-remains-the-frontend-host.md#L6-L10) · [退出入口](https://github.com/titanxxh/open-agricola/blob/de0901f9689a21caa33dd76d673c0ff615262fcf/client/contexts/AuthContext.tsx#L193-L207) · [RFC 8030 §8.3](https://www.rfc-editor.org/rfc/rfc8030.html#section-8.3)
- **声明式推送的区别。** WebKit 在 iOS/iPadOS 18.4 的主屏幕 Web App 和 Safari 18.5 的 macOS 支持声明式通知。它可以使用推送消息里的 `navigate` 直接打开目标，也有无需 Service Worker 的订阅入口。最新 W3C 工作草案已纳入这类窗口可访问范围。经典模式的注销推论不能推广到这类订阅，首版能否依赖声明式能力需另看目标浏览器。 [WebKit 声明式推送说明](https://webkit.org/blog/16535/meet-declarative-web-push/) · [Safari 18.4](https://webkit.org/blog/16574/webkit-features-in-safari-18-4/) · [Safari 18.5](https://webkit.org/blog/16923/webkit-features-in-safari-18-5/)

## 点击通知和回房

经典持久通知的点击可通过 `notificationclick` 交给 Worker。用 `event.waitUntil()` 等待窗口操作。可从当前存储上下文的窗口中找已打开的目标房间并尝试 `focus()`，找不到时尝试 `clients.openWindow()`。标准规定同源、存储键和用户激活方面的限制。打开方式可能是标签页或安装的 App 窗口，具体由浏览器和设备决定。唤醒一个窗口本身不会导航到指定 URL，已有其他房间窗口也未必适合复用。 [Notifications API](https://notifications.spec.whatwg.org/#using-actions) · [Service Worker 客户端 API](https://www.w3.org/TR/2026/CRD-service-workers-20261029/#clients)

Open Agricola 正式前端在 GitHub Pages，API 在同站点的另一域名。通知 URL 可以指向正式前端，再由服务端验证当前账号和座位。现有普通 `?room=` 入口可能加入空席或进入观战。已有 `?context=` 入口请求 `intent=resume`，对活跃局要求原参与者，更符合轮抽提醒的语义。应由后续决策票确认采用哪个入口和串号、失效链接的展示。点击只导航，登录、游戏阶段和当前牌包从权威服务端读取。 [GameContextRouter](https://github.com/titanxxh/open-agricola/blob/de0901f9689a21caa33dd76d673c0ff615262fcf/client/app/GameContextRouter.tsx#L336-L345) · [房间解析请求](https://github.com/titanxxh/open-agricola/blob/de0901f9689a21caa33dd76d673c0ff615262fcf/client/app/GameContextRouter.tsx#L390-L411) · [参与者检查](https://github.com/titanxxh/open-agricola/blob/de0901f9689a21caa33dd76d673c0ff615262fcf/server/game/game-context-store.ts#L256-L299)

WebKit 从 iOS/iPadOS 17.2 起说明，创建主屏幕 App 时会复制 Cookie 形式的登录状态，之后不再共享网站数据。Open Agricola 的 API Cookie 在同站不同源，厂商的通用说明没有确认该拓扑下安装时的 Cookie 复制和后续通知点击。应验证安装前已登录、安装后单独登录、浏览器标签切换账号和主屏幕 App 的有效会话。 [Safari 17.2 Web App 行为](https://webkit.org/blog/14787/webkit-features-in-safari-17-2/) · [Open Agricola 登录边界](https://github.com/titanxxh/open-agricola/blob/de0901f9689a21caa33dd76d673c0ff615262fcf/docs/adr/0035-github-pages-remains-the-frontend-host.md#L6-L10)

## 实机待证

- 桌面 Chrome 和 macOS Safari 分别测试页面已关、浏览器仍运行与浏览器退出。Android Chrome 测普通标签页授权、后台和屏幕锁定。iPhone 以正式同站点双域名部署测试主屏幕安装、授权、显示和点击。若承诺 iPad 或更低系统版本的支持，也记录相应真机结果。
- 点击覆盖没有窗口、已有目标房间、已有另一房间、登录失效、换账号、房间已完成或过期。核对最终 URL 与会话、参与者资格和权威牌包状态。记录系统版本、浏览器、通知授权、前后台状态、打开的容器与回执。
- 用同一订阅验证正常 Worker 更新和单独停用资产缓存；再以测试订阅验证撤权、注销、退出、换账号及失效端点回收。确认重复或延迟的通知无法触发任何选牌命令。
- Linux Playwright WebKit 可以检查网页路由和 Worker 行为。项目的现有 WebKit 路径使用隐私限制参数检查认证，但该证据不覆盖 Apple 系统通知、APNs、主屏幕安装或真实的点击唤起。 [现有浏览器架构与验收边界](https://github.com/titanxxh/open-agricola/blob/de0901f9689a21caa33dd76d673c0ff615262fcf/docs/architecture/client.md#L38-L42) · [现有 WebKit 登录测试](https://github.com/titanxxh/open-agricola/blob/de0901f9689a21caa33dd76d673c0ff615262fcf/e2e-tests/hosted-password-login.spec.ts#L369-L386)
