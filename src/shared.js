// dsh-skill-mcp-bridge 共享 Typert Remote 声明（host 与 client 双端共用同一描述）。
// client 端 $mount 强制 requireStrictCodec（所有 codec 必须 mode: "strict" 且带
// schema），src-json 会被拒 → remote 不挂载。故改用 strict codec + z.unknown()
// 宽松 schema：满足 strict 模式校验，同时不约束业务数据结构。
import { z } from "zod"

const loose = z.unknown()

export const BRIDGE_INVOCATIONS = [
  {
    id: "dsh-skill-mcp-bridge#bridge/status",
    service: "skillMcpBridge",
    namespace: "skillMcpBridge",
    method: "status",
    invocation: { kind: "direct" },
    parameters: [],
    result: { mode: "strict", typeSymbol: "dsh-skill-mcp-bridge#BridgeStatus", schema: loose },
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
        codec: { mode: "strict", typeSymbol: "dsh-skill-mcp-bridge#SetEnabledRequest", schema: loose },
      },
    ],
    result: { mode: "strict", typeSymbol: "dsh-skill-mcp-bridge#BridgeStatus", schema: loose },
  },
  {
    id: "dsh-skill-mcp-bridge#bridge/rescan",
    service: "skillMcpBridge",
    namespace: "skillMcpBridge",
    method: "rescan",
    invocation: { kind: "direct" },
    parameters: [],
    result: { mode: "strict", typeSymbol: "dsh-skill-mcp-bridge#BridgeStatus", schema: loose },
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
        codec: { mode: "strict", typeSymbol: "dsh-skill-mcp-bridge#ReconnectMcpRequest", schema: loose },
      },
    ],
    result: { mode: "strict", typeSymbol: "dsh-skill-mcp-bridge#BridgeStatus", schema: loose },
  },
]
