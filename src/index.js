// dsh-skill-mcp-bridge Host 半部：
// 1) skills 桥接（.claude/skills、.agents/skills、.trae/skills + .claude/agents、.claude/commands）
// 2) MCP 服务器桥接（HTTP/SSE 与 stdio 双传输，工具注册到 ctx.tools）
// 3) Typert Remote 面板通道（status / setEnabled / rescan / reconnectMcp）
// 状态持久化于 <workspace>/.claude/skills-state.json；诊断写 <workspace>/.claude/bridge-diag.log。
import { Remote, TypertRemoteService } from "@deepseek-ai/dsh-typert-protocol"
import { defineTool } from "@deepseek-ai/dsh-tools"
import { BRIDGE_INVOCATIONS } from "./shared.js"

// ── Typert Remote 服务 ──────────────────────────────────────────────────────
class ProjectBridgeRuntime extends TypertRemoteService {
  constructor(ctx, impl) {
    super(ctx, "skillMcpBridge")
    this.impl = impl
  }
  @Remote status() {
    return this.impl.status()
  }
  @Remote setEnabled(request) {
    return this.impl.setEnabled(request)
  }
  @Remote rescan() {
    return this.impl.rescan()
  }
  @Remote reconnectMcp(request) {
    return this.impl.reconnectMcp(request)
  }
}

const BRIDGE_MANIFEST = {
  package: "dsh-skill-mcp-bridge",
  face: "host",
  schemas: [],
  model: {
    services: [
      {
        key: "skillMcpBridge",
        exportName: "ProjectBridgeRuntime",
        description: "项目桥接：skills 导入开关与 MCP 服务器连接控制。",
        tags: [],
        members: [
          { kind: "method", name: "status", signature: "status(): unknown" },
          { kind: "method", name: "setEnabled", signature: "setEnabled(request: unknown): unknown" },
          { kind: "method", name: "rescan", signature: "rescan(): unknown" },
          { kind: "method", name: "reconnectMcp", signature: "reconnectMcp(request: unknown): unknown" },
        ],
        types: [],
      },
    ],
    events: [],
    objects: [],
  },
  invocations: BRIDGE_INVOCATIONS,
}

// ── 插件主体 ────────────────────────────────────────────────────────────────
export default {
  name: "skill-mcp-bridge",
  inject: ["skills", "fs", "timer", "subprocess", "tools", "typert"],
  apply(ctx) {
    const fs = ctx.fs
    const timer = ctx.timer
    const subprocess = ctx.subprocess
    const tools = ctx.tools
    const providerName = "skill-mcp-bridge"

    const sandboxPolicy = ctx.get("sandboxPolicy")
    const workspaceRoot = sandboxPolicy ? sandboxPolicy.workspaceRoot : undefined
    const base = workspaceRoot ? String(workspaceRoot).replace(/\/+$/, "") : ""
    const stateFile = base ? base + "/.claude/skills-state.json" : ".claude/skills-state.json"
    const diagFile = base ? base + "/.claude/bridge-diag.log" : ".claude/bridge-diag.log"
    const joinP = (p) => (p.startsWith("/") ? p : base ? base + "/" + p : p)

    async function diag(msg) {
      try {
        const target = await fs.resolve(diagFile)
        const stamp = new Date().toISOString()
        let existing = ""
        try {
          const info = await fs.stat(target)
          if (info && info.type === "file") existing = await fs.readText(target)
        } catch (e) { /* 首次创建 */ }
        const next = (existing + "[" + stamp + "] " + msg + "\n").slice(-8000)
        await fs.writeText(target, next)
      } catch (e) { /* 诊断失败不影响主流程 */ }
    }

    let state = { claude: true, agents: true, trae: true, mcp: {} }
    let imported = { claude: [], agents: [], trae: [] }
    let control = undefined
    let lastScan = 0
    let mcpView = []
    let nodePath = undefined

    async function loadState() {
      let existed = false
      try {
        const target = await fs.resolve(stateFile)
        const info = await fs.stat(target)
        if (!info || info.type !== "file") return existed
        existed = true
        const text = await fs.readText(target)
        const parsed = JSON.parse(text)
        if (parsed && typeof parsed === "object") {
          state = {
            claude: parsed.claude !== false,
            agents: parsed.agents !== false,
            trae: parsed.trae !== false,
            mcp: (parsed.mcp && typeof parsed.mcp === "object") ? { ...parsed.mcp } : {},
          }
        }
      } catch (e) { /* 缺失或损坏时保持默认 */ }
      return existed
    }

    async function saveState() {
      try {
        const target = await fs.resolve(stateFile)
        await fs.writeText(target, JSON.stringify(state, null, 2))
      } catch (e) {
        console.error("skill-mcp-bridge: 持久化失败: " + String(e))
      }
    }

    const ready = loadState().then((existed) => {
      if (!existed) return saveState()
    })

    // ---------- frontmatter 解析 ----------
    function parseScalar(value) {
      const v = value.trim()
      if (v.length >= 2 && v.startsWith("\"") && v.endsWith("\"")) return v.slice(1, -1)
      if (v.length >= 2 && v.startsWith("'") && v.endsWith("'")) return v.slice(1, -1)
      if (v === "true" || v === "yes" || v === "on") return true
      if (v === "false" || v === "no" || v === "off") return false
      const num = Number(v)
      if (v !== "" && !Number.isNaN(num)) return num
      return v
    }

    function parseFrontmatter(text) {
      const firstLineEnd = text.indexOf("\n")
      if (firstLineEnd < 0) return undefined
      if (text.slice(0, firstLineEnd).replace(/\r$/, "") !== "---") return undefined
      const start = firstLineEnd + 1
      let lineStart = start
      let closing = -1
      let bodyStart = -1
      while (lineStart <= text.length) {
        const nextNewline = text.indexOf("\n", lineStart)
        const lineEnd = nextNewline < 0 ? text.length : nextNewline
        if (text.slice(lineStart, lineEnd).replace(/\r$/, "") === "---") {
          closing = lineStart
          bodyStart = nextNewline < 0 ? text.length : nextNewline + 1
          break
        }
        if (nextNewline < 0) return undefined
        lineStart = nextNewline + 1
      }
      if (closing < 0) return undefined
      const data = {}
      for (const line of text.slice(start, closing).split("\n")) {
        const trimmed = line.trim()
        if (trimmed === "" || trimmed.startsWith("#")) continue
        const colon = trimmed.indexOf(":")
        if (colon < 0) continue
        const key = trimmed.slice(0, colon).trim()
        let value = trimmed.slice(colon + 1).trim()
        if (value === "") continue
        if (!value.startsWith("\"") && !value.startsWith("'")) {
          const hash = value.indexOf(" #")
          if (hash >= 0) value = value.slice(0, hash).trim()
        }
        data[key] = parseScalar(value)
      }
      return { data, body: text.slice(bodyStart) }
    }

    function stringField(data, key) {
      const v = data[key]
      return typeof v === "string" && v.length > 0 ? v : undefined
    }

    function whenToUseOf(data) {
      return stringField(data, "whenToUse") || stringField(data, "when_to_use") || stringField(data, "when-to-use")
    }

    function frontmatterBoolean(data, key) {
      if (!Object.prototype.hasOwnProperty.call(data, key)) return undefined
      const v = data[key]
      if (typeof v === "boolean") return v
      if (v === 1 || v === "1") return true
      if (v === 0 || v === "0") return false
      if (typeof v === "string") {
        switch (v.toLowerCase()) {
          case "true": case "yes": case "on": return true
          case "false": case "no": case "off": return false
        }
      }
      throw new TypeError('frontmatter field "' + key + '" must be a boolean')
    }

    function parseInvocation(data) {
      const disableModel = frontmatterBoolean(data, "disable-model-invocation")
      const userInvocable = frontmatterBoolean(data, "user-invocable")
      return {
        modelInvocable: disableModel !== true,
        userInvocable: userInvocable !== false,
      }
    }

    function metadataField(data) {
      const v = data.metadata
      return typeof v === "object" && v !== null && !Array.isArray(v) ? v : undefined
    }

    function isKebabCase(name) {
      return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name)
    }

    function firstParagraph(body) {
      const lines = String(body || "").split(/\r?\n/)
      let i = 0
      while (i < lines.length && lines[i].trim() === "") i++
      if (i < lines.length && /^#\s/.test(lines[i])) i++
      while (i < lines.length && lines[i].trim() === "") i++
      const out = []
      while (i < lines.length && lines[i].trim() !== "") {
        out.push(lines[i].trim())
        i++
      }
      return out.join(" ")
    }

    function describeOf(parsed) {
      let d = stringField(parsed.data, "description")
      if (!d) d = firstParagraph(parsed.body)
      if (!d) return undefined
      return d.length > 1536 ? d.slice(0, 1536) : d
    }

    async function readSkillText(filePath, signal) {
      try {
        const target = await fs.resolve(filePath, { signal })
        const info = await fs.stat(target, signal)
        if (!info || info.type !== "file") return undefined
        return await fs.readText(target, signal)
      } catch (e) {
        return undefined
      }
    }

    function toCandidate(parsed, filePath, dirPath, source, rank, extra) {
      const name = stringField(parsed.data, "name") || (extra && extra.name)
      const description = describeOf(parsed)
      if (!name || !description || !isKebabCase(name)) return undefined
      let invocation
      try {
        invocation = parseInvocation(parsed.data)
      } catch (e) {
        return undefined
      }
      const metadata = metadataField(parsed.data)
      const whenToUse = whenToUseOf(parsed.data)
      return {
        name,
        description,
        ...(whenToUse !== undefined ? { whenToUse } : {}),
        invocation,
        source,
        provider: providerName,
        rank,
        locator: { file: filePath, dir: dirPath },
        resourceBase: { kind: "directory", path: dirPath },
        path: filePath,
        ...(metadata !== undefined ? { metadata } : {}),
      }
    }

    // ---------- 技能发现 ----------
    const ROOTS = [
      { key: "claude", dir: ".claude/skills", rank: 250, source: "custom", label: ".claude/skills" },
      { key: "agents", dir: ".agents/skills", rank: 260, source: "project-agents", label: ".agents/skills" },
      { key: "trae", dir: ".trae/skills", rank: 270, source: "custom", label: ".trae/skills" },
    ]

    async function scanSkillDir(rootDir, rank, source, options, seen, results, key) {
      let target
      try {
        target = await fs.resolve(rootDir, { cwd: base, signal: options && options.signal })
      } catch (e) { return [] }
      let info
      try {
        info = await fs.stat(target, options && options.signal)
      } catch (e) { return [] }
      if (!info || info.type !== "directory") return []
      let entries
      try {
        entries = await fs.listDir(target, options && options.signal)
      } catch (e) { return [] }
      const out = []
      for (const entry of entries) {
        if (options && options.signal && options.signal.aborted) break
        const entryPath = entry.target ? entry.target.displayPath : undefined
        if (!entryPath) continue
        let raw, parsed, cand
        if (entry.type === "directory") {
          const skillFile = entryPath + "/SKILL.md"
          raw = await readSkillText(skillFile, options && options.signal)
          if (raw === undefined) continue
          parsed = parseFrontmatter(raw)
          if (!parsed) continue
          cand = toCandidate(parsed, skillFile, entryPath, source, rank)
        } else if (entry.type === "file" && /\.md$/i.test(entry.name || "")) {
          raw = await readSkillText(entryPath, options && options.signal)
          if (raw === undefined) continue
          parsed = parseFrontmatter(raw)
          if (!parsed) continue
          cand = toCandidate(parsed, entryPath, entryPath, source, rank)
        }
        if (cand && !seen.has(cand.name)) {
          seen.add(cand.name)
          results[key].push({ name: cand.name, description: cand.description, path: cand.path, kind: "skill", userOnly: cand.invocation.modelInvocable === false && cand.invocation.userInvocable === true })
          out.push(cand)
        }
      }
      return out
    }

    async function scanMdDir(dirPath, rank, source, options, seen, results, key, namePrefix, kind) {
      let target
      try {
        target = await fs.resolve(dirPath, { cwd: base, signal: options && options.signal })
      } catch (e) { return [] }
      let info
      try {
        info = await fs.stat(target, options && options.signal)
      } catch (e) { return [] }
      if (!info || info.type !== "directory") return []
      let entries
      try {
        entries = await fs.listDir(target, options && options.signal)
      } catch (e) { return [] }
      const out = []
      for (const entry of entries) {
        if (options && options.signal && options.signal.aborted) break
        const entryPath = entry.target ? entry.target.displayPath : undefined
        if (!entryPath) continue
        if (entry.type === "directory") {
          out.push.apply(out, await scanMdDir(entryPath, rank, source, options, seen, results, key, namePrefix + "-" + entry.name, kind))
        } else if (entry.type === "file" && /\.md$/i.test(entry.name || "")) {
          const stem = String(entry.name).replace(/\.md$/i, "")
          const name = (namePrefix ? namePrefix + "-" : "") + stem
          if (!isKebabCase(name)) continue
          const raw = await readSkillText(entryPath, options && options.signal)
          if (raw === undefined) continue
          const parsed = parseFrontmatter(raw)
          if (!parsed) continue
          const cand = toCandidate(parsed, entryPath, entryPath, source, rank, { name })
          if (cand && !seen.has(cand.name)) {
            seen.add(cand.name)
            results[key].push({ name: cand.name, description: cand.description, path: cand.path, kind, userOnly: false })
            out.push(cand)
          }
        }
      }
      return out
    }

    async function discover(options) {
      await ready
      const results = { claude: [], agents: [], trae: [] }
      const candidates = []
      const seen = new Set()
      for (const root of ROOTS) {
        if (!state[root.key]) continue
        const found = await scanSkillDir(joinP(root.dir), root.rank, root.source, options, seen, results, root.key)
        for (const c of found) candidates.push(c)
      }
      if (state.claude) {
        const agents = await scanMdDir(joinP(".claude/agents"), 251, "custom", options, seen, results, "claude", "", "agent")
        for (const c of agents) candidates.push(c)
        const commands = await scanMdDir(joinP(".claude/commands"), 252, "custom", options, seen, results, "claude", "", "command")
        for (const c of commands) candidates.push(c)
      }
      return { candidates, results }
    }

    const provider = {
      name: providerName,
      async list(options) {
        try {
          const { candidates, results } = await discover(options)
          imported = results
          return { candidates, complete: true }
        } catch (e) {
          console.error("skill-mcp-bridge: 发现技能失败: " + String(e))
          return { candidates: [], complete: false }
        }
      },
      async get(candidate, options) {
        const loc = candidate && candidate.locator
        if (!loc || !loc.file) return undefined
        const raw = await readSkillText(loc.file, options && options.signal)
        if (raw === undefined) return undefined
        const parsed = parseFrontmatter(raw)
        if (!parsed) return undefined
        const description = describeOf(parsed)
        if (!description) return undefined
        let invocation
        try {
          invocation = parseInvocation(parsed.data)
        } catch (e) {
          return undefined
        }
        const metadata = metadataField(parsed.data)
        const whenToUse = whenToUseOf(parsed.data)
        return {
          name: candidate.name,
          description,
          ...(whenToUse !== undefined ? { whenToUse } : {}),
          invocation,
          source: "custom",
          provider: providerName,
          resourceBase: { kind: "directory", path: loc.dir || loc.file },
          content: parsed.body.trim(),
          path: loc.file,
          ...(metadata !== undefined ? { metadata } : {}),
        }
      },
    }

    ctx.skills.registerProvider((ctl) => {
      control = ctl
      return provider
    })

    function invalidate() {
      if (control) {
        try { control.invalidate() } catch (e) { /* 已回收时忽略 */ }
      }
    }

    // ---------- 自动监听 ----------
    let lastFingerprint = ""
    let polling = false

    async function fingerprintNow() {
      const parts = []
      const roots = [".claude/skills", ".agents/skills", ".trae/skills", ".claude/agents", ".claude/commands"]
      for (const dir of roots) {
        try {
          const target = await fs.resolve(joinP(dir))
          const info = await fs.stat(target)
          if (!info || info.type !== "directory") { parts.push(dir + ":absent"); continue }
          const entries = await fs.listDir(target)
          const inner = []
          for (const entry of entries) {
            const p = entry.target ? entry.target.displayPath : undefined
            if (!p) continue
            let v = "?"
            try {
              const ei = await fs.stat(p)
              v = ei ? String(ei.version) : "?"
            } catch (e) { /* 忽略 */ }
            inner.push(entry.name + ":" + v)
          }
          inner.sort()
          parts.push(dir + "=" + inner.join(","))
        } catch (e) {
          parts.push(dir + ":err")
        }
      }
      for (const f of [".mcp.json", ".trae/mcp.json", ".claude/settings.json"]) {
        try {
          const target = await fs.resolve(joinP(f))
          const info = await fs.stat(target)
          parts.push(f + ":" + (info ? String(info.version) : "absent"))
        } catch (e) {
          parts.push(f + ":absent")
        }
      }
      return parts.join("|")
    }

    async function pollOnce() {
      if (polling) return
      polling = true
      try {
        const fp = await fingerprintNow()
        const changed = fp !== lastFingerprint
        lastFingerprint = fp
        if (!changed) return
        try {
          const { results } = await discover({})
          imported = results
          invalidate()
        } catch (e) { /* 保留旧目录 */ }
        try {
          await reconcileMcp()
        } catch (e) { /* 保留旧连接 */ }
      } finally {
        polling = false
      }
    }

    timer.interval(() => { void pollOnce() }, 4000)

    // ---------- MCP 桥接 ----------
    const mcpConnections = new Map()
    const NODE_FALLBACKS = ["/root/.nvm/versions/node/v24.18.0/bin/node", "/usr/bin/node", "/usr/local/bin/node"]
    const SCHEMA_TYPES = new Set(["string", "number", "integer", "boolean", "null", "object", "array"])
    const SCHEMA_NODE_KEYS = ["type", "properties", "required", "items", "description", "title", "default", "examples", "enum", "const", "oneOf"]

    function sanitizeMcpSchema(schema) {
      const sanitizeNode = (node, isRoot, allowRequired) => {
        if (!node || typeof node !== "object" || Array.isArray(node)) return isRoot ? { type: "object", properties: {} } : undefined
        const out = {}
        for (const k of Object.keys(node)) {
          if (!SCHEMA_NODE_KEYS.includes(k)) continue
          const v = node[k]
          if (k === "type") {
            if (typeof v === "string" && SCHEMA_TYPES.has(v)) out.type = v
            else if (Array.isArray(v)) {
              const pick = v.find((x) => typeof x === "string" && x !== "null" && SCHEMA_TYPES.has(x))
              if (pick) out.type = pick
            }
          } else if (k === "properties") {
            if (v && typeof v === "object" && !Array.isArray(v)) {
              const props = {}
              for (const pn of Object.keys(v)) {
                const sub = sanitizeNode(v[pn], false, false)
                if (sub) props[pn] = sub
              }
              if (Object.keys(props).length > 0) out.properties = props
            }
          } else if (k === "items") {
            const sub = sanitizeNode(v, false, false)
            if (sub) out.items = sub
          } else if (k === "required") {
            if (allowRequired && Array.isArray(v)) out.required = v.filter((x) => typeof x === "string")
          } else if (k === "enum") {
            if (Array.isArray(v) && v.length > 0) {
              const scalars = v.filter((x) => typeof x === "string" || typeof x === "number" || typeof x === "boolean")
              if (scalars.length > 0) out.enum = scalars
            }
          } else if (k === "const") {
            if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") out.const = v
          } else if (k === "oneOf") {
            if (Array.isArray(v)) {
              const branches = []
              for (const branch of v) {
                const sub = sanitizeNode(branch, false, false)
                if (sub) branches.push(sub)
              }
              if (branches.length >= 2) out.oneOf = branches
            }
          } else if (typeof v === "string") {
            out[k] = v
          }
        }
        // 非标量节点（array/object/json/oneOf）不支持 enum/const，丢弃
        if (out.oneOf !== undefined || out.type === "array" || out.type === "object" || out.type === "json") {
          delete out.enum
          delete out.const
        }
        // enum/const 无显式 type 时按值推断（MCP 惯例多为 string）
        if (out.enum !== undefined && out.type === undefined) {
          out.type = out.enum.every((x) => typeof x === "number") ? "number" : "string"
        }
        if (out.const !== undefined && out.type === undefined) {
          out.type = typeof out.const === "number" ? "number" : "string"
        }
        if (out.type === "object" || (out.type === undefined && out.properties !== undefined)) {
          out.additionalProperties = true
        }
        return out
      }
      const cleaned = sanitizeNode(schema, true, true)
      const root = cleaned && cleaned.type === "object" ? cleaned : { type: "object", properties: {} }
      if (!root.properties || typeof root.properties !== "object") root.properties = {}
      if (Array.isArray(root.required)) {
        root.required = root.required.filter((n) => Object.prototype.hasOwnProperty.call(root.properties, n))
        if (root.required.length === 0) delete root.required
      }
      return root
    }

    // 静态版 defineTool 的 parameters 是「属性名 → value schema」映射，
    // required 通过属性级 required: true 表达（非根 required 数组）。
    function mcpSchemaToParameters(inputSchema) {
      const root = sanitizeMcpSchema(inputSchema)
      const map = {}
      const requiredSet = new Set(Array.isArray(root.required) ? root.required : [])
      for (const name of Object.keys(root.properties || {})) {
        const prop = root.properties[name]
        map[name] = requiredSet.has(name) ? { ...prop, required: true } : prop
      }
      return map
    }

    function sanitizeName(name) {
      return String(name).replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 32)
    }

    async function readMcpConfigs() {
      const servers = new Map()
      const files = [".trae/mcp.json", ".mcp.json", ".claude/settings.json"]
      for (const f of files) {
        let raw
        try {
          const target = await fs.resolve(joinP(f))
          const info = await fs.stat(target)
          if (!info || info.type !== "file") continue
          raw = await fs.readText(target)
        } catch (e) { continue }
        let parsed
        try {
          parsed = JSON.parse(raw)
        } catch (e) { continue }
        const map = parsed && typeof parsed === "object" ? (parsed.mcpServers || parsed.mcp || null) : null
        if (!map || typeof map !== "object") continue
        for (const name of Object.keys(map)) {
          const entry = map[name]
          if (!entry || typeof entry !== "object") continue
          servers.set(name, { name, ...entry })
        }
      }
      return servers
    }

    async function ensureNode() {
      if (nodePath) return nodePath
      try {
        nodePath = await subprocess.resolveExecutable("node")
      } catch (e) {
        for (const p of NODE_FALLBACKS) {
          try {
            const resolved = await subprocess.resolveExecutable(p)
            if (resolved) { nodePath = resolved; break }
          } catch (err) { /* 继续 */ }
        }
      }
      if (!nodePath) throw new Error("无法解析 node 可执行文件")
      return nodePath
    }

    const NODE_E_HTTP = [
      "const u=process.argv[1];const o=JSON.parse(process.argv[2]);",
      "(async()=>{",
      "const r=await fetch(u,{method:'POST',headers:{'content-type':'application/json',accept:'application/json, text/event-stream',...(o.headers||{})},body:JSON.stringify(o.body),signal:AbortSignal.timeout(45000)});",
      "const t=await r.text();",
      "process.stdout.write(JSON.stringify({status:r.status,headers:Object.fromEntries(r.headers),body:t}));",
      "})().catch(e=>{process.stdout.write(JSON.stringify({error:String(e)}));});",
    ].join("")

    async function httpPost(server, payload, signal) {
      const node = await ensureNode()
      const headers = {}
      if (server.headers && typeof server.headers === "object") {
        for (const k of Object.keys(server.headers)) {
          const v = server.headers[k]
          if (typeof v === "string") headers[k] = v
        }
      }
      const conn = mcpConnections.get(server.name)
      if (conn && conn.sessionId) headers["mcp-session-id"] = conn.sessionId
      const request = { headers, body: payload }
      const handle = subprocess.spawn({
        argv: [node, "-e", NODE_E_HTTP, String(server.url), JSON.stringify(request)],
        cwd: base || "/",
        stdio: { stdin: "ignore", stdout: { maxBytes: 8 * 1024 * 1024 }, stderr: "inherit" },
        graceMs: 20000,
        ...(signal ? { signal } : {}),
      })
      const outcome = await handle.done
      const reader = handle.collected.stdout
      const text = reader ? reader.readFrom(0).text : ""
      if (outcome.exitCode !== 0 && !text) {
        throw new Error("MCP HTTP 子进程失败 exit=" + String(outcome.exitCode))
      }
      let parsed
      try {
        parsed = JSON.parse(text.trim())
      } catch (e) {
        throw new Error("MCP HTTP 响应无法解析: " + String(text).slice(0, 200))
      }
      if (parsed.error) throw new Error("MCP HTTP: " + String(parsed.error))
      const mcpSession = parsed.headers && parsed.headers["mcp-session-id"]
      if (mcpSession && conn) conn.sessionId = mcpSession
      if (parsed.status >= 300) throw new Error("MCP HTTP " + parsed.status + ": " + String(parsed.body).slice(0, 300))
      const trimmed = String(parsed.body || "").trim()
      let json
      try {
        json = JSON.parse(trimmed)
      } catch (e) {
        let data = null
        for (const line of trimmed.split(/\r?\n/)) {
          if (line.startsWith("data:")) data = line.slice(5).trim()
        }
        if (data && data !== "[DONE]") {
          json = JSON.parse(data)
        } else {
          throw new Error("MCP HTTP 非 JSON/SSE 响应: " + trimmed.slice(0, 200))
        }
      }
      if (json && json.error) throw new Error("MCP " + (payload.method || "") + ": " + (json.error.message || JSON.stringify(json.error)))
      return json
    }

    async function stdioCall(server, payload, signal) {
      let argv
      const command = String(server.command || "")
      if (command.startsWith("/")) {
        argv = [command]
      } else {
        const exe = await subprocess.resolveExecutable(command)
        argv = [exe]
      }
      const args = Array.isArray(server.args) ? server.args : []
      for (const a of args) {
        let arg = String(a)
        if (arg.indexOf("${workspaceFolder}") >= 0) arg = arg.split("${workspaceFolder}").join(base)
        if (arg.startsWith("./")) arg = (base ? base + "/" : "") + arg.slice(2)
        argv.push(arg)
      }
      const env = {}
      if (server.env && typeof server.env === "object") {
        for (const k of Object.keys(server.env)) {
          const v = server.env[k]
          if (typeof v === "string") env[k] = v.split("${workspaceFolder}").join(base)
        }
      }
      const handle = subprocess.spawn({
        argv,
        cwd: base || "/",
        stdio: { stdin: "pipe", stdout: { maxBytes: 4 * 1024 * 1024 }, stderr: "inherit" },
        graceMs: 15000,
        env,
        ...(signal ? { signal } : {}),
      })
      if (handle.pid === -1) throw new Error("MCP stdio 进程启动失败")
      try {
        handle.stdin.write(JSON.stringify(payload) + "\n")
      } catch (e) {
        handle.terminate()
        throw new Error("MCP stdio 写入失败: " + String(e))
      }
      const reader = handle.collected.stdout
      let buf = ""
      let offset = 0
      const deadline = Date.now() + 15000
      let settled = false
      handle.done.then(() => { settled = true }, () => { settled = true })
      while (Date.now() < deadline) {
        const read = reader.readFrom(offset)
        offset = read.nextOffset
        buf += read.text
        const lines = buf.split("\n")
        buf = lines.pop()
        for (const line of lines) {
          const t = line.trim()
          if (!t) continue
          let msg
          try {
            msg = JSON.parse(t)
          } catch (e) { continue }
          if (msg && msg.id === payload.id) {
            handle.terminate()
            if (msg.error) throw new Error("MCP stdio " + (payload.method || "") + ": " + (msg.error.message || JSON.stringify(msg.error)))
            return msg
          }
        }
        if (settled) break
        await timer.timeout(25)
      }
      handle.terminate()
      throw new Error("MCP stdio 调用超时: " + (payload.method || ""))
    }

    async function mcpRequest(server, method, params, signal) {
      const payload = { jsonrpc: "2.0", id: 1 + Math.floor(Math.random() * 1e6), method, params: params || {} }
      if (server.url) {
        return await httpPost(server, payload, signal)
      }
      return await stdioCall(server, payload, signal)
    }

    async function mcpInitialize(server, signal) {
      let res
      try {
        res = await mcpRequest(server, "initialize", {
          protocolVersion: "2025-03-26",
          capabilities: {},
          clientInfo: { name: "dsh-skill-mcp-bridge", version: "1.0.0" },
        }, signal)
      } catch (e) {
        res = await mcpRequest(server, "initialize", {
          protocolVersion: "2024-11-05",
          capabilities: {},
          clientInfo: { name: "dsh-skill-mcp-bridge", version: "1.0.0" },
        }, signal)
      }
      if (!res || res.error) throw new Error("initialize 失败: " + (res && res.error ? (res.error.message || JSON.stringify(res.error)) : "空响应"))
      return res.result || {}
    }

    async function mcpListTools(server, signal) {
      const res = await mcpRequest(server, "tools/list", {}, signal)
      if (!res || res.error) throw new Error("tools/list 失败")
      const tools = (res.result && Array.isArray(res.result.tools)) ? res.result.tools : []
      return tools
    }

    function toolNameOf(serverName, rawName) {
      return ("mcp__" + sanitizeName(serverName) + "__" + String(rawName).replace(/[^A-Za-z0-9_-]/g, "_")).slice(0, 64)
    }

    async function registerServerTools(server, signal) {
      const toolsList = await mcpListTools(server, signal)
      const conn = mcpConnections.get(server.name)
      if (!conn) return []
      const disposers = []
      const toolNames = []
      let failed = 0
      for (const t of toolsList) {
        const rawName = t && t.name
        if (!rawName || typeof rawName !== "string") continue
        const publicName = toolNameOf(server.name, rawName)
        const description = (t.description && String(t.description)) || ("MCP 工具 " + rawName + "（" + server.name + "）")
        const parameters = mcpSchemaToParameters(t.inputSchema)
        try {
          const tool = defineTool({
            name: publicName,
            description,
            parameters,
            output: {
              schema: { type: "object", properties: { content: { type: "string" }, isError: { type: "boolean" } }, additionalProperties: true },
              render: (args, value) => {
                const v = value || {}
                const text = v.isError ? ("MCP 错误: " + String(v.content || "")) : String(v.content || "")
                return [{ type: "text", text }]
              },
            },
            execute: async (args, exec) => {
              try {
                const res = await mcpRequest(server, "tools/call", { name: rawName, arguments: args || {} }, exec.signal)
                const result = res && res.result
                let content = ""
                let isError = false
                if (result && Array.isArray(result.content)) {
                  content = result.content.map((c) => (c && typeof c.text === "string" ? c.text : "")).join("\n")
                  isError = !!result.isError
                } else if (result !== undefined && result !== null) {
                  content = JSON.stringify(result, null, 2)
                }
                if (!content && result && result.isError) {
                  content = "MCP 调用返回错误"
                  isError = true
                }
                return { content, isError }
              } catch (e) {
                return { content: String(e && e.message ? e.message : e), isError: true }
              }
            },
          })
          let disposed = false
          const dispose = tools.register(tool)
          disposers.push(() => { if (!disposed) { disposed = true; dispose() } })
          toolNames.push(publicName)
        } catch (e) {
          failed++
          await diag("register tool " + publicName + " FAILED: " + String(e && e.message ? e.message : e))
        }
      }
      conn.toolNames = toolNames
      conn.disposers = disposers
      await diag("register " + server.name + ": ok=" + toolNames.length + " failed=" + failed)
      return toolNames
    }

    async function connectServer(server, signal) {
      const conn = { sessionId: undefined, toolNames: [], disposers: [] }
      mcpConnections.set(server.name, conn)
      try {
        await mcpInitialize(server, signal)
        const toolNames = await registerServerTools(server, signal)
        conn.toolNames = toolNames
        await diag("connect " + server.name + " ok, tools=" + toolNames.length)
        return toolNames
      } catch (e) {
        for (const d of conn.disposers) { try { d() } catch (err) { /* 忽略 */ } }
        mcpConnections.delete(server.name)
        await diag("connect " + server.name + " ERROR: " + String(e && e.message ? e.message : e))
        throw e
      }
    }

    function unregisterServer(name) {
      const conn = mcpConnections.get(name)
      if (conn && conn.disposers) {
        for (const d of conn.disposers) { try { d() } catch (e) { /* 忽略 */ } }
      }
      mcpConnections.delete(name)
    }

    async function reconcileMcp() {
      const servers = await readMcpConfigs()
      await diag("reconcileMcp: servers=" + JSON.stringify([...servers.keys()]))
      const view = []
      const names = new Set()
      for (const [name, entry] of servers) {
        names.add(name)
        const disabled = entry.disabled === true
        let enabled = state.mcp[name]
        if (enabled === undefined) {
          enabled = !disabled
          state.mcp[name] = enabled
          await saveState()
        }
        if (!enabled) {
          unregisterServer(name)
          view.push({ name, enabled: false, transport: entry.url ? "http" : "stdio", status: "off", toolCount: 0, error: null })
          continue
        }
        if (!mcpConnections.has(name)) {
          try {
            const toolNames = await connectServer(entry)
            view.push({ name, enabled: true, transport: entry.url ? "http" : "stdio", status: "connected", toolCount: toolNames.length, error: null })
          } catch (e) {
            view.push({ name, enabled: true, transport: entry.url ? "http" : "stdio", status: "error", toolCount: 0, error: String(e && e.message ? e.message : e) })
          }
        } else {
          const conn = mcpConnections.get(name)
          view.push({ name, enabled: true, transport: entry.url ? "http" : "stdio", status: "connected", toolCount: conn.toolNames.length, error: null })
        }
      }
      for (const name of [...mcpConnections.keys()]) {
        if (!names.has(name)) unregisterServer(name)
      }
      mcpView = view
      return view
    }

    // 递归把 undefined 归一为 null（跨进程 JSON 通道拒绝 undefined 值）
    function toJsonSafe(value) {
      if (value === undefined) return null
      if (value === null) return null
      if (Array.isArray(value)) return value.map(toJsonSafe)
      if (typeof value === "object") {
        const out = {}
        for (const k of Object.keys(value)) out[k] = toJsonSafe(value[k])
        return out
      }
      return value
    }

    function statusPayload() {
      return toJsonSafe({
        state,
        lastScan,
        roots: ROOTS.map((r) => ({
          key: r.key,
          label: r.label,
          enabled: state[r.key],
          count: imported[r.key].length,
          skills: imported[r.key],
        })),
        mcp: mcpView,
      })
    }

    // ---------- Typert 面板通道实现 ----------
    const impl = {
      status() {
        try {
          const payload = statusPayload()
          diag("status ok: roots=" + JSON.stringify(payload.roots.map((r) => r.key + ":" + r.count)) + " mcp=" + String((payload.mcp || []).length) + " lastScan=" + payload.lastScan)
          return payload
        } catch (e) {
          diag("status FAILED: " + String((e && e.stack) || e))
          throw e
        }
      },
      async setEnabled(request) {
        await ready
        const args = request || {}
        if (args.root && Object.prototype.hasOwnProperty.call(state, args.root)) {
          const next = !!args.enabled
          if (state[args.root] !== next) {
            state = { ...state, [args.root]: next }
            imported = { claude: [], agents: [], trae: [] }
            await saveState()
            invalidate()
          }
        }
        if (args.mcp) {
          const name = String(args.mcp)
          const next = !!args.enabled
          state.mcp = { ...state.mcp, [name]: next }
          await saveState()
          if (next) {
            try {
              const servers = await readMcpConfigs()
              const entry = servers.get(name)
              if (entry) await connectServer(entry)
            } catch (e) {
              console.error("skill-mcp-bridge: 连接 MCP " + name + " 失败: " + String(e))
            }
          } else {
            unregisterServer(name)
          }
          await reconcileMcp()
        }
        return statusPayload()
      },
      async rescan() {
        await ready
        try {
          const { results } = await discover({})
          imported = results
        } catch (e) {
          console.error("skill-mcp-bridge: 重新扫描失败: " + String(e))
        }
        lastScan = Date.now()
        invalidate()
        return statusPayload()
      },
      async reconnectMcp(request) {
        const args = request || {}
        const name = args.name ? String(args.name) : undefined
        if (name) {
          unregisterServer(name)
        } else {
          for (const n of [...mcpConnections.keys()]) unregisterServer(n)
        }
        const view = await reconcileMcp()
        return { ...statusPayload(), mcp: view }
      },
    }

    new ProjectBridgeRuntime(ctx, impl)
    ctx.effect(() => {
      const dispose = ctx.typert.register(BRIDGE_MANIFEST)
      return () => { void dispose() }
    }, "dsh-skill-mcp-bridge: typert manifest")

    void ready.then(() => {
      void reconcileMcp().catch((e) => {
        console.error("skill-mcp-bridge: 初始 MCP 对账失败: " + String(e))
        void diag("initial reconcile ERROR: " + String(e && e.message ? e.message : e))
      })
    })
    void diag("skill-mcp-bridge static plugin started, base=" + base)
  },
}
