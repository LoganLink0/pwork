import { Suspense, lazy, useEffect, type ReactNode } from 'react'
import { HashRouter, Navigate, Outlet, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { Sidebar } from './components/shell/Sidebar'
import { Topbar } from './components/shell/Topbar'
import { BottomNav } from './components/shell/BottomNav'
import { CommandPalette } from './components/shell/CommandPalette'
import { QuickNote } from './components/shell/QuickNote'
import { WheelMenu } from './components/shell/WheelMenu'
import { isDesktopApp } from './engine/platform'
import { GlobalShortcuts } from './components/shell/GlobalShortcuts'
import { Home } from './pages/Home'
import { useNotes } from './store/notes'
import { useCollect } from './store/collect'
import { useTasks } from './store/tasks'
import { useGoals } from './store/goals'
import { track, recordError } from './engine/errorLog'
import { runAutoBackupIfDue } from './engine/autoBackup'
import { applySourceCredit } from './engine/sourceCredit'
import { autoRefreshInterestProfile } from './engine/interestProfile'
import { cloudConfigured, syncFromCloud } from './db/cloudSync'
import { loadSyncConfig, saveSyncConfig, syncNow } from './db/syncRecords'
import { toast } from './engine/toast'
import { ErrorBoundary, ErrorBar } from './components/shell/ErrorReport'
import { Toaster } from './components/shell/Toast'
import { PLACEHOLDER } from './content/placeholder'

// 代码分割：壳 + 首页保持轻量，其余页面按路由懒加载（AD2：模块为懒加载子路由）
const Notes = lazy(() => import('./pages/Notes').then((m) => ({ default: m.Notes })))
const CasesPage = lazy(() => import('./pages/CasesPage').then((m) => ({ default: m.CasesPage })))
const NotesEmptyPane = lazy(() => import('./pages/Notes').then((m) => ({ default: m.NotesEmptyPane })))
const NoteEditor = lazy(() => import('./pages/NoteEditor').then((m) => ({ default: m.NoteEditor })))
const Settings = lazy(() => import('./pages/Settings').then((m) => ({ default: m.Settings })))
const DesignSystem = lazy(() => import('./pages/DesignSystem').then((m) => ({ default: m.DesignSystem })))
const Placeholder = lazy(() => import('./pages/Placeholder').then((m) => ({ default: m.Placeholder })))
const Sources = lazy(() => import('./pages/Sources').then((m) => ({ default: m.Sources })))
const Digest = lazy(() => import('./pages/Digest').then((m) => ({ default: m.Digest })))
const Items = lazy(() => import('./pages/Items').then((m) => ({ default: m.Items })))
const InputBlocks = lazy(() => import('./pages/InputBlocks').then((m) => ({ default: m.InputBlocks })))
const PptWriter = lazy(() => import('./pages/PptWriter').then((m) => ({ default: m.PptWriter })))
const ArticleDraftPage = lazy(() => import('./pages/ArticleDraftPage').then((m) => ({ default: m.ArticleDraftPage })))
const ResearchPage = lazy(() => import('./pages/ResearchPage').then((m) => ({ default: m.ResearchPage })))
const Tasks = lazy(() => import('./pages/Tasks').then((m) => ({ default: m.Tasks })))
const Goals = lazy(() => import('./pages/Goals').then((m) => ({ default: m.Goals })))
const Help = lazy(() => import('./pages/Help').then((m) => ({ default: m.Help })))
const Process = lazy(() => import('./pages/Process').then((m) => ({ default: m.Process })))
const ProcessToolPage = lazy(() => import('./pages/ProcessToolPage').then((m) => ({ default: m.ProcessToolPage })))
const Welcome = lazy(() => import('./pages/Welcome').then((m) => ({ default: m.Welcome })))
const Output = lazy(() => import('./pages/Output').then((m) => ({ default: m.Output })))
const ReportGenerator = lazy(() => import('./pages/ReportGenerator').then((m) => ({ default: m.ReportGenerator })))
const ReadOutLoud = lazy(() => import('./pages/ReadOutLoud').then((m) => ({ default: m.ReadOutLoud })))
const DataCard = lazy(() => import('./pages/DataCard').then((m) => ({ default: m.DataCard })))

// 回路模块（W3 自 FUPAN 迁入，03 §5）：页面组件零改动，路由收敛为 /review/* 子路由
const ReviewDashboard = lazy(() => import('./modules/review/pages/Dashboard').then((m) => ({ default: m.Dashboard })))
const ReviewNew = lazy(() => import('./modules/review/pages/NewReview').then((m) => ({ default: m.NewReview })))
const ReviewWizard = lazy(() => import('./modules/review/pages/Wizard').then((m) => ({ default: m.Wizard })))
const ReviewMeeting = lazy(() => import('./modules/review/pages/MeetingRoom').then((m) => ({ default: m.MeetingRoom })))
const ReviewArchive = lazy(() => import('./modules/review/pages/ArchiveDetail').then((m) => ({ default: m.ArchiveDetail })))
const ReviewAssets = lazy(() => import('./modules/review/pages/Library').then((m) => ({ default: m.Library })))
const ReviewStats = lazy(() => import('./modules/review/pages/StatsView').then((m) => ({ default: m.StatsView })))
const ReviewHelp = lazy(() => import('./modules/review/pages/Help').then((m) => ({ default: m.Help })))

function PageFallback() {
  return <div className="empty"><p>加载中…</p></div>
}

/** 回路模块布局：.review-root 作用域承载其样式（styles/review.css），与壳样式互不污染 */
function ReviewLayout() {
  return (
    <div className="review-root">
      <Outlet />
    </div>
  )
}

/** 占位路由元素：kind 对应 content/placeholder.ts */
function Ph({ kind }: { kind: keyof typeof PLACEHOLDER | string }) {
  return <Placeholder kind={kind} />
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

  useEffect(() => {
    track(load(), '应用启动加载速记库')
    track(loadCollect(), '应用启动加载采集库')
    track(loadTasks(), '应用启动加载任务库')
    track(useGoals.getState().load(), '应用启动加载目标库')
    // 自动备份：完成后告知落点；发生降级（目录权限失效改走下载）要明说——按旧路径找备份会扑空
    track(
      runAutoBackupIfDue().then((r) => {
        if (r.downloaded) {
          const where = r.location === 'dir' ? '备份文件夹' : r.location === 'disk' ? 'AppData 备份目录' : '下载文件夹'
          toast('ok', `自动备份完成（${where}${r.fileName ? `：${r.fileName}` : ''}）`)
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
          if (r.newCount > 0) await useCollect.getState().load()
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
      }))
      .then((fn) => {
        unlisten = fn
      })
      .catch(() => {})
    return () => unlisten?.()
  }, [])

  return (
    <HashRouter>
      <RoutedBoundary>
        <FirstRunRedirect />
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
                  <Route path="/" element={<Home />} />
                  <Route path="/tasks" element={<Tasks />} />
                  <Route path="/goals" element={<Goals />} />
                  <Route path="/input/notes" element={<Notes />}>
                    <Route index element={<NotesEmptyPane />} />
                    <Route path=":id" element={<NoteEditor />} />
                  </Route>
                  <Route path="/input/digest" element={<Digest />} />
                  <Route path="/input/sources" element={<Sources />} />
                  <Route path="/input/items" element={<Items />} />
                  <Route path="/input/blocks" element={<InputBlocks />} />
                  <Route path="/cases" element={<CasesPage />} />
                  <Route path="/process" element={<Process />} />
                  <Route path="/process/t/:toolId" element={<ProcessToolPage />} />
                  <Route path="/output" element={<Output />} />
                  <Route path="/output/report" element={<ReportGenerator />} />
                  <Route path="/output/read" element={<ReadOutLoud />} />
                  <Route path="/output/card" element={<DataCard />} />
                  <Route path="/output/ppt" element={<Navigate to="/output/report" replace />} />
                  <Route path="/output/write" element={<PptWriter />} />
                  <Route path="/output/article" element={<ArticleDraftPage />} />
                  <Route path="/output/research" element={<ResearchPage />} />
                  <Route path="/output/draft" element={<Navigate to="/output/article" replace />} />
                  <Route path="/output/video" element={<Ph kind="video" />} />
                  <Route
                    path="/review"
                    element={<ReviewLayout />}
                  >
                    <Route index element={<ReviewDashboard />} />
                    <Route path="new" element={<ReviewNew />} />
                    <Route path="wizard" element={<ReviewWizard />} />
                    <Route path="meeting" element={<ReviewMeeting />} />
                    <Route path="archive/:id" element={<ReviewArchive />} />
                    <Route path="assets" element={<ReviewAssets />} />
                    <Route path="analytics" element={<ReviewStats />} />
                    <Route path="help" element={<ReviewHelp />} />
                  </Route>
                  <Route path="/settings" element={<Settings />} />
                  <Route path="/help" element={<Help />} />
                  <Route path="/welcome" element={<Welcome />} />
                  <Route path="/design" element={<DesignSystem />} />
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
      </RoutedBoundary>
    </HashRouter>
  )
}
