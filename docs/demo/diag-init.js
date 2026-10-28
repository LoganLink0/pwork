// 诊断：记录最后一次未捕获异常（本地优先应用无遥测，给"打不开"留一条线索）。
// 独立文件而非 index.html 内联，桌面版 CSP 的 script-src 'self' 才能放行它。
window.addEventListener('error', function (e) {
  try { localStorage.setItem('__pwork-lasterr', (e.message || 'unknown') + ' @ ' + (e.filename || '').split('/').pop() + ':' + (e.lineno || '?')) } catch {}
})
window.addEventListener('unhandledrejection', function (e) {
  try { var r = e.reason; localStorage.setItem('__pwork-lasterr', 'rej: ' + ((r && (r.stack || r.message)) || String(r)).slice(0, 400)) } catch {}
})
