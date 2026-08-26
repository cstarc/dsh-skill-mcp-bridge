// dsh-skill-mcp-bridge 共享 Typert Remote 声明（host 与 client 双端共用同一描述）。
// 参考 dsh-skill-manager 的成功模式：strict codec + 手写 identity parse
// （client 端边界只要求 schema.parse 存在；两侧各自解析，无需 zod）。
const identity = (value) => value
const codec = (symbol) => ({ mode: "strict", typeSymbol: symbol, schema: { parse: identity } })

export const BRIDGE_INVOCATIONS = [
  {
    id: "dsh-skill-mcp-bridge#bridge/status",
    service: "skillMcpBridge",
    namespace: "skillMcpBridge",
    method: "status",
    invocation: { kind: "direct" },
    parameters: [],
    result: codec("dsh-skill-mcp-bridge#BridgeStatus"),
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
        acceptsUndefined: true,
        codec: codec("dsh-skill-mcp-bridge#SetEnabledRequest"),
      },
    ],
    result: codec("dsh-skill-mcp-bridge#BridgeStatus"),
  },
  {
    id: "dsh-skill-mcp-bridge#bridge/rescan",
    service: "skillMcpBridge",
    namespace: "skillMcpBridge",
    method: "rescan",
    invocation: { kind: "direct" },
    parameters: [],
    result: codec("dsh-skill-mcp-bridge#BridgeStatus"),
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
        acceptsUndefined: true,
        codec: codec("dsh-skill-mcp-bridge#ReconnectMcpRequest"),
      },
    ],
    result: codec("dsh-skill-mcp-bridge#BridgeStatus"),
  },
]
