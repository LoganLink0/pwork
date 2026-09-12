import { Suspense, lazy } from 'react'
import { HashRouter, NavLink, Route, Routes } from 'react-router-dom'

const CasesList = lazy(() => import('./pages/CasesList').then((m) => ({ default: m.CasesList })))
const CaseLayout = lazy(() => import('./pages/CaseLayout').then((m) => ({ default: m.CaseLayout })))
const CaseIndexRedirect = lazy(() => import('./pages/CaseLayout').then((m) => ({ default: m.CaseIndexRedirect })))
const CaseStepRoute = lazy(() => import('./pages/CaseLayout').then((m) => ({ default: m.CaseStepRoute })))
const Settings = lazy(() => import('./pages/Settings').then((m) => ({ default: m.Settings })))

function Fallback() {
  return <div className="app-main"><p className="hint">加载中…</p></div>
}

/** HashRouter 必须在 App 内部（外部测试直接渲染 <App />，复盘 1.4） */
export default function App() {
  return (
    <HashRouter>
      <header className="app-topbar">
        <NavLink to="/" className="app-logo"><span className="dot" aria-hidden />简历辅导</NavLink>
        <nav className="app-nav" aria-label="主导航">
          <NavLink to="/" end>案例库</NavLink>
          <NavLink to="/settings">AI 设置</NavLink>
        </nav>
      </header>
      <Suspense fallback={<Fallback />}>
        <Routes>
          <Route path="/" element={<CasesList />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/cases/:id" element={<CaseLayout />}>
            <Route index element={<CaseIndexRedirect />} />
            <Route path=":step" element={<CaseStepRoute />} />
          </Route>
          <Route path="*" element={<div className="app-main"><div className="notice">页面不存在</div></div>} />
        </Routes>
      </Suspense>
    </HashRouter>
  )
}
