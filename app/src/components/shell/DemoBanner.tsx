/** 在线演示版横幅（仅 demo 构建渲染）：写清演示版定位，引导桌面版拿完整功能 */
export function DemoBanner() {
  return (
    <div className="demo-banner" role="note">
      <span>
        <b>演示版</b>——数据只保存在当前浏览器，清空浏览数据即消失；AI、云端同步等完整功能请
        <a href="https://loganlink0.github.io/pwork/" target="_blank" rel="noreferrer noopener">下载桌面版体验 →</a>
      </span>
    </div>
  )
}
