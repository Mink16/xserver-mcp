# XServer MCP Server

**English** | [日本語](./README.md)

[![CI](https://github.com/Mink16/xserver-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/Mink16/xserver-mcp/actions/workflows/ci.yml)
[![CodeQL](https://github.com/Mink16/xserver-mcp/actions/workflows/codeql.yml/badge.svg)](https://github.com/Mink16/xserver-mcp/actions/workflows/codeql.yml)
[![npm version](https://img.shields.io/npm/v/xserver-mcp-server.svg)](https://www.npmjs.com/package/xserver-mcp-server)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![Node](https://img.shields.io/node/v/xserver-mcp-server)](./package.json)

A Node.js [Model Context Protocol](https://modelcontextprotocol.io/) (MCP) server that exposes the [Xserver server-panel REST API](https://developer.xserver.ne.jp/api/server/) (`https://api.xserver.ne.jp`) as MCP tools.

The current scope covers the `Mail account` / `Server info` / `DNS record` tags and a composite `domain_verification` toolset.

## Features

- Mail account CRUD (`list` / `create` / `get` / `update` / `delete`) and forwarding control
- DNS record CRUD with a `confirm: true` safeguard on destructive operations
- Server info & usage
- High-level composite tool `create_mail_account_with_verification` that automatically handles `_xserver-verify.{domain}` TXT ownership check
- Automatic IDN → Punycode normalization: Japanese domains and email local@domain addresses are accepted as-is, and the resolved ASCII form is echoed back as `resolved_domain` / `resolved_mail_address` in write responses
- Rate-limit-aware HTTP client: 429 `Retry-After` auto-retry, concurrency semaphore, official error code mapping (`VALIDATION_ERROR`, `OPERATION_ERROR`, `RATE_LIMIT_EXCEEDED`, ...)
- Per-toolset enable/disable via the `ENABLE_TOOLSETS` env var

## Roadmap

Planned official API tags (priority order, not committed):

- `WordPress quick install` — `list` / `install` / `update` / `delete`
- `Cron` — `list` / `create` / `update` / `delete`
- `Mail filter` — `list` / `create` / `delete`
- `FTP account` — `list` / `create` / `update` / `delete`
- `Subdomain` / `Domain settings` — `list` / `create` / `delete` (destructive — will require `confirm` guard)
- `MySQL` / `PHP version` / `SSL settings` and other remaining tags

Feature requests are welcome via [Issues](https://github.com/Mink16/xserver-mcp/issues/new?template=feature_request.yml).

> **⚠ Unofficial project**
> This project is **not** officially provided, endorsed, or audited by XServer / エックスサーバー (XServer Inc. / エックスサーバー株式会社). It is an independent, unofficial OSS client with no corporate or contractual relationship to XServer Inc.
> "XServer" and "エックスサーバー" are trademarks / service names of XServer Inc. References in this README are limited to descriptive use (nominative use) to identify the service this client targets. No XServer Inc. logo or brand resource is used.
> The authors assume no liability for damage to XServer accounts, domains, or server data arising from the use of this software (see MIT License). Your `XSERVER_API_KEY` is issued and managed by you; this project never collects, relays, or forwards it to third parties.

## Tools

All tools accept internationalized domain names (IDN) directly; they are normalized to Punycode before being sent to XServer (`src/tools/domain.ts`). Write-type responses include the `resolved_domain` / `resolved_mail_address` actually sent. **`host` and `content` of DNS records are labels / arbitrary strings and are not normalized.**

### toolset: `mail`

| Tool                     | Method | Path                                                             |
| ------------------------ | ------ | ---------------------------------------------------------------- |
| `list_mail_accounts`     | GET    | `/v1/server/{sv}/mail`                                           |
| `create_mail_account`    | POST   | `/v1/server/{sv}/mail`                                           |
| `get_mail_account`       | GET    | `/v1/server/{sv}/mail/{mail_account}`                            |
| `update_mail_account`    | PUT    | `/v1/server/{sv}/mail/{mail_account}`                            |
| `delete_mail_account`    | DELETE | `/v1/server/{sv}/mail/{mail_account}` (requires `confirm: true`) |
| `get_mail_forwarding`    | GET    | `/v1/server/{sv}/mail/{mail_account}/forwarding`                 |
| `update_mail_forwarding` | PUT    | `/v1/server/{sv}/mail/{mail_account}/forwarding`                 |

### toolset: `server`

| Tool               | Method | Path                                |
| ------------------ | ------ | ----------------------------------- |
| `get_server_info`  | GET    | `/v1/server/{sv}/server-info`       |
| `get_server_usage` | GET    | `/v1/server/{sv}/server-info/usage` |

The `domain_validation_token` contained in `get_server_info`'s response is used for TXT-based domain verification (`_xserver-verify.{domain}` set to `xserver-verify={token}`).

### toolset: `dns`

| Tool                | Method | Path                                                      |
| ------------------- | ------ | --------------------------------------------------------- |
| `list_dns_records`  | GET    | `/v1/server/{sv}/dns`                                     |
| `create_dns_record` | POST   | `/v1/server/{sv}/dns`                                     |
| `update_dns_record` | PUT    | `/v1/server/{sv}/dns/{dns_id}`                            |
| `delete_dns_record` | DELETE | `/v1/server/{sv}/dns/{dns_id}` (requires `confirm: true`) |

### toolset: `domain_verification` (composite)

| Tool                                    | Summary                                                                                                                                                                              |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `ensure_domain_verified`                | Brings the `_xserver-verify.{domain}` TXT record in line with the current `domain_validation_token`. No-op if a matching record already exists.                                      |
| `create_mail_account_with_verification` | Single-call high-level tool for mail-address creators: checks existing account → `ensure_domain_verified` → `POST /mail` (retries up to `verification_wait_ms` for TXT propagation). |

`servername` (`{sv}`) is fixed via `XSERVER_SERVERNAME` in `.env` and is not passed as an argument to any tool.

### Error response format

On failure every tool returns the following normalized shape (with MCP's `isError: true`):

```json
{
  "error": "XserverValidationError: Input is invalid",
  "code": "VALIDATION_ERROR",
  "detail": {
    "status": 422,
    "body": { "error": { "code": "VALIDATION_ERROR", "message": "...", "errors": [...] } },
    "errors": ["mail_address is required"],
    "retry_after_seconds": 3,              // 429 only
    "rate_limit": { "remaining": 0 }       // 429 only
  }
}
```

`code` is one of the official spec values: `BAD_REQUEST` / `UNAUTHORIZED` / `FORBIDDEN` / `NOT_FOUND` / `OPERATION_ERROR` / `VALIDATION_ERROR` / `RATE_LIMIT_EXCEEDED` / `INTERNAL_ERROR` / `BACKEND_ERROR` / `API_ERROR`. The high-level `domain_verification` tools may additionally return `DOMAIN_VERIFICATION_TIMEOUT` / `ALREADY_EXISTS`.

## Prerequisites

- Node.js **24 or newer** (per `package.json` `engines`)
- An **API key** issued in the Xserver server panel
  - How to issue: [Xserver manual "API key"](https://www.xserver.ne.jp/manual/man_tool_api.php) (mirror: [support site version](https://support.xserver.ne.jp/manual/man_tool_api.php)) — both are in Japanese

## Install

### From npm (recommended)

Published as [`xserver-mcp-server`](https://www.npmjs.com/package/xserver-mcp-server) on npm. Most users don't need to clone the source — your MCP client can launch it directly via `npx` (see [Use with Claude Code / Claude Desktop](#use-with-claude-code--claude-desktop)).

You can also install globally to run it as a CLI:

```bash
npm install -g xserver-mcp-server
XSERVER_API_KEY=xxx XSERVER_SERVERNAME=sv12345.xserver.jp xserver-mcp-server
```

### From source (for development / debugging)

```bash
git clone https://github.com/Mink16/xserver-mcp.git
cd xserver-mcp
cp .env.example .env
# Fill in XSERVER_API_KEY and XSERVER_SERVERNAME with real values

npm ci
npm run build
```

Note: `.env` is not auto-loaded when launched via `npx` or a global install (it is CWD-dependent). When started from an MCP client, pass the values via the `env` field of the client config (see below).

### Environment variables

| Variable                          | Required | Default                     | Purpose                                                                                                  |
| --------------------------------- | -------- | --------------------------- | -------------------------------------------------------------------------------------------------------- |
| `XSERVER_API_KEY`                 | ✅       | —                           | Bearer token for the Xserver API (issue in server panel → API)                                           |
| `XSERVER_SERVERNAME`              | ✅       | —                           | Server name (e.g. `sv12345.xserver.jp`)                                                                  |
| `XSERVER_BASE_URL`                |          | `https://api.xserver.ne.jp` | API base URL (override for testing)                                                                      |
| `XSERVER_HTTP_CONCURRENCY`        |          | `3`                         | Concurrency limit. Kept conservative relative to per-plan limits (Standard 5 / Premium 10 / Business 20) |
| `XSERVER_HTTP_RETRY_MAX_ATTEMPTS` |          | `2`                         | Total attempts on 429. Set to `1` to disable retry.                                                      |
| `XSERVER_HTTP_RETRY_MAX_WAIT_SEC` |          | `10`                        | If `Retry-After` exceeds this many seconds, return immediately instead of retrying.                      |
| `ENABLE_TOOLSETS`                 |          | (all enabled)               | Comma-separated toolset names to enable: `mail` / `server` / `dns` / `domain_verification`               |

## Use with Claude Code / Claude Desktop

### From npm (recommended)

Add the following to your `.mcp.json` or `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "xserver": {
      "command": "npx",
      "args": ["-y", "xserver-mcp-server"],
      "env": {
        "XSERVER_API_KEY": "your-api-key",
        "XSERVER_SERVERNAME": "sv12345.xserver.jp"
      }
    }
  }
}
```

All other env vars (`XSERVER_HTTP_CONCURRENCY`, etc.) are optional and fall back to their defaults.

### From a local source build

If you cloned the repo (e.g. for development):

```json
{
  "mcpServers": {
    "xserver": {
      "command": "node",
      "args": ["/absolute/path/to/xserver-mcp/build/index.js"]
    }
  }
}
```

With this form, `.env` is auto-loaded from the CWD, so you can skip the `env` field — but MCP clients differ in how they set CWD, so explicitly listing values in `env` is the safer choice.

To spawn it from another MCP server as a child process, use either `npx -y xserver-mcp-server` or `node <path>/build/index.js`. Relative paths are resolved against the caller's CWD.

## Development

```bash
npm run test:watch    # TDD
npm run typecheck     # tsc --noEmit
npm run dev           # tsx direct execution (no build needed)
```

### OpenAPI spec (developer reference)

The official Xserver OpenAPI spec (`docs/xserver-openapi.json`) is **not** committed for copyright reasons (it is gitignored). If you want to consult it during development, fetch it yourself from the [official documentation](https://developer.xserver.ne.jp/api/server/) and place it at `docs/xserver-openapi.json`. It is not required for build or test.

### MCP Inspector

```bash
npm run build
npx @modelcontextprotocol/inspector node build/index.js
```

The browser opens; call each tool from the `Tools` tab.

## Testing

- Vitest. `npm test` for full suite, `npm run test:coverage` for coverage.
- `global.fetch` is mocked via `tests/helpers/mockFetch.ts` to assert URL / method / body / headers of HTTP calls.
- Each tool is covered by success / input schema validation / API error scenarios.

## Contributing

We follow a strict TDD (RED → GREEN → REFACTOR) cycle. See [`.claude/rules/tdd-workflow.md`](./.claude/rules/tdd-workflow.md) for the full workflow, agent responsibilities, and completion gates. PR checklist is in [`.claude/rules/pull-requests.md`](./.claude/rules/pull-requests.md).

`CLAUDE.md` and the files under `.claude/` (`rules/` / `agents/` / `skills/`) are context files consumed by LLM agents such as Claude Code. They also serve as human documentation of this repository's design decisions and operating policy.

See [CONTRIBUTING.md](./CONTRIBUTING.md) for the contributor-facing summary.

## Versioning

Change history is tracked in [`CHANGELOG.md`](./CHANGELOG.md) in [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) format.

This project will follow [Semantic Versioning](https://semver.org/) eventually, but **while we are on `0.x` we do not guarantee compatibility** — breaking changes (tool rename, input / output schema, error codes, ...) may appear even in minor version bumps. Full SemVer kicks in from `1.0.0`.

## Code of Conduct

Behavior in Issues / PRs / Discussions is governed by [Contributor Covenant v2.1](./CODE_OF_CONDUCT.md).

Security vulnerabilities must **not** be filed as public issues. Follow the private disclosure procedure in [`SECURITY.md`](./SECURITY.md).

## License

[MIT](./LICENSE)
