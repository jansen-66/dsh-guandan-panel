/**
 * dsh-guandan-panel — Host 半体（最小示例）
 *
 * 演示 dsh 插件 Host 半体骨架：
 *   - ctx.get 可选读取内置服务（connection 等），缺失时降级
 *   - 双形态 RPC 注册：动态 Cordis 包用 harness.handle / 文件态用 connection.rpc.handle
 *   - 统一返回协议：业务层返回 { ok:true, ... } / { ok:false, error }，
 *     出口包成信封 { ok:true, value } / { ok:false, error:{code,message,details} }
 *     （zod 会 strip 非预期字段，故业务字段必须放进 value）
 */
export default function () {
  return {
    apply(ctx, cfg) {
      const connection = ctx.get('connection')

      // 业务层协议
      const ok = (data) => Object.assign({ ok: true }, data === undefined ? {} : data)
      const fail = (error) => ({ ok: false, error: String(error) })
      // 信封（与 client.js 的 unwrapRpc 配对）
      const toEnvelope = (r) => {
        if (r && r.ok) {
          const value = {}
          for (const k of Object.keys(r)) if (k !== 'ok') value[k] = r[k]
          return { ok: true, value }
        }
        return { ok: false, error: { code: 'bad-request', message: String((r && r.error) || 'error'), details: { issues: [] } } }
      }

      // 双形态 RPC 注册
      const dynamicHarness = typeof harness !== 'undefined' ? harness : null
      const rpcHandlers = new Map()
      const registerRpc = (method, fn) => {
        if (dynamicHarness && typeof dynamicHarness.handle === 'function') {
          dynamicHarness.handle(method, async (args) => {
            try { return toEnvelope(await fn(args || {})) } catch (e) { return toEnvelope(fail(e && e.message ? e.message : String(e))) }
          })
          return
        }
        rpcHandlers.set(method, fn)
      }
      if (!dynamicHarness && connection && connection.rpc && typeof connection.rpc.handle === 'function') {
        // register(owner, channel, handler, options) 必须传 { authority: 'loopback' }，否则抛 TypeError
        connection.rpc.handle('/dsh-guandan-panel', async (endpoint, payload) => {
          const fn = rpcHandlers.get(endpoint)
          if (!fn) return toEnvelope(fail('unknown method: ' + endpoint))
          try { return toEnvelope(await fn(payload || {})) } catch (e) { return toEnvelope(fail(e && e.message ? e.message : String(e))) }
        }, { authority: 'loopback' })
      }

      cfg = cfg && typeof cfg === 'object' ? cfg : {}

      // 示例 RPC：greet
      registerRpc('greet', async (args) => {
        const name = (args && args.name) || 'world'
        const greeting = (cfg && cfg.greeting) || 'Hello'
        return ok({ message: `${greeting}, ${name}!` })
      })

      console.log('[guandan-panel] Host 已就绪')
    }
  }
}
