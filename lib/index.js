// 由 scripts/build.mjs 生成，请勿手改；源文件：src/host.js
import hostFactory from './host.js'

const name = 'guandan-panel'
const inject = ['fs', 'subprocess', 'connection']

function apply(ctx, cfg) {
  return hostFactory().apply(ctx, cfg)
}

export default { name, inject, apply }
