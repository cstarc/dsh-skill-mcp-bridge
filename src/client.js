// dsh-skill-mcp-bridge Client 半部：设置页与工具视图的桥接面板。
// 通过 Typert Remote（remote.skillMcpBridge.*）调用 host 端 status/setEnabled/rescan/reconnectMcp。
// React 通过 __ModuleLoader__ 的 require("react") 由 web 平台解析（非全局变量）。
import React from "react"
import { BRIDGE_INVOCATIONS } from "./shared.js"

const BRIDGE_REMOTE = {
  package: "dsh-skill-mcp-bridge",
  descriptors: BRIDGE_INVOCATIONS,
}

// ErrorBoundary：面板内部任何异常只显示错误卡片，绝不拖垮设置页/工具视图。
class PanelBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { error: undefined }
  }
  static getDerivedStateFromError(error) {
    return { error: String(error && error.message ? error.message : error) }
  }
  componentDidCatch(error, info) {
    console.error("skill-mcp-bridge panel error:", error, info)
  }
  render() {
    if (this.state.error !== undefined) {
      return React.createElement("div", { style: { border: "1px solid #f0c0c0", borderRadius: 8, padding: "10px 12px", background: "#fff5f5", fontFamily: "inherit", fontSize: 13 } },
        "项目桥接面板渲染失败：", React.createElement("code", null, this.state.error),
        React.createElement("div", { style: { fontSize: 11, color: "#999", marginTop: 6 } }, "请刷新页面重试；若持续出现，查看浏览器控制台与 <工作区>/.claude/bridge-diag.log。")
      )
    }
    return this.props.children
  }
}

function safeRemote() {
  try {
    const r = ctx.reflect.get("remote.skillMcpBridge")
    return r === undefined || r === null ? undefined : r
  } catch (e) {
    console.error("skill-mcp-bridge remote unavailable:", e)
    return undefined
  }
}

function renderPanel() {
  const [payload, setPayload] = React.useState(null)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState(null)

  const apply = (result) => {
    if (result && result.ok) {
      setError(null)
      setPayload(result.value)
    } else {
      const msg = (result && result.error) || "未知 RPC 错误"
      setError(typeof msg === "string" ? msg : JSON.stringify(msg))
      console.error("skill-mcp-bridge rpc failed", result && result.error)
    }
    setLoading(false)
  }

  React.useEffect(() => {
    let alive = true
    try {
      const remote = safeRemote()
      if (remote === undefined) {
        setError("桥接通道未就绪：remote.skillMcpBridge 未挂载（host 端 typert 端点可能未注册）")
        setLoading(false)
        return
      }
      remote.status().then((result) => {
        if (alive) apply(result)
      }).catch((e) => { if (alive) { setError(String((e && e.message) || e)); setLoading(false) } })
    } catch (e) {
      if (alive) setLoading(false)
    }
    return () => { alive = false }
  }, [])

  const toggleRoot = (root, next) => {
    setLoading(true)
    try {
      const r = safeRemote()
      if (r === undefined) { setLoading(false); return }
      r.setEnabled({ root, enabled: next }).then(apply).catch((e) => { setError(String((e && e.message) || e)); setLoading(false) })
    } catch (e) { setLoading(false) }
  }

  const toggleMcp = (name, next) => {
    setLoading(true)
    try {
      const r = safeRemote()
      if (r === undefined) { setLoading(false); return }
      r.setEnabled({ mcp: name, enabled: next }).then(apply).catch((e) => { setError(String((e && e.message) || e)); setLoading(false) })
    } catch (e) { setLoading(false) }
  }

  const rescan = () => {
    setLoading(true)
    try {
      const r = safeRemote()
      if (r === undefined) { setLoading(false); return }
      r.rescan().then(apply).catch((e) => { setError(String((e && e.message) || e)); setLoading(false) })
    } catch (e) { setLoading(false) }
  }

  const reconnect = (name) => {
    setLoading(true)
    try {
      const r = safeRemote()
      if (r === undefined) { setLoading(false); return }
      r.reconnectMcp(name ? { name } : {}).then(apply).catch((e) => { setError(String((e && e.message) || e)); setLoading(false) })
    } catch (e) { setLoading(false) }
  }

  const roots = (payload && payload.roots) || []
  const mcp = (payload && payload.mcp) || []
  const total = roots.reduce((sum, r) => sum + (r.count || 0), 0)
  const userOnly = [].concat.apply([], roots.map((r) => (r.skills || []).filter((s) => s.userOnly)))

  const card = { border: "1px solid #d9d9d9", borderRadius: 8, padding: "10px 12px", background: "#fafafa", fontFamily: "inherit" }
  const title = { fontWeight: 600, fontSize: 13, marginBottom: 8 }
  const section = { fontWeight: 600, fontSize: 12, margin: "10px 0 4px", color: "#555" }
  const row = { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid #eee" }
  const name = { fontSize: 13, display: "inline-flex", alignItems: "center" }
  const count = { fontSize: 12, color: "#666", marginLeft: 8 }
  const list = { margin: "4px 0 0", paddingLeft: 18, fontSize: 12, color: "#444" }
  const tip = { fontSize: 11, color: "#999", marginTop: 8 }
  const btn = { fontSize: 12, cursor: "pointer", marginRight: 8 }
  const hint = { fontSize: 11, color: "#8a6d1a", background: "#fff8e1", border: "1px solid #ffe082", borderRadius: 4, padding: "4px 6px", marginTop: 8, lineHeight: 1.5 }
  const badge = { marginLeft: 6, fontSize: 11, color: "#8a6d1a", background: "#fff8e1", borderRadius: 3, padding: "0 3px" }
  const code = { background: "#eee", borderRadius: 4, padding: "0 4px", marginRight: 6 }

  const statusText = (s) => {
    if (s.status === "connected") return React.createElement("span", { style: { color: "#1a7f37", fontSize: 12 } }, "已连接 " + (s.toolCount || 0) + " 工具")
    if (s.status === "error") return React.createElement("span", { style: { color: "#c62828", fontSize: 12 } }, "错误")
    if (s.status === "off") return React.createElement("span", { style: { color: "#999", fontSize: 12 } }, "已关闭")
    return React.createElement("span", { style: { color: "#999", fontSize: 12 } }, "未连接")
  }

  const kindBadge = (k) => {
    if (k === "agent") return React.createElement("span", { style: { ...badge, background: "#e3f2fd", color: "#1565c0", border: "none" } }, "agent")
    if (k === "command") return React.createElement("span", { style: { ...badge, background: "#f3e5f5", color: "#6a1b9a", border: "none" } }, "command")
    return null
  }

  return React.createElement("div", { style: card },
    React.createElement("div", { style: title }, "项目桥接（skills + MCP）" + (loading ? "（同步中…）" : "")),

    error ? React.createElement("div", { style: { border: "1px solid #f0c0c0", borderRadius: 6, padding: "8px 10px", background: "#fff5f5", fontFamily: "inherit", fontSize: 12, marginBottom: 8, whiteSpace: "pre-wrap", wordBreak: "break-all" } },
      "⚠ ",
      error,
      React.createElement("button", { onClick: () => { setError(null); setLoading(true); try { const r = safeRemote(); if (r === undefined) { setError("桥接通道未就绪：remote.skillMcpBridge 未挂载"); setLoading(false); return } r.status().then(apply).catch((e2) => { setError(String((e2 && e2.message) || e2)); setLoading(false) }) } catch (e3) { setError(String(e3)); setLoading(false) } }, style: { marginLeft: 8, fontSize: 12, cursor: "pointer" } }, "重试")
    ) : null,

    React.createElement("div", { style: section }, "技能导入"),
    roots.map((r) => React.createElement("div", { key: r.key, style: row },
      React.createElement("label", { style: { display: "inline-flex", alignItems: "center", cursor: "pointer" } },
        React.createElement("input", { type: "checkbox", checked: !!r.enabled, disabled: loading, onChange: (e) => toggleRoot(r.key, e.target.checked) }),
        React.createElement("span", { style: name },
          React.createElement("code", { style: code }, r.label),
          r.enabled
            ? React.createElement("span", { style: count }, "已导入 " + r.count + " 个")
            : React.createElement("span", { style: { ...count, color: "#999" } }, "已关闭")
        )
      ),
      React.createElement("details", { style: { fontSize: 12 } },
        React.createElement("summary", { style: { cursor: "pointer", color: "#666" } }, "详情"),
        React.createElement("ul", { style: list },
          (r.skills || []).map((s) => React.createElement("li", { key: s.name },
            React.createElement("code", null, s.name),
            kindBadge(s.kind),
            React.createElement("span", { style: { marginLeft: 6 } }, s.description),
            s.userOnly
              ? React.createElement("span", { style: { ...badge, background: "#fff8e1", border: "none" } }, "仅 /" + s.name + " 调用")
              : null
          ))
        )
      )
    )),
    userOnly.length > 0
      ? React.createElement("div", { style: hint },
          "其中 " + userOnly.length + " 个技能带 disable-model-invocation，模型不会自动触发；在输入框发送 /技能名 即可手动调用（如 /" + userOnly[0].name + "）。")
      : null,

    React.createElement("div", { style: section }, "MCP 服务器"),
    mcp.length === 0
      ? React.createElement("div", { style: tip }, "未发现 MCP 配置（.mcp.json / .trae/mcp.json / .claude/settings.json）")
      : mcp.map((s) => React.createElement("div", { key: s.name, style: row },
          React.createElement("label", { style: { display: "inline-flex", alignItems: "center", cursor: "pointer" } },
            React.createElement("input", { type: "checkbox", checked: !!s.enabled, disabled: loading, onChange: (e) => toggleMcp(s.name, e.target.checked) }),
            React.createElement("span", { style: name },
              React.createElement("code", { style: code }, s.name),
              React.createElement("span", { style: { ...count, color: "#888" } }, s.transport === "http" ? "HTTP" : "stdio"),
              statusText(s)
            )
          ),
          s.status === "error"
            ? React.createElement("span", { style: { fontSize: 12, color: "#c62828" } },
                React.createElement("span", null, (s.error || "").slice(0, 40)),
                React.createElement("button", { onClick: () => reconnect(s.name), disabled: loading, style: btn }, "重连")
              )
            : React.createElement("button", { onClick: () => reconnect(s.name), disabled: loading, style: btn }, "重连")
        )),
    mcp.length > 0
      ? React.createElement("div", { style: { marginTop: 6 } },
          React.createElement("button", { onClick: () => reconnect(undefined), disabled: loading, style: btn }, "全部重连"))
      : null,

    React.createElement("div", { style: { marginTop: 10 } },
      React.createElement("button", { onClick: rescan, disabled: loading, style: btn }, "重新扫描技能"),
      React.createElement("span", { style: tip }, "共 " + total + " 个技能 · 自动监听中 · 状态持久化于 <工作区>/.claude/skills-state.json")
    )
  )
}

function apply(ctx) {
  ctx.effect(async () => {
    try {
      const dispose = await ctx.remote.$mount(BRIDGE_REMOTE)
      if (ctx.reflect.get("remote.skillMcpBridge") === void 0) {
        console.error("dsh-skill-mcp-bridge: the skillMcpBridge Remote namespace did not mount")
      }
      return () => { void dispose() }
    } catch (e) {
      console.error("dsh-skill-mcp-bridge: remote mount failed:", e)
      return () => { /* 挂载失败：面板将显示不可用提示 */ }
    }
  }, "dsh-skill-mcp-bridge: remote mount")

  ctx.slots.inject("tool.view.cordis", () => ctx.slots.register(
    { name: "tool.view.cordis", key: "self" },
    () => React.createElement(PanelBoundary, null, renderPanel())
  ))

  ctx.slots.inject("settings.section", () => ctx.slots.register(
    { name: "settings.section", id: "skill-mcp-bridge", order: 30, label: "项目桥接（Skills + MCP）" },
    () => React.createElement(PanelBoundary, null, renderPanel())
  ))
}

const inject = ["remote", "slots"]

export { apply, inject }
