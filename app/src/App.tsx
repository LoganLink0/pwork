import { Suspense, lazy, useEffect, useRef, useState, type ReactNode } from 'react'
import { HashRouter, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { Sidebar } from './components/shell/Sidebar'
import { Topbar } from './components/shell/Topbar'
import { BottomNav } from './components/shell/BottomNav'
import { CommandPalette } from './components/shell/CommandPalette'
import { QuickNote } from './components/shell/QuickNote'
import { WheelMenu } from './components/shell/WheelMenu'
import { isDesktopApp } from './engine/platform'
import { invoke as tauriInvoke } from '@tauri-apps/api/core'
import { GlobalShortcuts } from './components/shell/GlobalShortcuts'
import { PAGE_REGISTRY } from './registry'
import { useNotes } from './store/notes'
import { useCollect } from './store/collect'
import { useTasks } from './store/tasks'
import { useGoals } from './store/goals'
import { track, recordError } from './engine/errorLog'
import { runAutoBackupIfDue } from './engine/autoBackup'
import { applySourceCredit } from './engine/sourceCredit'
import { autoRefreshInterestProfile } from './engine/interestProfile'
import { requestPersistence } from './engine/storageHealth'
import { runStartupHealthCheck, recoveryGuidance } from './engine/dbHealth'
import { runStartupNotifiesFromDb, notifyDigestReady } from './engine/notify'
import { loadKeybinds } from './engine/keybinds'
import { MigrationModal } from './components/shell/MigrationModal'
import { storageReady } from './db/schema'
import { cloudConfigured, syncFromCloud } from './db/cloudSync'
import { loadSyncConfig, saveSyncConfig, syncNow } from './db/syncRecords'
import { toast } from './engine/toast'
import { ErrorBoundary, ErrorBar } from './components/shell/ErrorReport'
import { DemoBanner } from './components/shell/DemoBanner'
import { Toaster } from './components/shell/Toast'
// 页面注册表（0.4-5）：路由/导航/面包屑/命令面板的单点数据源，见 registry.tsx

function PageFallback() {
  return <div className="empty"><p>加载中…</p></div>
}

/** 从注册表递归生成路由树：redirect → <Navigate>；children → 嵌套布局（layoutElement 或懒加载父组件）。
 *  返回数组由 <Routes> 直接展开（Routes 的直接子元素必须是 Route，组件包装会被 react-router 拒绝）。 */
function registryRoutes(): ReactNode[] {
  return PAGE_REGISTRY.map((p) => {
    if (p.redirect) {
      return <Route key={p.path} path={p.path} element={<Navigate to={p.redirect} replace />} />
    }
    if (p.children?.length) {
      if (p.layoutElement) {
        return (
          <Route key={p.path} path={p.path} element={p.layoutElement}>
            {p.children.map((c) => {
              if (!c.loader) return null
              const C = lazy(c.loader)
              return <Route key={c.path || 'index'} index={c.index} path={c.index ? undefined : c.path} element={<C />} />
            })}
          </Route>
        )
      }
      if (!p.loader) return null
      const Layout = lazy(p.loader)
      return (
        <Route key={p.path} path={p.path} element={<Layout />}>
          {p.children.map((c) => {
            if (!c.loader) return null
            const C = lazy(c.loader)
            return <Route key={c.path || 'index'} index={c.index} path={c.index ? undefined : c.path} element={<C />} />
          })}
        </Route>
      )
    }
    if (!p.loader) return null
    const C = lazy(p.loader)
    return <Route key={p.path} path={p.path} element={<C />} />
  })
}

/** 首访引导：只发生一次（本地标记），且仅在打开首页时。须在 Router 上下文内（useNavigate）。 */
function FirstRunRedirect() {
  const navigate = useNavigate()
  useEffect(() => {
    if (!localStorage.getItem('pwork-welcomed')) {
      localStorage.setItem('pwork-welcomed', '1')
      const hash = window.location.hash
      if (hash === '' || hash === '#/' || hash === '#') navigate('/welcome', { replace: true })
    }
  }, [navigate])
  return null
}

/** 桌面版外链统一走系统浏览器：WebView 不处理 target=_blank，
 *  全站所有外链（GitHub 入口、拿 Key、注册引导等）在这里一次接管。
 *  invoke 用静态 import（动态 import 的依赖预加载在 tauri.localhost 下挂起，点击无响应）。 */
function ExternalLinks() {
  useEffect(() => {
    if (!isDesktopApp()) return
    const onClick = (e: MouseEvent) => {
      const anchor = (e.target as HTMLElement | null)?.closest?.('a[target="_blank"]')
      if (!(anchor instanceof HTMLAnchorElement)) return
      const href = anchor.getAttribute('href') ?? ''
      if (!/^https?:\/\//i.test(href)) return
      e.preventDefault()
      tauriInvoke('open_external_url', { url: href }).catch((err) => {
        void recordError({ where: 'ExternalLinks', kind: 'app', message: `外链打开失败 ${href}: ${err instanceof Error ? err.message : String(err)}` })
        toast('error', '链接打开失败——已记录，可复制地址到浏览器手动打开')
      })
    }
    document.addEventListener('click', onClick, true)
    return () => document.removeEventListener('click', onClick, true)
  }, [])
  return null
}

/** 自动同步只跑一次（StrictMode 开发期双挂载 / HMR 重挂载都不重复拉云端） */
let autoSyncRan = false

/** 窗口重新可见时的拉新节流（页面长开跨小时：cron 抓的新数据不该等刷新才看见） */
let lastFocusPullAt = 0

/** 拉一轮云端增量（静默失败；有新条目才出声）。触发源两个：窗口聚焦事件 + 15 分钟定时——
 *  只挂事件有漏洞：窗口一直可见就一直等不到事件（2026-10-21 用户实测踩中） */
function pullCloudIncremental() {
  if (!cloudConfigured()) return
  if (Date.now() - lastFocusPullAt < 5 * 60_000) return
  lastFocusPullAt = Date.now()
  void syncFromCloud().then(async (r) => {
    if (!r.ok) {
      void recordError(
        { where: '云端同步.定时拉新', kind: 'app', message: r.error ?? '未知失败' },
        { silent: true },
      )
      return
    }
    if (r.newCount > 0) {
      await useCollect.getState().load()
      toast('ok', `已拉取云端新条目 ${r.newCount} 条`)
    }
  })
}

/** 边界包装：随路由重置错误态（崩溃后点链接可恢复），并把壳层（侧栏/顶栏/浮层）一起纳入保护 */
function RoutedBoundary({ children }: { children: ReactNode }) {
  const location = useLocation()
  return <ErrorBoundary key={location.pathname}>{children}</ErrorBoundary>
}

export default function App() {
  const load = useNotes((s) => s.load)
  const loadCollect = useCollect((s) => s.load)
  const loadTasks = useTasks((s) => s.load)
  // 数据存储升级窗口（08 S2）：桌面版检测到旧数据待迁移时展示；完成自动重开 / 暂不则本会话继续旧存储
  const [migrationPending, setMigrationPending] = useState(false)
  const startServicesRef = useRef<() => void>(() => {})

  useEffect(() => {
    const startServices = () => {
    track(load(), '应用启动加载速记库')
    track(loadCollect(), '应用启动加载采集库')
    track(loadTasks(), '应用启动加载任务库')
    track(useGoals.getState().load(), '应用启动加载目标库')
    // 存储耐久第一道闸（0.3a）：启动即静默申请持久化保护；结果不弹通知（设置 → 数据 可查状态）
    track(requestPersistence(), '申请持久化存储')
    // 数据不丢第三道闸（0.3f）：库打不开立即弹错误条给恢复指引，不静默带病运行
    track(
      runStartupHealthCheck().then((r) => {
        if (!r.ok) {
          void recordError({
            where: 'App.启动健康检查', kind: 'app',
            message: `数据库打开失败，数据可能损坏：${r.error}。${recoveryGuidance(isDesktopApp())}`,
          })
        }
      }),
      '启动数据健康检查',
    )
    // 系统通知（0.4-1）：待办到期与复盘节奏，启动查一次、每类每日最多一条（设置 → 通知 可关）
    track(runStartupNotifiesFromDb(), '启动通知检查')
    // 键位中心（0.4-3）：轮盘全局键按用户配置重注册（默认键 Rust 侧已注册；改动/占用失败会弹错误条）
    if (isDesktopApp()) {
      const kb = loadKeybinds()
      track(
        tauriInvoke<string>('register_wheel_shortcut', { combo: kb.wheel }).then((label) => {
          if (label && label.toUpperCase() !== 'CTRL+ALT+Q') toast('ok', `工具轮盘全局键已设为 ${label}`)
        }),
        '注册轮盘全局键',
      )
    }
    // 自动备份：完成后告知落点；发生降级（目录权限失效改走下载）要明说——按旧路径找备份会扑空
    track(
      runAutoBackupIfDue().then((r) => {
        if (r.downloaded) {
          const where = r.location === 'dir' ? '备份文件夹' : r.location === 'disk' ? 'AppData 备份目录' : '下载文件夹'
          toast('ok', `自动备份完成（${where}${r.fileName ? `：${r.fileName}` : ''}）`)
        }
        if (r.error) {
          void recordError({ where: 'App.自动备份', kind: 'app', message: `自动备份失败：${r.error}` }, { silent: true })
        }
        if (r.rotateError) {
          void recordError({ where: 'App.自动备份', kind: 'app', message: r.rotateError }, { silent: true })
        }
      }),
      '自动备份',
    )
    // 打开应用自动同步云端（2026-10-12 用户拍板，04 设计"无定时，打开时同步"的补课）：
    // 已配置才拉；失败只入错误日志不弹条（云端偶发不可达不该每次打开都红条），成功拉到新条目则刷新采集库
    if (!autoSyncRan) {
      autoSyncRan = true
      if (cloudConfigured()) {
        void syncFromCloud().then(async (r) => {
          if (!r.ok) {
            void recordError(
              { where: '云端同步.打开应用自动同步', kind: 'app', message: r.error ?? '未知失败' },
              { silent: true },
            )
            return
          }
          if (r.newCount > 0) {
            await useCollect.getState().load()
            void notifyDigestReady(r.newCount)
          }
        })
      }
      // 项目待办静默扫描（2026-10-14）：授权还在就自动拉新行；需要重新授权时不打扰，等用户点待办页按钮
      void useTasks.getState().scanProjectTodos('open').then((r) => {
        if (r.ok && r.added > 0) {
          toast('ok', `项目待办：${r.projects} 个项目新进 ${r.added} 条`)
          void useTasks.getState().load()
        }
      })
      // 设备同步（2026-10-19 记录级增量，替换镜像档 1）：开启即"先拉后推"，只传增量；
      // 拉到变化刷新各库并提示；失败静默入错误日志不打扰
      const deviceSync = loadSyncConfig()
      if (deviceSync.enabled) {
        void syncNow()
          .then(async ({ pull, push }) => {
            const changed = pull.merged ?? 0
            if (changed > 0 || pull.configApplied) {
              await Promise.all([
                useNotes.getState().load(),
                useCollect.getState().load(),
                useTasks.getState().load(),
                useGoals.getState().load(),
              ])
              toast('ok', `设备同步：合并 ${changed} 条${pull.configApplied ? '（含采集配置）' : ''}`)
            }
            saveSyncConfig({ ...loadSyncConfig(), lastSyncAt: new Date().toISOString(), lastPushed: push.pushed, lastPulled: pull.pulled })
          })
          .catch((e) => {
            void recordError(
              { where: '设备同步.打开应用', kind: 'app', message: e instanceof Error ? e.message : String(e) },
              { silent: true },
            )
          })
      }
      // 信源信用（2026-10-20 第一性重设计）：「多推」投票自动升降信源档位，变化才通知
      void applySourceCredit()
        .then((changes) => {
          if (changes.length > 0) {
            const label = (c: { name: string; fromTier: number; toTier: number }) =>
              `「${c.name}」${c.toTier < c.fromTier ? '升' : '降'}为 T${c.toTier}`
            toast('info', `信源信用（按你的投票）：${changes.map(label).join('、')}`)
            void useCollect.getState().load()
          }
        })
        .catch((e) => {
          void recordError(
            { where: '信源信用.自动升降', kind: 'app', message: e instanceof Error ? e.message : String(e) },
            { silent: true },
          )
        })
      // AI 兴趣画像：攒够「多推」投票自动归纳（阈值与防重见 engine/interestProfile.ts）
      void autoRefreshInterestProfile()
    }
    }
    startServicesRef.current = startServices

    // 存储后端选择就绪后才启动服务（08 S2：桌面版等 SQLite/迁移决策，网页版等存储探针）
    void storageReady.then((choice) => {
      if (choice.choice === 'needs-migration') {
        setMigrationPending(true)
        return
      }
      startServices()
    })
  }, [load, loadCollect, loadTasks])

  // 窗口重新可见/聚焦 + 每 15 分钟定时：拉一轮云端增量
  // （页面长开跨小时，cron 抓的新数据不等刷新；持续可见的窗口等不到事件，靠定时兜底）
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') pullCloudIncremental()
    }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', pullCloudIncremental)
    const timer = window.setInterval(pullCloudIncremental, 15 * 60_000)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', pullCloudIncremental)
      window.clearInterval(timer)
    }
  }, [])

  // 桌面版：网关端口被占（Rust 侧让位并发出事件）——可能是开发版网关，也可能是
  // 冒名进程截获对话内容，必须让用户看见而不是静默降级（安全审计 F12）
  useEffect(() => {
    if (!isDesktopApp()) return
    let unlisten: (() => void) | null = null
    void import('@tauri-apps/api/event')
      .then(({ listen }) => listen('gateway-conflict', () => {
        window.alert('端口 8788 已被其他进程占用，应用内嵌 AI 网关没有启动。\n若不是你自己起的开发版网关，请检查占用 8788 的进程（可能截获对话内容）。')
        void recordError({ where: 'App.网关冲突', kind: 'app', message: '端口 8788 被其他进程占用，内嵌网关未启动——AI 与抓取网关通路不可用' })
      }))
      .then((fn) => {
        unlisten = fn
      })
      .catch(() => {})
    return () => unlisten?.()
  }, [])

  return (
    <HashRouter>
      {import.meta.env.MODE === 'demo' && <DemoBanner />}
      <RoutedBoundary>
        <FirstRunRedirect />
        <ExternalLinks />
        <GlobalShortcuts />
        <div className="app">
          <Sidebar />
          <div className="main">
            <ErrorBar />
            <Toaster />
            <Topbar />
            <div className="content">
              <div className="content-inner">
                <Suspense fallback={<PageFallback />}>
                  <Routes>
                    {registryRoutes()}
                    {/* 未知路径回首页 */}
                    <Route path="*" element={<Navigate to="/" replace />} />
                  </Routes>
                </Suspense>
              </div>
            </div>
          </div>
        </div>
      <BottomNav />
      <CommandPalette />
      <QuickNote />
      {isDesktopApp() && <WheelMenu />}
      {migrationPending && (
        <MigrationModal
          onSkip={() => {
            setMigrationPending(false)
            startServicesRef.current()
          }}
        />
      )}
      </RoutedBoundary>
    </HashRouter>
  )
}
