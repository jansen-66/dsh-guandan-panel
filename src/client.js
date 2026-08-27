/**
 * dsh-guandan-panel — Client 半体（掼蛋游戏底部面板）
 *
 * 功能：掼蛋游戏栏（96px 高的 #game-bar）替代原来的底部面板，作为 DSH 底部面板
 * 常驻显示：占用布局空间（把中间列 centerCol 向上推），不遮左侧栏。
 *
 * 移植方式（与 scripts/build.mjs 配合）：
 *   - build 时把 guandan/app.js 打包为 __guandanAppSrc（尾部自动启动被替换为
 *     window.__GUANDAN_BOOT__），把 guandan/css/style.css 打包为 __guandanCssSrc
 *     （全部选择器已加 .gd-root 前缀，作用域隔离，避免污染宿主页面）；
 *   - 首次打开面板时：注入作用域 CSS → 注入游戏 HTML → 通过 new Function 执行
 *     游戏代码（app.js 是 IIFE，执行时游戏 DOM 必须已就绪）→ 调用
 *     window.__GUANDAN_BOOT__() 完成启动；
 *   - 之后开关面板只是显示 / 隐藏同一份游戏 DOM，保留对局状态。
 *
 * 布局原理：
 *   - 面板本体 position:fixed 盖在视口底缘；
 *   - 同时给中间列（#root > div[data-slot="root"] > div > div:nth-child(2)，centerCol）
 *     设 margin-bottom = 面板高度，中间输出区 + 输入条向上推；
 *   - 面板 left/right 跟随 centerCol（ResizeObserver 监听），绝不盖左侧栏。
 */
export default function () {
  return {
    apply(ctx) {
      const slots = ctx.get('slots')
      if (!slots) return
      // React / createRoot 由 build.mjs 的 bundle factory 注入到闭包（见 scripts/build.mjs）
      if (typeof React === 'undefined' || typeof createRoot === 'undefined') {
        console.error('[guandan-panel] React / createRoot 不可用，插件降级为空')
        return
      }

      // ---- 掼蛋游戏资源（由 build.mjs 注入到 bundle 闭包）----
      const GUANDAN_APP_SRC = typeof __guandanAppSrc === 'string' ? __guandanAppSrc : null
      const GUANDAN_CSS_SRC = typeof __guandanCssSrc === 'string' ? __guandanCssSrc : null
      // 插件版本号（由 build.mjs 从 package.json 读取并注入闭包，改版本号后重新 build 即自动同步）
      const GUANDAN_VERSION = typeof __guandanVersion === 'string' ? __guandanVersion : 'dev'

      // 游戏面板高度：与原版 #game-bar 高度一致
      const PANEL_HEIGHT = 96

      // 游戏面板静态 HTML（对应 guandan/index.html 的 body 内容）
      const GUANDAN_HTML = `
<div id="game-bar">
  <div id="action-bar">
    <button id="btn-pass" class="secondary-btn" disabled>过牌</button>
    <button id="btn-play" class="primary-btn" disabled>出牌</button>
  </div>
  <div id="game-main">
    <div id="main-center">
      <div id="status-row">
        <div id="counts" class="counts"></div>
        <div id="turn-info" class="info-chip">准备中…</div>
        <div id="game-info" class="info-chip">—</div>
        <div class="status-right">
          <span class="shortcut-hint">空格-出牌 C-过牌 N-取消 V-牌桌</span>
          <span class="version-tag" title="掼蛋版本">v${GUANDAN_VERSION}</span>
        </div>
      </div>
      <div id="hand-area">
        <div id="my-hand"></div>
      </div>
    </div>
    <div id="side-bar">
      <button id="btn-new" class="ghost-btn">新局</button>
      <button id="btn-log" class="ghost-btn">日志</button>
      <button id="btn-cancel" class="ghost-btn">取消</button>
    </div>
  </div>
</div>
<div id="tribute-modal" class="modal hidden">
  <div class="modal-box">
    <div id="tribute-content"></div>
  </div>
</div>
<div id="deal-over-modal" class="modal hidden">
  <div class="modal-box" id="deal-over-box"></div>
</div>
<div id="log-panel" class="log-panel hidden">
  <div class="log-head">
    <span>对局日志</span>
    <button id="btn-log-close" class="ghost-btn">关闭</button>
  </div>
  <div id="log-content" class="log-content"></div>
</div>
<div id="table-overlay" class="hidden">
  <div id="table-overlay-body">
    <div id="candidate-panel">
      <div class="candidate-panel-head">
        <span class="candidate-panel-title">组牌列表</span>
        <button id="btn-table-close" class="ghost-btn">关闭</button>
      </div>
      <div id="candidate-list"></div>
    </div>
    <main id="table-panel">
      <div id="pos-teammate" class="player-area pos-top">
        <div class="player-info">
          <span class="player-name">队友</span>
          <span class="card-count">0</span>
        </div>
        <div class="last-play-area"></div>
      </div>
      <div id="middle-row">
        <div id="pos-left" class="player-area pos-left">
          <div class="player-info">
            <span class="player-name">上家</span>
            <span class="card-count">0</span>
          </div>
          <div class="last-play-area"></div>
        </div>
        <div id="play-area">
          <button id="table-turn-info" class="table-turn-btn">准备中…</button>
        </div>
        <div id="pos-right" class="player-area pos-right">
          <div class="player-info">
            <span class="player-name">下家</span>
            <span class="card-count">0</span>
          </div>
          <div class="last-play-area"></div>
        </div>
      </div>
      <div id="my-area">
        <div class="player-info">
          <span class="player-name">自己</span>
          <span class="card-count">0</span>
        </div>
        <div id="my-last-play" class="last-play-area"></div>
      </div>
    </main>
  </div>
</div>
<div id="toast" class="toast hidden"></div>`

      // ---- 面板开合状态 ----
      const createStore = (initial) => {
        let state = initial
        const listeners = new Set()
        return {
          get: () => state,
          set: (updater) => { state = typeof updater === 'function' ? updater(state) : updater; listeners.forEach((l) => l(state)) },
          subscribe: (l) => { listeners.add(l); return () => listeners.delete(l) }
        }
      }
      const store = createStore({ gameOpen: false })

      // 找中间列（centerCol）：DSH AppFrame 三列网格 sidebarCol / centerCol / detailsCol。
      // 多候选选择器兜底：优先精确路径，失败时放宽，避免结构版本差异导致找不到。
      const findCenterCol = () => {
        const candidates = [
          '#root > div[data-slot="root"] > div > div:nth-child(2)',
          '#root [data-slot="root"] > div > div:nth-child(2)',
          '#root > div > div > div:nth-child(2)'
        ]
        for (const sel of candidates) {
          const el = document.querySelector(sel)
          if (el && el.tagName === 'DIV' && el.children.length > 0) return el
        }
        return null
      }

      // 把面板几何应用到布局：底部面板推 centerCol 的 margin-bottom。
      // 面板自身的 left/right 由 GameBar 组件在渲染完成后自行同步（见组件内 effect），
      // 因为本函数是 store 同步订阅者，执行时机早于 React 渲染，此时面板 DOM 尚未挂载。
      const applyPush = (s) => {
        const center = findCenterCol()
        if (center) center.style.marginBottom = s.gameOpen ? PANEL_HEIGHT + 'px' : '0px'
      }
      store.subscribe(applyPush)
      applyPush(store.get())

      // ---- 样式注入（tagName 用于去重标记，游戏 CSS 单独一个标记）----
      const injectCss = (css, tagName) => {
        if (typeof styles !== 'undefined' && styles && typeof styles.insert === 'function') return styles.insert(css)
        if (typeof document === 'undefined') return () => {}
        if (document.querySelector(`style[data-plugin-css="${tagName}"]`)) return () => {}
        const tag = document.createElement('style')
        tag.dataset.plugin = 'guandan-panel'
        tag.dataset.pluginCss = tagName
        tag.textContent = css
        document.head.appendChild(tag)
        return () => { if (tag.parentNode) tag.parentNode.removeChild(tag) }
      }
      injectCss(`
/* 固定底部面板：盖在中间列让出的底部空白上，视觉即「向上推工作区」。
   left/right 由组件内 effect 内联写入（跟随 centerCol，不盖左侧栏），此处仅兜底。 */
.hp-bottom { position: fixed; left: 0; right: 0; bottom: 0; z-index: 49;
  height: ${PANEL_HEIGHT}px; box-sizing: border-box;
  display: flex; flex-direction: column;
  background: var(--dsw-specific-sidebar-fill, var(--dsw-alias-bg-overlay, #fff));
  border-top: 1px solid var(--dsw-alias-border-l2, rgba(0,0,0,.2));
  color: var(--dsw-alias-label-primary, #222);
  font: 13px/1.5 system-ui, sans-serif;
  box-shadow: none; }
/* 游戏根节点填满面板；作用域化 CSS（.gd-root xxx）即由此元素承接 */
/* 覆盖 scopeCss 将 body { overflow: hidden } 转为 .gd-root { overflow: hidden } 导致的截断问题 */
.hp-bottom .gd-root { height: 100%; width: 100%; min-height: 0; overflow: visible; }
/* 本局结束横幅：原为 fixed 全屏（left/right:0），改为相对 .hp-bottom（position:fixed
   即 positioned ancestor）定位，宽度自适应 = 跟随底部面板（中间列），不再盖左侧栏 */
.hp-bottom .gd-root #deal-over-modal.modal:not(.hidden) {
  position: absolute;
  inset: auto 0 0 0;
  height: 96px;
}
/* 牌桌浮层：原为 fixed 全屏（会盖左侧栏），改为相对底部面板 absolute 定位，
   宽度跟随面板（中间列，不盖左侧栏），内容贴面板顶边向上展开，露出游戏栏 */
.hp-bottom .gd-root #table-overlay {
  position: absolute;
  top: auto;
  left: 0;
  right: 0;
  bottom: 96px;
  max-height: calc(100dvh - 96px - 12px);
  overflow: hidden;
}
/* 侧栏底部按钮 */
.hp-sidebar-toggle { display: flex; align-items: center; gap: 6px; background: none; border: none;
  color: var(--dsw-alias-label-secondary); cursor: pointer; font-size: 13px; padding: 5px 8px; border-radius: 6px; }
.hp-sidebar-toggle:hover { background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-primary); }
`, 'guandan-panel')

      // ---- 游戏启动（面板常驻，DOM 只注入一次；开局只触发一次）----
      let guandanInited = false // HTML 已注入 + app.js 已执行
      let guandanBooted = false // 已开局
      const overlayRef = { body: null }

      // 跟随 DSH 主题：DSH 在 <body> 上切换 data-ds-dark-theme 标识深浅色（配合 --dsw-* 变量）。
      // 游戏 CSS 经 scopeCss 作用域化后由 .gd-root[data-theme="dark"] 控制深色变量，
      // 故把 DSH 的标识同步到游戏根节点即可，无需游戏自己维护主题。
      let themeObserver = null
      const syncGuandanTheme = () => {
        if (!overlayRef.body) return
        const dark = document.body.hasAttribute('data-ds-dark-theme')
        overlayRef.body.setAttribute('data-theme', dark ? 'dark' : 'light')
      }

      const ensureGuandan = () => {
        if (guandanInited) return true
        if (!GUANDAN_APP_SRC || !GUANDAN_CSS_SRC || !overlayRef.body) {
          console.error('[guandan-panel] 掼蛋资源缺失，无法启动')
          return false
        }
        try {
          injectCss(GUANDAN_CSS_SRC, 'guandan')
          // 注入点自身就是 .gd-root（承接作用域化 CSS 选择器），游戏 DOM 直接放进来。
          // 组件常驻：面板关闭只是 display:none，此 DOM 不卸载，UI 缓存的节点引用始终有效。
          overlayRef.body.innerHTML = GUANDAN_HTML
          // app.js 是 IIFE：执行时游戏 DOM 必须已就绪（UI 构造会读取 DOM）
          const fn = new Function(GUANDAN_APP_SRC)
          fn()
          guandanInited = true
          // 游戏注入后立即同步一次 DSH 主题，并监听 body 的 data-ds-dark-theme 变化
          syncGuandanTheme()
          if (!themeObserver) {
            themeObserver = new MutationObserver(syncGuandanTheme)
            themeObserver.observe(document.body, { attributes: true, attributeFilter: ['data-ds-dark-theme'] })
          }
          return true
        } catch (e) {
          console.error('[guandan-panel] 掼蛋启动失败:', e)
          return false
        }
      }

      const bootGuandan = () => {
        if (!ensureGuandan() || guandanBooted) return
        try {
          if (typeof window.__GUANDAN_BOOT__ === 'function') {
            window.__GUANDAN_BOOT__()
            delete window.__GUANDAN_BOOT__
          }
          guandanBooted = true
        } catch (e) {
          console.error('[guandan-panel] 掼蛋开局失败:', e)
        }
      }

      // ---- 游戏底部面板组件（常驻：关闭仅 CSS 隐藏，保留游戏 DOM 与对局状态）----
      const GameBar = () => {
        const [open, setOpen] = React.useState(store.get().gameOpen)
        React.useEffect(() => store.subscribe((s) => setOpen(s.gameOpen)), [])
        const panelRef = React.useRef(null)
        const bodyRef = React.useRef(null)

        // 挂载即注入游戏 DOM（组件常驻，不随开合卸载/重建）
        React.useEffect(() => {
          overlayRef.body = bodyRef.current
          ensureGuandan()
        }, [])

        // 首次打开时开局
        React.useEffect(() => {
          if (open) bootGuandan()
        }, [open])

        // 空格键：联动牌桌中央 #table-turn-info（轮到自己时出牌/过牌，牌局结束时进下一副）。
        // 贡牌弹窗显示时，空格键确认贡牌。
        // 仅游戏栏打开时监听；输入框聚焦时不拦截，并阻止空格滚动页面。
        React.useEffect(() => {
          if (!open) return
          const onKey = (e) => {
            const t = e.target
            if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return
            let btn = null
            if (e.code === 'Space' || e.key === ' ') {
              // 贡牌弹窗显示时，空格键确认贡牌
              const tributeModal = document.getElementById('tribute-modal')
              if (tributeModal && !tributeModal.classList.contains('hidden')) {
                btn = document.getElementById('tribute-ok')
              } else {
                btn = document.getElementById('table-turn-info')
              }
            } else if (e.key === 'c' || e.key === 'C') {
              btn = document.getElementById('btn-pass')
            } else if (e.key === 'n' || e.key === 'N') {
              btn = document.getElementById('btn-cancel')
            } else if (e.key === 'v' || e.key === 'V') {
              // 游戏栏无独立牌桌按钮，靠点击游戏栏空白区切换牌桌浮层（走已有 toggle 逻辑）
              btn = document.getElementById('game-bar')
            }
            if (!btn) return
            e.preventDefault()
            btn.click()
          }
          window.addEventListener('keydown', onKey)
          return () => window.removeEventListener('keydown', onKey)
        }, [open])

        // 渲染完成后同步自身几何：left/right 跟随中间列 centerCol，
        // 只覆盖中间区域、绝不盖左侧栏。通过 ResizeObserver 监听中间列几何变化，
        // 这样侧栏（slots）收起/展开导致中间列 left/right 变化时，面板会同步跟随。
        React.useEffect(() => {
          const sync = () => {
            const el = panelRef.current
            if (!el) return
            const center = findCenterCol()
            if (!center) {
              // 找不到中间列时宁可隐藏，也不全宽盖住左侧栏
              el.style.display = 'none'
              return
            }
            // 面板由 React 的 style 控制隐藏（display:none），这里不覆盖
            if (!open) return
            el.style.display = ''
            const r = center.getBoundingClientRect()
            el.style.left = r.left + 'px'
            el.style.right = (window.innerWidth - r.right) + 'px'
          }
          sync()
          const ro = new ResizeObserver(sync)
          const center = findCenterCol()
          if (center) ro.observe(center)
          window.addEventListener('resize', sync)
          return () => { ro.disconnect(); window.removeEventListener('resize', sync) }
        }, [open])

        // 关闭时仅隐藏（display:none），DOM 与游戏状态常驻
        return React.createElement('div', { className: 'hp-bottom', ref: panelRef, style: open ? {} : { display: 'none' } },
          React.createElement('div', { className: 'gd-root', ref: bodyRef }))
      }

      // ---- 挂载根（自建，面板不依赖宿主布局）----
      const host = document.createElement('div')
      host.setAttribute('data-guandan-panel', '')
      document.body.appendChild(host)
      const root = createRoot(host)
      root.render(React.createElement(GameBar))
      if (typeof ctx.effect === 'function') {
        ctx.effect(() => () => {
          if (themeObserver) { themeObserver.disconnect(); themeObserver = null }
          root.unmount()
          host.remove()
          const center = findCenterCol()
          if (center) center.style.marginBottom = '0px'
        })
      }

      // ---- 侧栏底部按钮：游戏（图标 + 文字）----
      slots.inject('sidebar.footer.action', () => slots.register(
        { name: 'sidebar.footer.action', id: 'guandan-panel-toggle', order: 0, label: () => '游戏' },
        (props) => React.createElement('button', {
          className: 'hp-sidebar-toggle', title: 'guandan',
          onClick: () => store.set((s) => ({ ...s, gameOpen: !s.gameOpen }))
        }, '♥️', props && props.wide ? React.createElement('span', null, '掼蛋游戏') : null)
      ))

      console.log('[guandan-panel] Client 已就绪（掼蛋游戏底部面板）')
    }
  }
}
