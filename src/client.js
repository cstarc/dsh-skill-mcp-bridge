// dsh-skill-mcp-bridge Client 半部：设置页与工具视图的桥接面板。
// 通过 Typert Remote（remote.skillMcpBridge.*）调用 host 端 status/setEnabled/rescan/reconnectMcp。
import { BRIDGE_INVOCATIONS } from "./shared.js"

const BRIDGE_REMOTE = {
  package: "dsh-skill-mcp-bridge",
  descriptors: BRIDGE_INVOCATIONS,
}

function renderPanel() {
  const [payload, setPayload] = React.useState(null)
  const [loading, setLoading] = React.useState(true)

  const apply = (result) => {
    if (result && result.ok) setPayload(result.value)
    else console.error("skill-mcp-bridge rpc failed", result && result.error)
    setLoading(false)
  }

  React.useEffect(() => {
    let alive = true
    const remote = ctx.reflect.get("remote.skillMcpBridge")
    if (remote === void 0) { setLoading(false); return }
    remote.status().then((result) => {
      if (alive) apply(result)
    }).catch(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [])

  const toggleRoot = (root, next) => {
    setLoading(true)
    ctx.reflect.get("remote.skillMcpBridge").setEnabled({ root, enabled: next }).then(apply).catch(() => setLoading(false))
  }

  const toggleMcp = (name, next) => {
    setLoading(true)
    ctx.reflect.get("remote.skillMcpBridge").setEnabled({ mcp: name, enabled: next }).then(apply).catch(() => setLoading(false))
  }

  const rescan = () => {
    setLoading(true)
    ctx.reflect.get("remote.skillMcpBridge").rescan().then(apply).catch(() => setLoading(false))
  }

  const reconnect = (name) => {
    setLoading(true)
    ctx.reflect.get("remote.skillMcpBridge").reconnectMcp(name ? { name } : {}).then(apply).catch(() => setLoading(false))
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
    const dispose = await ctx.remote.$mount(BRIDGE_REMOTE)
    if (ctx.reflect.get("remote.skillMcpBridge") === void 0) {
      throw new Error("dsh-skill-mcp-bridge: the skillMcpBridge Remote namespace did not mount")
    }
    return () => { void dispose() }
  }, "dsh-skill-mcp-bridge: remote mount")

  ctx.slots.inject("tool.view.cordis", () => ctx.slots.register(
    { name: "tool.view.cordis", key: "self" },
    () => renderPanel()
  ))

  ctx.slots.inject("settings.section", () => ctx.slots.register(
    { name: "settings.section", id: "skill-mcp-bridge", order: 30, label: "项目桥接（Skills + MCP）" },
    () => renderPanel()
  ))
}

const inject = ["remote", "slots"]

export default { apply, inject }
