/**
 * dsh-guandan-panel 构建脚本：把 src/ 打包成 DSH 文件态（web profile）可装载的产物。
 *
 * 产出（lib/）：
 *   - index.js  文件态 host 入口：对象形态插件（loader 直接支持），内部委托 src/host.js
 *   - host.js   src/host.js 原样复制（供 index.js import）
 *   - client.js 浏览器半体 bundle：window.__ModuleLoader__.load({id, factory}) 格式
 *
 * 零第三方依赖；client 半体是纯 JS + React.createElement（React 由 bundle 的 require("react") 绑定）。
 */
import { readFileSync, writeFileSync, mkdirSync, rmSync, copyFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const LIB = join(ROOT, 'lib')
const PKG_ID = '@jansen-66/dsh-guandan-panel'

/**
 * 掼蛋游戏资源打包：
 *   - guandan/app.js  → 替换尾部自动启动为暴露 window.__GUANDAN_BOOT__（由 client 在游戏 DOM 就绪后调用）
 *   - guandan/css/style.css → 全部选择器加 .gd-root 前缀（作用域隔离，避免污染宿主页面）
 */
const GUANDAN_DIR = join(ROOT, 'guandan')
const guandanApp = readFileSync(join(GUANDAN_DIR, 'app.js'), 'utf8')
const bootRe = /\r?\n\s*subscribeEvents\(\);\r?\n\s*startGame\(true\);\r?\n\}\)\(\);\s*$/
if (!bootRe.test(guandanApp)) {
  throw new Error('guandan/app.js 尾部结构不符合预期，无法注入启动钩子（期望以 subscribeEvents(); startGame(true); })(); 结尾）')
}
const guandanBootSrc = guandanApp.replace(
  bootRe,
  '\n  window.__GUANDAN_BOOT__ = function () { subscribeEvents(); startGame(true); };\n})();'
)
const scopeCss = (css, rootClass) => css.split('\n').map((line) => {
  const brace = line.indexOf('{')
  if (brace < 0) return line
  const selPart = line.slice(0, brace).trim()
  if (!selPart) return line
  const rest = line.slice(brace)
  if (selPart === ':root') return `.${rootClass} ${rest}`
  // 主题切换用的 :root[data-theme="dark"] → .gd-root[data-theme="dark"]（命中游戏根元素自身）
  const rootAttr = selPart.match(/^:root((?:\[[^\]]*\])+)$/)
  if (rootAttr) return `.${rootClass}${rootAttr[1]} ${rest}`
  const scoped = selPart.split(',').map((t) => {
    t = t.trim()
    if (!t) return t
    if (t === 'html' || t === 'body') return `.${rootClass}`
    return `.${rootClass} ${t}`
  }).join(', ')
  return `${scoped} ${rest}`
}).join('\n')
const guandanCss = scopeCss(readFileSync(join(GUANDAN_DIR, 'css', 'style.css'), 'utf8'), 'gd-root')

/** 取 client 源码中 `export default function () {` 起的完整函数体（含两端大括号）。 */
function clientFunctionBody(src) {
  const marker = 'export default function () {'
  const start = src.indexOf(marker)
  if (start < 0) throw new Error('client.js 缺少 "export default function () {"')
  const body = src.slice(start + marker.length - 1)
  const end = body.lastIndexOf('}')
  if (end < 0) throw new Error('client.js 缺少函数结尾 "}"')
  const tail = body.slice(end + 1)
  const tailOk = tail.split('\n').every((l) => l.trim() === '' || l.trim().startsWith('//'))
  if (!tailOk) throw new Error('client.js 函数结束后仍有未预期内容: ' + tail.trim().slice(0, 80))
  return body.slice(0, end + 1)
}

// ---- 清理并重建 lib ----
rmSync(LIB, { recursive: true, force: true })
mkdirSync(LIB, { recursive: true })

// ---- 1) host 半体原样复制 ----
copyFileSync(join(ROOT, 'src', 'host.js'), join(LIB, 'host.js'))

// ---- 2) lib/index.js：文件态 host 入口（对象形态插件）----
const indexJs = `// 由 scripts/build.mjs 生成，请勿手改；源文件：src/host.js
import hostFactory from './host.js'

const name = 'guandan-panel'
const inject = ['fs', 'subprocess', 'connection']

function apply(ctx, cfg) {
  return hostFactory().apply(ctx, cfg)
}

export default { name, inject, apply }
`
writeFileSync(join(LIB, 'index.js'), indexJs)

// ---- 3) lib/client.js：浏览器半体（ModuleLoader bundle 格式）----
const clientSrc = readFileSync(join(ROOT, 'src', 'client.js'), 'utf8')
const body = clientFunctionBody(clientSrc)
const clientBundle = `window.__ModuleLoader__.load({
\tid: ${JSON.stringify(PKG_ID)},
\tfactory: (require) => {
\t\tvar module = { exports: {} };
\t\tvar exports = module.exports;
\t\tObject.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
\t\tvar React = require("react");
\t\tif (React && React.__esModule && React.default) React = React.default;
\t\tvar __reactDomClient = require("react-dom/client");
\t\tvar createRoot = __reactDomClient && typeof __reactDomClient.createRoot === "function"
\t\t\t? __reactDomClient.createRoot.bind(__reactDomClient)
\t\t\t: undefined;
\t\tvar __guandanAppSrc = ${JSON.stringify(guandanBootSrc)};\n\t\tvar __guandanCssSrc = ${JSON.stringify(guandanCss)};\n\t\tvar __helloPanelPlugin = (function () ${body})();
\t\texports.apply = __helloPanelPlugin.apply;
\t\t// inject 声明是 cordis 的等待清单：fiber 会等服务激活后才执行 apply。
\t\texports.inject = ["slots", "connection"];
\t\treturn module.exports;
\t}
});
`
writeFileSync(join(LIB, 'client.js'), clientBundle)

console.log('[guandan-panel] build 完成 → lib/index.js, lib/host.js, lib/client.js')
