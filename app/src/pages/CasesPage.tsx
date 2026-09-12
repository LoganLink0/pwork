import { useEffect, useState } from 'react'

/**
 * 简历辅导跳转入口（PWORK 只做入口，不承载简历辅导功能）。
 * 简历辅导已独立为 resume-coach 项目（本仓库 resume-coach/ 目录，端口 5274）。
 */
export function CasesPage() {
  const [up, setUp] = useState<boolean | null>(null)

  useEffect(() => {
    let alive = true
    fetch('http://127.0.0.1:5274/')
      .then((r) => {
        if (alive) setUp(r.ok)
      })
      .catch(() => {
        if (alive) setUp(false)
      })
    return () => {
      alive = false
    }
  }, [])

  return (
    <section className="settings" style={{ maxWidth: 'var(--content-w)' }}>
      <div className="page-head">
        <h1>简历辅导（独立应用）</h1>
        <span className="sub">案例模块已独立为 resume-coach 项目——PWORK 只做入口，不承载业务功能</span>
      </div>

      <div className="set-card">
        <h2>打开简历辅导</h2>
        <div className="set-body">
          <div className="set-row">
            {up === true && (
              <a className="btn-primary" style={{ textDecoration: 'none' }} href="http://127.0.0.1:5274" target="_blank" rel="noreferrer" data-testid="open-resume-coach">
                → 打开简历辅导（127.0.0.1:5274）
              </a>
            )}
            {up === false && (
              <>
                <span className="val" style={{ color: 'var(--danger)', fontSize: 'var(--fs-sm)' }}>应用未在运行。</span>
                <span className="val" style={{ fontSize: 'var(--fs-sm)' }}>启动方式：终端进入本仓库 <code>resume-coach</code> 目录，首次先 <code>npm install</code>，然后 <code>npm run dev</code>，浏览器打开 <code>http://127.0.0.1:5274</code>。</span>
              </>
            )}
            {up === null && <span className="val" style={{ fontSize: 'var(--fs-sm)' }}>正在检测应用是否在运行……</span>}
          </div>
          <div className="set-row">
            <span className="val" style={{ fontSize: 'var(--fs-xs)', color: 'var(--ink-faint)' }}>
              AI 网关共用：resume-coach 的「AI 设置」选「本地网关」即可复用 PWORK 的网关（app 目录 npm run gateway）。
            </span>
          </div>
        </div>
      </div>

      <div className="set-card">
        <h2>原来的案例数据</h2>
        <div className="set-body">
          <div className="set-row">
            <span className="val" style={{ fontSize: 'var(--fs-sm)' }}>
              独立前的案例数据仍保留在本机 PWORK 数据库里（未删除）：「设置 → 数据 → 全量导出」可备份。resume-coach 使用独立存储，从零开始。
            </span>
          </div>
        </div>
      </div>
    </section>
  )
}
