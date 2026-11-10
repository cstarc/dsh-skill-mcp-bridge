# dsh-skill-mcp-bridge

> 当前版本：**1.1.0**（变更历史见文末[更新日志](#更新日志)）

dsh（DeepSeek Harness）项目桥接插件：**自动导入 `.claude/.agents/.trae` 下的 skills**，并**桥接工作区 MCP 服务器**（HTTP/SSE 与 stdio 双传输），全部功能由 GUI 开关控制、状态持久化。

- 技能导入：`.claude/skills`、`.agents/skills`、`.trae/skills`，以及 `.claude/agents`、`.claude/commands`
- MCP 桥接：读取 `.mcp.json` / `.trae/mcp.json` / `.claude/settings.json` 中的 `mcpServers`，注册为 dsh 工具（`mcp__<server>__<name>`）
- 控制面板：设置页 + 工具视图双面板（开关、扫描、重连、状态）
- 自动监听：4 秒轮询文件指纹，skills/MCP 配置变更自动重载

## 安装

### 方式一：`dsh plugin add`（推荐）

dsh CLI 内置插件安装命令（转发 pnpm），git 仓库与 npm 包均可：

```bash
# git 仓库源
dsh plugin --profile web add github:cstarc/dsh-skill-mcp-bridge

# 等价形式（与 dsh-at-file 的 git+https 依赖同机制）
dsh plugin --profile web add git+https://github.com/cstarc/dsh-skill-mcp-bridge.git
```

- 自动写入 profile `package.json` 依赖与 `pnpm-lock.yaml`
- **包内 `cordis.patch.yml` 会被 loader 自动应用，装完即激活**，无需手动配置
- 若已发布到 npm registry，裸包名同样可用：`dsh plugin --profile web add dsh-skill-mcp-bridge`

### 方式二：手动放置（备选）

将本仓库复制到 dsh web profile 的 node_modules：

```bash
cp -r dsh-skill-mcp-bridge /data/.dsh/profiles/web/node_modules/
```

（profile 使用 pnpm `nodeLinker: hoisted`，直接放目录即可被解析。）

然后手动在 `/data/.dsh/profiles/web/cordis.patch.yml`（用户补丁层，升级不覆盖）追加：

```yaml
- insert:
    - id: dsh-skill-mcp-bridge
      name: dsh-skill-mcp-bridge
```

> 注意：手动放置的包不会被自动激活，必须补 insert 行；`dsh plugin add` 方式无需此步。

### 3. 重启与验证

重启 dsh 后插件自动加载（无需审批）。可在**不重启**的情况下先验证组合：

```bash
dsh --profile web --dump-config   # 应看到 dsh-skill-mcp-bridge 行
```

## 使用

### 技能开关

面板位于 **设置页 →「项目桥接（Skills + MCP）」** 与 **工具视图**：

| 开关 | 说明 |
|---|---|
| `.claude/skills` | 导入 `.claude/skills/*/SKILL.md`（rank 250） |
| `.agents/skills` | 导入 `.agents/skills`（rank 260） |
| `.trae/skills` | 导入 `.trae/skills`（rank 270） |
| `.claude/agents` | 导入 `.claude/agents/*.md`（rank 251，随 claude 开关） |
| `.claude/commands` | 导入 `.claude/commands/**/*.md`（rank 252，随 claude 开关） |

### frontmatter 语义

| 字段 | 行为 |
|---|---|
| `name` | 技能名（必须 kebab-case） |
| `description` | 技能描述；缺省取正文首段（≤1536 字符） |
| `when_to_use` / `when-to-use` / `whenToUse` | 触发时机 |
| `disable-model-invocation: true` | 模型不会自动触发该技能，在输入框发送 `/技能名` 手动调用 |
| `user-invocable: false` | 禁止用户手动调用 |
| `metadata` | 透传元数据 |

### MCP 服务器

支持两种配置形态（按 `.trae/mcp.json` → `.mcp.json` → `.claude/settings.json` 顺序合并覆盖）：

```jsonc
// .mcp.json — HTTP/SSE 传输
{
  "mcpServers": {
    "my-http-server": {
      "url": "https://example.com/mcp",
      "headers": { "Authorization": "Bearer xxx" }
    }
  }
}
```

```jsonc
// .mcp.json — stdio 传输（换行 JSON-RPC）
{
  "mcpServers": {
    "my-stdio-server": {
      "command": "node",
      "args": ["mcp-stdio-bridge.js"],
      "env": { "MCP_SERVER_URL": "http://10.0.0.1:9090/mcp" }
    }
  }
}
```

注册的工具名为 `mcp__<server>__<原始名>`。每个 server 可用独立开关；`disabled: true` 的 server 默认关闭。

## 状态持久化

**项目根（base）解析**：插件激活时等待 `workspaceRegistry` 就绪（最多 8 秒）后按以下顺序定根：

1. 进程 cwd 命中某个已注册工作区（等于该路径或位于其下）→ 取该工作区路径
2. 否则取注册表中最新注册的工作区
3. 回退 `sandboxPolicy.workspaceRoot`（部署默认根 = 启动进程 cwd）
4. 最后回退进程 cwd

定根后会把 `sandboxPolicy.workspaceRoot` 对齐到该项目根，保证状态/诊断文件写入不被 fs 沙箱拒绝。守护/远程方式从任意目录启动 dsh 时也能正确定位项目根。

开关状态保存于 `<项目根>/.claude/skills-state.json`：

```json
{
  "claude": true,
  "agents": true,
  "trae": true,
  "mcp": { "dbquery-mcp": true, "hundsun": true }
}
```

诊断日志：`<项目根>/.claude/bridge-diag.log`（截断 8000 字符）。

## 架构

```
Host（Node.js）                         Client（浏览器）
┌─────────────────────────────┐       ┌──────────────────────────┐
│ skills.registerProvider     │       │ settings.section 面板     │
│   · .claude/.agents/.trae   │       │ tool.view.cordis 面板     │
│   · frontmatter 解析        │       │                          │
│ tools.register (defineTool) │◄─────►│ ctx.remote.$mount        │
│   · MCP HTTP/SSE (fetch)    │ typert │  ctx.get(                 │
│   · MCP stdio (子进程)      │ RPC    │    "remote.skillMcpBridge")│
│ timer 指纹轮询             │       │                          │
└─────────────────────────────┘       └──────────────────────────┘
```

- 面板 RPC 走 Typert Remote（strict codec + identity `parse`；dsh ≥ 0.2.0-rc.2 要求 codec 携带 `create()` 工厂），host 端 `@Remote` 装饰器方法 + `ctx.typert.register(MANIFEST)`。
- 工具注册使用 `@deepseek-ai/dsh-tools` 的 `defineTool`（参数 DSL 不支持属性级 `enum/const/oneOf`，桥接时已做 schema 白名单净化）。
- 网络访问受限环境通过子进程 `node -e` 执行 fetch（沙箱无 fetch）。

## 构建

```bash
# NODE_PATH 指向 profile 的 hoisted node_modules，使 @deepseek-ai/dsh-typert-protocol
# 与 @deepseek-ai/dsh-tools 可被解析（按既有方式打入 bundle）。
export NODE_PATH=/data/.dsh/profiles/web/node_modules

# Host 半部：ESM，直接输出
esbuild src/index.js --bundle --format=esm --platform=node \
  --outfile=lib/index.js --external:node:* --target=es2020

# Client 半部：必须包成 web 模块加载器格式（__ModuleLoader__.load + 注入 require），
# 否则产物会留下裸 `import React from "react"`，浏览器无法解析，
# 报 `client-modules: dsh-skill-mcp-bridge import failed (see console)`。
BANNER="window.__ModuleLoader__.load({ id: 'dsh-skill-mcp-bridge', factory: (require) => { var module = { exports: {} }; var exports = module.exports; Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });"
FOOTER="; return module.exports; } });"
esbuild src/client.js --bundle --format=cjs --platform=browser \
  --outfile=lib/client.js --external:react --log-level=warning \
  --banner:js="$BANNER" --footer:js="$FOOTER"
```

> `--target=es2020` 必要：让 esbuild 转译 TC39 装饰器（Node 原生不支持装饰器语法）。
> `react` 保持 external，由 web 平台模块加载器提供。
> 构建后自检：`lib/client.js` 首行必须是 `window.__ModuleLoader__.load(...)`、
> 且能 grep 到 `require("react")`；host 产物用 `node --check lib/index.js`。

## 兼容性

- dsh web profile（`nodeLinker: hoisted` 布局）
- dsh ≥ 0.2.0-rc.2：Typert strict codec 必须提供 `create()` 工厂，运行时以 `codec.create().parse(value)` 做边界校验；缺失会在插件激活期抛 `strict codec has no create() factory`
- Client 平台包注入：`@deepseek-ai/dsh-client-runtime`、`@deepseek-ai/dsh-client-ui-tool`、`@deepseek-ai/dsh-client-ui-settings`
- Node.js ≥ 18（MCP HTTP 子进程使用全局 `fetch`）

## 更新日志

### 1.1.0（2026-11-10）

- 修复守护/远程方式启动时项目根认错：base 原取 `sandboxPolicy.workspaceRoot`（即启动进程 cwd），
  dsh 从 `$HOME` 等任意目录启动时会把项目根认错，导致 `.claude/.agents/.trae` skills 与
  `.mcp.json` 全部扫不到；改为等 `workspaceRegistry` 就绪后按已注册工作区定根
  （cwd 命中 > 最新注册工作区 > 沙箱根 > cwd），详见[状态持久化](#状态持久化)
- 兼容 dsh ≥ 0.2.0-rc.2：Typert strict codec 补 `create()` 工厂，修复插件激活期抛
  `strict codec has no create() factory`
- client 改用 dsh-skill-manager 模式挂载 remote（`ctx.get` 取 remote + 手写 identity codec），
  client bundle 564KB → 18KB

### 1.0.0

- 首个发布版本：`.claude/.agents/.trae` skills 导入、MCP 桥接（HTTP/SSE + stdio）、GUI 开关面板

## License

MIT
