// dsh-skill-mcp-bridge 共享 Typert Remote 声明（host 与 client 双端共用同一描述）。
// dsh 0.2.0-rc.2 typert 契约：strict codec 必须携带 create() 工厂
// （typert-loader 注册期校验 codec.create 为函数，缺失直接抛
// "strict codec has no create() factory" 并导致插件激活失败；
// gateway decode 期以 codec.create().parse(value) 做边界校验）。
// 手写 identity parse：两侧各自透传 JSON，无需 zod。
const identity = (value) => value
const codec = (symbol) => ({ mode: "strict", typeSymbol: symbol, create: () => ({ parse: identity }) })

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
