/**
 * 文件形态入口：Host 半体（npm 包默认导出 Cordis 插件）。
 * Client 半体经 package.json 的 dsh.client 声明由 `./client` 子路径导出。
 */
export { default } from './host.js'
