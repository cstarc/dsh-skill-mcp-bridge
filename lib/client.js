window.__ModuleLoader__.load({ id: 'dsh-skill-mcp-bridge', factory: (require) => { var module = { exports: {} }; var exports = module.exports; Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/client.js
var client_exports = {};
__export(client_exports, {
  apply: () => apply,
  inject: () => inject
});
module.exports = __toCommonJS(client_exports);

// src/shared.js
var BRIDGE_INVOCATIONS = [
  {
    id: "dsh-skill-mcp-bridge#bridge/status",
    service: "skillMcpBridge",
    namespace: "skillMcpBridge",
    method: "status",
    invocation: { kind: "direct" },
    parameters: [],
    result: { mode: "src-json" }
  },
  {
    id: "dsh-skill-mcp-bridge#bridge/setEnabled",
    service: "skillMcpBridge",
    namespace: "skillMcpBridge",
    method: "setEnabled",
    invocation: { kind: "direct" },
    parameters: [
      {
        name: "request",
        wire: "request",
        source: "json",
        codec: { mode: "src-json" }
      }
    ],
    result: { mode: "src-json" }
  },
  {
    id: "dsh-skill-mcp-bridge#bridge/rescan",
    service: "skillMcpBridge",
    namespace: "skillMcpBridge",
    method: "rescan",
    invocation: { kind: "direct" },
    parameters: [],
    result: { mode: "src-json" }
  },
  {
    id: "dsh-skill-mcp-bridge#bridge/reconnectMcp",
    service: "skillMcpBridge",
    namespace: "skillMcpBridge",
    method: "reconnectMcp",
    invocation: { kind: "direct" },
    parameters: [
      {
        name: "request",
        wire: "request",
        source: "json",
        codec: { mode: "src-json" }
      }
    ],
    result: { mode: "src-json" }
  }
];

// src/client.js
var BRIDGE_REMOTE = {
  package: "dsh-skill-mcp-bridge",
  descriptors: BRIDGE_INVOCATIONS
};
function renderPanel() {
  const [payload, setPayload] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const apply2 = (result) => {
    if (result && result.ok) setPayload(result.value);
    else console.error("skill-mcp-bridge rpc failed", result && result.error);
    setLoading(false);
  };
  React.useEffect(() => {
    let alive = true;
    const remote = ctx.reflect.get("remote.skillMcpBridge");
    if (remote === void 0) {
      setLoading(false);
      return;
    }
    remote.status().then((result) => {
      if (alive) apply2(result);
    }).catch(() => {
      if (alive) setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, []);
  const toggleRoot = (root, next) => {
    setLoading(true);
    ctx.reflect.get("remote.skillMcpBridge").setEnabled({ root, enabled: next }).then(apply2).catch(() => setLoading(false));
  };
  const toggleMcp = (name2, next) => {
    setLoading(true);
    ctx.reflect.get("remote.skillMcpBridge").setEnabled({ mcp: name2, enabled: next }).then(apply2).catch(() => setLoading(false));
  };
  const rescan = () => {
    setLoading(true);
    ctx.reflect.get("remote.skillMcpBridge").rescan().then(apply2).catch(() => setLoading(false));
  };
  const reconnect = (name2) => {
    setLoading(true);
    ctx.reflect.get("remote.skillMcpBridge").reconnectMcp(name2 ? { name: name2 } : {}).then(apply2).catch(() => setLoading(false));
  };
  const roots = payload && payload.roots || [];
  const mcp = payload && payload.mcp || [];
  const total = roots.reduce((sum, r) => sum + (r.count || 0), 0);
  const userOnly = [].concat.apply([], roots.map((r) => (r.skills || []).filter((s) => s.userOnly)));
  const card = { border: "1px solid #d9d9d9", borderRadius: 8, padding: "10px 12px", background: "#fafafa", fontFamily: "inherit" };
  const title = { fontWeight: 600, fontSize: 13, marginBottom: 8 };
  const section = { fontWeight: 600, fontSize: 12, margin: "10px 0 4px", color: "#555" };
  const row = { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid #eee" };
  const name = { fontSize: 13, display: "inline-flex", alignItems: "center" };
  const count = { fontSize: 12, color: "#666", marginLeft: 8 };
  const list = { margin: "4px 0 0", paddingLeft: 18, fontSize: 12, color: "#444" };
  const tip = { fontSize: 11, color: "#999", marginTop: 8 };
  const btn = { fontSize: 12, cursor: "pointer", marginRight: 8 };
  const hint = { fontSize: 11, color: "#8a6d1a", background: "#fff8e1", border: "1px solid #ffe082", borderRadius: 4, padding: "4px 6px", marginTop: 8, lineHeight: 1.5 };
  const badge = { marginLeft: 6, fontSize: 11, color: "#8a6d1a", background: "#fff8e1", borderRadius: 3, padding: "0 3px" };
  const code = { background: "#eee", borderRadius: 4, padding: "0 4px", marginRight: 6 };
  const statusText = (s) => {
    if (s.status === "connected") return React.createElement("span", { style: { color: "#1a7f37", fontSize: 12 } }, "\u5DF2\u8FDE\u63A5 " + (s.toolCount || 0) + " \u5DE5\u5177");
    if (s.status === "error") return React.createElement("span", { style: { color: "#c62828", fontSize: 12 } }, "\u9519\u8BEF");
    if (s.status === "off") return React.createElement("span", { style: { color: "#999", fontSize: 12 } }, "\u5DF2\u5173\u95ED");
    return React.createElement("span", { style: { color: "#999", fontSize: 12 } }, "\u672A\u8FDE\u63A5");
  };
  const kindBadge = (k) => {
    if (k === "agent") return React.createElement("span", { style: { ...badge, background: "#e3f2fd", color: "#1565c0", border: "none" } }, "agent");
    if (k === "command") return React.createElement("span", { style: { ...badge, background: "#f3e5f5", color: "#6a1b9a", border: "none" } }, "command");
    return null;
  };
  return React.createElement(
    "div",
    { style: card },
    React.createElement("div", { style: title }, "\u9879\u76EE\u6865\u63A5\uFF08skills + MCP\uFF09" + (loading ? "\uFF08\u540C\u6B65\u4E2D\u2026\uFF09" : "")),
    React.createElement("div", { style: section }, "\u6280\u80FD\u5BFC\u5165"),
    roots.map((r) => React.createElement(
      "div",
      { key: r.key, style: row },
      React.createElement(
        "label",
        { style: { display: "inline-flex", alignItems: "center", cursor: "pointer" } },
        React.createElement("input", { type: "checkbox", checked: !!r.enabled, disabled: loading, onChange: (e) => toggleRoot(r.key, e.target.checked) }),
        React.createElement(
          "span",
          { style: name },
          React.createElement("code", { style: code }, r.label),
          r.enabled ? React.createElement("span", { style: count }, "\u5DF2\u5BFC\u5165 " + r.count + " \u4E2A") : React.createElement("span", { style: { ...count, color: "#999" } }, "\u5DF2\u5173\u95ED")
        )
      ),
      React.createElement(
        "details",
        { style: { fontSize: 12 } },
        React.createElement("summary", { style: { cursor: "pointer", color: "#666" } }, "\u8BE6\u60C5"),
        React.createElement(
          "ul",
          { style: list },
          (r.skills || []).map((s) => React.createElement(
            "li",
            { key: s.name },
            React.createElement("code", null, s.name),
            kindBadge(s.kind),
            React.createElement("span", { style: { marginLeft: 6 } }, s.description),
            s.userOnly ? React.createElement("span", { style: { ...badge, background: "#fff8e1", border: "none" } }, "\u4EC5 /" + s.name + " \u8C03\u7528") : null
          ))
        )
      )
    )),
    userOnly.length > 0 ? React.createElement(
      "div",
      { style: hint },
      "\u5176\u4E2D " + userOnly.length + " \u4E2A\u6280\u80FD\u5E26 disable-model-invocation\uFF0C\u6A21\u578B\u4E0D\u4F1A\u81EA\u52A8\u89E6\u53D1\uFF1B\u5728\u8F93\u5165\u6846\u53D1\u9001 /\u6280\u80FD\u540D \u5373\u53EF\u624B\u52A8\u8C03\u7528\uFF08\u5982 /" + userOnly[0].name + "\uFF09\u3002"
    ) : null,
    React.createElement("div", { style: section }, "MCP \u670D\u52A1\u5668"),
    mcp.length === 0 ? React.createElement("div", { style: tip }, "\u672A\u53D1\u73B0 MCP \u914D\u7F6E\uFF08.mcp.json / .trae/mcp.json / .claude/settings.json\uFF09") : mcp.map((s) => React.createElement(
      "div",
      { key: s.name, style: row },
      React.createElement(
        "label",
        { style: { display: "inline-flex", alignItems: "center", cursor: "pointer" } },
        React.createElement("input", { type: "checkbox", checked: !!s.enabled, disabled: loading, onChange: (e) => toggleMcp(s.name, e.target.checked) }),
        React.createElement(
          "span",
          { style: name },
          React.createElement("code", { style: code }, s.name),
          React.createElement("span", { style: { ...count, color: "#888" } }, s.transport === "http" ? "HTTP" : "stdio"),
          statusText(s)
        )
      ),
      s.status === "error" ? React.createElement(
        "span",
        { style: { fontSize: 12, color: "#c62828" } },
        React.createElement("span", null, (s.error || "").slice(0, 40)),
        React.createElement("button", { onClick: () => reconnect(s.name), disabled: loading, style: btn }, "\u91CD\u8FDE")
      ) : React.createElement("button", { onClick: () => reconnect(s.name), disabled: loading, style: btn }, "\u91CD\u8FDE")
    )),
    mcp.length > 0 ? React.createElement(
      "div",
      { style: { marginTop: 6 } },
      React.createElement("button", { onClick: () => reconnect(void 0), disabled: loading, style: btn }, "\u5168\u90E8\u91CD\u8FDE")
    ) : null,
    React.createElement(
      "div",
      { style: { marginTop: 10 } },
      React.createElement("button", { onClick: rescan, disabled: loading, style: btn }, "\u91CD\u65B0\u626B\u63CF\u6280\u80FD"),
      React.createElement("span", { style: tip }, "\u5171 " + total + " \u4E2A\u6280\u80FD \xB7 \u81EA\u52A8\u76D1\u542C\u4E2D \xB7 \u72B6\u6001\u6301\u4E45\u5316\u4E8E <\u5DE5\u4F5C\u533A>/.claude/skills-state.json")
    )
  );
}
function apply(ctx2) {
  ctx2.effect(async () => {
    const dispose = await ctx2.remote.$mount(BRIDGE_REMOTE);
    if (ctx2.reflect.get("remote.skillMcpBridge") === void 0) {
      throw new Error("dsh-skill-mcp-bridge: the skillMcpBridge Remote namespace did not mount");
    }
    return () => {
      void dispose();
    };
  }, "dsh-skill-mcp-bridge: remote mount");
  ctx2.slots.inject("tool.view.cordis", () => ctx2.slots.register(
    { name: "tool.view.cordis", key: "self" },
    () => renderPanel()
  ));
  ctx2.slots.inject("settings.section", () => ctx2.slots.register(
    { name: "settings.section", id: "skill-mcp-bridge", order: 30, label: "\u9879\u76EE\u6865\u63A5\uFF08Skills + MCP\uFF09" },
    () => renderPanel()
  ));
}
var inject = ["remote", "slots"];
; return module.exports; } });
