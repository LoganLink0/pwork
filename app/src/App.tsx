import { Suspense, lazy, useEffect } from 'react'
import { HashRouter, Navigate, Outlet, Route, Routes, useNavigate } from 'react-router-dom'
import { Sidebar } from './components/shell/Sidebar'
import { Topbar } from './components/shell/Topbar'
import { BottomNav } from './components/shell/BottomNav'
import { CommandPalette } from './components/shell/CommandPalette'
import { QuickNote } from './components/shell/QuickNote'
import { GlobalShortcuts } from './components/shell/GlobalShortcuts'
import { Home } from './pages/Home'
import { useNotes } from './store/notes'
import { useCollect } from './store/collect'
import { useTasks } from './store/tasks'
import { useGoals } from './store/goals'
import { PLACEHOLDER } from './content/placeholder'

// 代码分割：壳 + 首页保持轻量，其余页面按路由懒加载（AD2：模块为懒加载子路由）
const Notes = lazy(() => import('./pages/Notes').then((m) => ({ default: m.Notes })))
const NotesEmptyPane = lazy(() => import('./pages/Notes').then((m) => ({ default: m.NotesEmptyPane })))
const NoteEditor = lazy(() => import('./pages/NoteEditor').then((m) => ({ default: m.NoteEditor })))
const Settings = lazy(() => import('./pages/Settings').then((m) => ({ default: m.Settings })))
const DesignSystem = lazy(() => import('./pages/DesignSystem').then((m) => ({ default: m.DesignSystem })))
const Placeholder = lazy(() => import('./pages/Placeholder').then((m) => ({ default: m.Placeholder })))
const Sources = lazy(() => import('./pages/Sources').then((m) => ({ default: m.Sources })))
const Digest = lazy(() => import('./pages/Digest').then((m) => ({ default: m.Digest })))
const Items = lazy(() => import('./pages/Items').then((m) => ({ default: m.Items })))
const Tasks = lazy(() => import('./pages/Tasks').then((m) => ({ default: m.Tasks })))
const Goals = lazy(() => import('./pages/Goals').then((m) => ({ default: m.Goals })))
const Help = lazy(() => import('./pages/Help').then((m) => ({ default: m.Help })))
const Process = lazy(() => import('./pages/Process').then((m) => ({ default: m.Process })))
const ProcessToolPage = lazy(() => import('./pages/ProcessToolPage').then((m) => ({ default: m.ProcessToolPage })))
const Welcome = lazy(() => import('./pages/Welcome').then((m) => ({ default: m.Welcome })))

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

export default function App() {
  const load = useNotes((s) => s.load)
  const loadCollect = useCollect((s) => s.load)
  const loadTasks = useTasks((s) => s.load)

  useEffect(() => {
    void load()
    void loadCollect()
    void loadTasks()
    void useGoals.getState().load()
  }, [load, loadCollect, loadTasks])

  return (
    <HashRouter>
      <FirstRunRedirect />
      <GlobalShortcuts />
      <div className="app">
        <Sidebar />
        <div className="main">
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
                  <Route path="/process" element={<Process />} />
                  <Route path="/process/t/:toolId" element={<ProcessToolPage />} />
                  <Route path="/output" element={<Ph kind="output" />} />
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
    </HashRouter>
  )
}
