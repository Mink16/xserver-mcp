---
name: tdd-test-scaffold
description: xserver-mcp で新しい MCP tool (`src/tools/<domain>/<toolName>.ts`) を TDD で追加するとき、先に書くべき失敗テスト (RED) `tests/tools/<domain>/<toolName>.test.ts` の雛形を 3 種カバー (正常系 + 入力検証 + API エラー) + ツール種別に応じた追加テスト (IDN 正規化・`confirm: z.literal(true)` 破壊的ガード・`resolved_domain` レスポンス・rate limit・409 OPERATION_ERROR) で一撃生成し、`npm test` で RED 確認まで終わらせる。`installFetchMock` / `makeContext` の正しい使い方、公式エラー形式 `{ error: { code, message, errors } }` の fixture、transport のみモック (semaphore/retry は本番ロジック) の原則を守る。ユーザーが「新ツール追加」「RED テスト雛形」「TDD スキャフォルド」「test-writer が書く」「MSW fixture 用意」「delete_* の confirm ガードテスト」「IDN テスト書いて」等に触れたら必ず起動する。`test-writer` / `tdd-developer` サブエージェントの RED フェーズで繰り返される定型作業を一撃で終わらせる用途。
---

# tdd-test-scaffold

xserver-mcp で新しい MCP tool を TDD で追加するとき、RED フェーズの定型作業 ——「テストファイルを作って 3 ケース書いて MSW fixture 組んで IDN アサート入れて destructive ガード確認して」—— を 1 回のやり取りで済ませるスキル。出力は `tests/tools/<domain>/<toolName>.test.ts` **のみ**。実装 (`src/`) は絶対に書かない。

## When to use

次のいずれかに当てはまる場面で**必ず**起動する:

- 新しい MCP tool を追加する (`src/tools/<domain>/<tool>.ts` を新設する、または `tests/tools/...` の新規テストファイルを書く)
- 既存ツールにケース追加 (新しい引数・エラーケース・IDN 対応・破壊的ガード追加など)
- ユーザーが「RED」「テスト雛形」「TDD スキャフォルド」「failing test 書いて」と言った
- `test-writer` または `tdd-developer` サブエージェントとして RED を書き始めた

## When NOT to use

- 既存テストの refactor だけ (ファイル読み込んで直接 Edit で十分)
- `src/client/` 層の変更 (transport/retry は integration テストの責務)
- `docs/` / `.claude/rules/` のみの変更

## Pre-scaffold interview

スキャフォルド生成前に、以下を明確化する。ユーザーが既に与えていたら省略。複数不明なときは 1 回のメッセージにまとめて聞く。

1. **tool 名 (camelCase)** — 例: `createDnsRecord`, `deleteMailAccountBulk`, `updateDnsRecord`
   - ファイル名 (`src/tools/<domain>/<name>.ts`, `tests/tools/<domain>/<name>.test.ts`) はこの camelCase
   - MCP 登録名 (`create_dns_record` など snake_case) は `tool.name` プロパティで指定され、`describe()` のラベルもこちら
2. **domain** — 既存の `mail` / `dns` / `server` / `domainVerification`、または新規
3. **HTTP method + endpoint path** — 例: `POST /v1/server/{servername}/dns`, `DELETE /v1/server/{servername}/mail/{mail_account}`
4. **ツール種別** — `read (GET)` / `write (POST/PUT/PATCH)` / `destructive (DELETE)` / `composite (複数 primitive を内部呼び出しする高レベルツール)`
5. **IDN 入力を受けるか** — input に `domain` または `mail_address` を持つか

不明点は endpoint を `docs/xserver-openapi.json` で lookup して推測できる。

## Common skeleton (全パターン共通)

`installFetchMock` は global `fetch` を `vi.fn()` ベースのスタブに差し替える単純なモック (MSW ではない)。`makeContext` は `apiKey: "test-key"`, `servername: "sv.example"`, `retry.maxAttempts: 1` の `ToolContext` を返す。

```typescript
import { afterEach, describe, expect, it } from "vitest";
import { <toolName>Tool } from "../../../src/tools/<domain>/<toolName>.js";
import { installFetchMock } from "../../helpers/mockFetch.js";
import { makeContext } from "../../helpers/toolContext.js";

describe("<mcp_tool_name>", () => {  // snake_case — MCP 登録名と一致
  let restore: (() => void) | undefined;
  afterEach(() => restore?.());

  // 以下に 3+ ケースを書く
});
```

`.js` 拡張子 (NodeNext ESM) は必須。省略するとビルドで落ちる。

## Pattern selector

ツール種別に応じて以下のテンプレから適したものを選ぶ。全パターンで**最低 3 ケース** (正常系 + 入力検証 + API エラー) を含める。

### Pattern A: Read (GET)

```typescript
it("GETs <endpoint> and returns <shape> as JSON text", async () => {
  const { calls, restore: r } = installFetchMock({
    body: { /* 代表的な成功レスポンス — OpenAPI の responses["200"] に一致させる */ },
  });
  restore = r;

  const tool = <toolName>Tool();
  const result = await tool.handler({ /* valid input */ }, makeContext());

  expect(calls[0]?.method).toBe("GET");
  expect(calls[0]?.url).toBe("https://api.xserver.ne.jp/v1/server/sv.example<path>");
  expect(result.isError).toBeUndefined();
  const body = JSON.parse(result.content[0]?.text ?? "");
  expect(body).toEqual({ /* 期待する JSON */ });
});

it("input schema rejects <invalid case>", () => {
  const tool = <toolName>Tool();
  expect(tool.inputSchema.<field>.safeParse(<invalid>).success).toBe(false);
  expect(tool.inputSchema.<field>.safeParse(<valid>).success).toBe(true);
});

it("returns isError on <status> <CODE>", async () => {
  const { restore: r } = installFetchMock({
    status: <status>,
    body: { error: { code: "<CODE>", message: "<msg>" } },
  });
  restore = r;

  const tool = <toolName>Tool();
  const result = await tool.handler({ /* valid input */ }, makeContext());

  expect(result.isError).toBe(true);
  const body = JSON.parse(result.content[0]?.text ?? "");
  expect(body.code).toBe("<CODE>");
});
```

クエリパラメータ付きツールなら「query パラメータが URL に正しく含まれる」ケースを 1 つ追加:

```typescript
it("passes <param> query parameter when provided", async () => {
  const { calls, restore: r } = installFetchMock({ body: { /* ... */ } });
  restore = r;
  const tool = <toolName>Tool();
  await tool.handler({ <param>: "foo" }, makeContext());
  expect(calls[0]?.url).toContain("<param>=foo");
});
```

### Pattern B: Write (POST/PUT/PATCH)

Pattern A に加えて:

**リクエストボディ検証** (正常系に組み込む):

```typescript
expect(calls[0]?.method).toBe("POST");
expect(calls[0]?.body).toEqual({
  /* 送信される正規化後の body */
});
```

**422 バリデーションエラー** を API エラーケースとして優先。`errors[]` の propagation を検証:

```typescript
it("returns VALIDATION_ERROR with errors[] on 422", async () => {
  const { restore: r } = installFetchMock({
    status: 422,
    body: {
      error: {
        code: "VALIDATION_ERROR",
        message: "検証エラー",
        errors: ["mail_address は必須です"],
      },
    },
  });
  restore = r;
  const tool = <toolName>Tool();
  const result = await tool.handler(
    {
      /* valid input */
    },
    makeContext(),
  );

  expect(result.isError).toBe(true);
  const body = JSON.parse(result.content[0]?.text ?? "");
  expect(body.code).toBe("VALIDATION_ERROR");
  expect(body.detail.errors).toEqual(["mail_address は必須です"]);
});
```

IDN 入力を受ける場合は「IDN assertion」セクションを必ず追加。

### Pattern C: Destructive (DELETE / その他の破壊的)

Pattern B に加えて、以下 2 ケースを**必ず**含める:

```typescript
it("input schema rejects confirm !== true", () => {
  const tool = <toolName>Tool();
  expect(tool.inputSchema.confirm.safeParse(false).success).toBe(false);
  expect(tool.inputSchema.confirm.safeParse(true).success).toBe(true);
});

it("annotations mark destructive", () => {
  const tool = <toolName>Tool();
  expect(tool.annotations?.destructiveHint).toBe(true);
  // idempotent な DELETE なら idempotentHint: true も
});
```

正常系では `confirm: true` を明示的に渡す:

```typescript
const result = await tool.handler(
  { /* ... */, confirm: true },
  makeContext(),
);
```

破壊的ガードは zod の `z.literal(true)` で強制する設計。MCP クライアント側でもこの型に従って UI 警告を出す。

### Pattern D: Composite (高レベルツール、複数 primitive を内部で呼ぶ)

`createMailAccountWithVerification` のようなポーリング付きツールは、`installFetchMock` の `queue` でレスポンス系列をテスト:

```typescript
const { restore: r } = installFetchMock({
  queue: [
    {
      status: 409,
      body: {
        error: {
          code: "OPERATION_ERROR",
          message: "TXTレコードによるドメイン認証に失敗しました。",
        },
      },
    },
    {
      status: 409,
      body: {
        error: {
          code: "OPERATION_ERROR",
          message: "TXTレコードによるドメイン認証に失敗しました。",
        },
      },
    },
    { status: 200, body: { message: "作成しました" } },
  ],
});
```

Composite 固有の code (`DOMAIN_VERIFICATION_TIMEOUT`, `ALREADY_EXISTS` 等) は `normalizedErrorResult` で返す。これらも正常系とは別ケースで検証する。

## IDN assertion (domain/mail_address を input に持つツール必須)

`toPunycodeDomain` / `normalizeMailAddress` が HTTP 送信前に効いていることをアサートする。入力は `例え.jp` / `user@例え.jp` を使う。

```typescript
it("normalizes IDN domain to Punycode before the HTTP call", async () => {
  const { calls, restore: r } = installFetchMock({
    body: {
      /* success */
    },
  });
  restore = r;

  const tool = <toolName>Tool();
  const result = await tool.handler({ domain: "例え.jp" /* その他必須 input */ }, makeContext());

  const sent = calls[0]?.body as { domain: string };
  expect(sent.domain.startsWith("xn--")).toBe(true);

  // write 系のみ: レスポンスに resolved_domain を含める
  const body = JSON.parse(result.content[0]?.text ?? "");
  expect(body.resolved_domain).toBe(sent.domain);
});
```

mail_address の場合:

```typescript
it("normalizes IDN domain in mail_address before sending", async () => {
  const { calls, restore: r } = installFetchMock({ body: { message: "ok" } });
  restore = r;

  const tool = <toolName>Tool();
  const result = await tool.handler({ mail_address: "user@例え.jp" /* 他 */ }, makeContext());

  const sent = calls[0]?.body as { mail_address: string };
  expect(sent.mail_address.startsWith("user@xn--")).toBe(true);

  const body = JSON.parse(result.content[0]?.text ?? "");
  expect(body.resolved_mail_address).toBe(sent.mail_address);
});
```

DELETE 系で URL パスに mail_address を含める場合は、IDN 正規化**後**に `encodeMailAccount` (`encodeURIComponent`) が効く順序をアサート:

```typescript
expect(calls[0]?.url).toMatch(/\/mail\/user%40xn--[a-z0-9-]+\.jp$/);
```

### 逆方向の注意 (バグの温床)

- **DNS レコードの `host` / `content` は絶対に Punycode 化しない**。ラベル・任意文字列だから。`toPunycodeDomain(args.host)` と書くのは即バグ。疑うなら `host: "日本語ラベル"` を渡して「変換されていない」ことを逆アサートするテストを追加する。
- `mail_address` の順序: `normalizeMailAddress` (domain 部のみ Punycode 化) → その後 `encodeMailAccount` (URL エンコード)。逆順は `%40` を Punycode 化する不正な結果になる。

## Fixture 形式リファレンス (installFetchMock の body)

| ステータス              | body 形                                                                  | 追加 header                                                                                              |
| ----------------------- | ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| 200 成功                | `{ /* raw 生 API レスポンス */ }`                                        | 不要                                                                                                     |
| 204 No Content          | `{}` or 省略                                                             | 不要 (`installFetchMock` が自動で空レスポンス)                                                           |
| 400 BAD_REQUEST         | `{ error: { code: "BAD_REQUEST", message: "..." } }`                     | 不要                                                                                                     |
| 401 UNAUTHORIZED        | `{ error: { code: "UNAUTHORIZED", message: "..." } }`                    | 不要                                                                                                     |
| 403 FORBIDDEN           | `{ error: { code: "FORBIDDEN", message: "..." } }`                       | 不要                                                                                                     |
| 404 NOT_FOUND           | `{ error: { code: "NOT_FOUND", message: "..." } }`                       | 不要                                                                                                     |
| 409 OPERATION_ERROR     | `{ error: { code: "OPERATION_ERROR", message: "..." } }`                 | 不要                                                                                                     |
| 422 VALIDATION_ERROR    | `{ error: { code: "VALIDATION_ERROR", message: "...", errors: [...] } }` | 不要                                                                                                     |
| 429 RATE_LIMIT_EXCEEDED | `{ error: { code: "RATE_LIMIT_EXCEEDED", message: "..." } }`             | `Retry-After`, `X-RateLimit-Limit`, `-Remaining`, `-Reset`, `-Concurrent-Limit`, `-Concurrent-Remaining` |
| 500 INTERNAL_ERROR      | `{ error: { code: "INTERNAL_ERROR", message: "..." } }`                  | 不要                                                                                                     |

旧形式 `{ "message": "..." }` のみも `errorFromResponse` がフォールバックでパースする。既存テストと混在しても問題ないが、新規テストでは上表の公式形式を使う。

429 の例:

```typescript
installFetchMock({
  status: 429,
  body: { error: { code: "RATE_LIMIT_EXCEEDED", message: "..." } },
  headers: {
    "Retry-After": "3",
    "X-RateLimit-Remaining": "0",
    "X-RateLimit-Concurrent-Remaining": "2",
  },
});
```

`retry_after_seconds` / `rate_limit.remaining` が `detail` に伝わることをアサート:

```typescript
expect(body.detail.retry_after_seconds).toBe(3);
expect(body.detail.rate_limit.remaining).toBe(0);
```

## Endpoint 情報の取得

`docs/xserver-openapi.json` が公式仕様。scaffold 作成前に以下で該当エンドポイントを確認:

```bash
jq '.paths["/v1/server/{servername}/<path>"]' docs/xserver-openapi.json
```

抽出すべき項目:

- HTTP method
- `requestBody.content["application/json"].schema.properties` → zod input schema の field 集合
- `requestBody.content["application/json"].schema.required` → zod required / optional
- `responses["200"]` → 正常系の mock body
- エラーレスポンスの出現状況 (`422`, `429`, `409`, `404` がどこに明記されているか)

仕様と CLAUDE.md が矛盾したら CLAUDE.md を優先する (現実挙動を記録しているため)。

## After scaffold (必ず実行する手順)

1. テストファイルを書き出した直後、対象だけ `npm test -- tests/tools/<domain>/<toolName>.test.ts` で実行する。
2. **RED を目視確認**する。失敗理由が次のどれになっていることを確認:
   - `Cannot find module '../../../src/tools/<domain>/<toolName>.js'` (import が解決しない = 実装ファイル未作成。これは想定通り)
   - `<toolName>Tool is not a function` (同上)
   - `Expected true, got false` など assertion での失敗 (実装部分完成だがまだ挙動未一致)
3. 失敗出力をユーザーにそのまま提示する (コピペ可能な形で)。
4. **実装コードは絶対に書かない**。RED 確認で止める。GREEN は `implementer` または `tdd-developer` の責務。`test-writer` として起動している場合は lead に `SendMessage` で引き継ぐ。

## Anti-patterns (これをやったら RED フェーズの意味が失われる)

- 🚫 実装ファイル (`src/tools/<domain>/<name>.ts`) を先に書く → テストが最初から通ってしまい RED 観測が不能
- 🚫 テストと実装を 1 コミットにまとめる → TDD ではなく「テスト後付け」
- 🚫 `installFetchMock` の代わりに `src/client/httpClient.ts` の関数をモックする → transport のみモックする原則に反する
- 🚫 `src/client/rateLimit.ts` のセマフォ・retry アルゴリズム自体をモックする → プロダクション挙動が検証不能になる
- 🚫 `.only` / `.skip` / `it.todo` をコミット → CI で無効化される
- 🚫 fixtures に実 `XSERVER_API_KEY` を埋める → `"test-key"` 等のプレースホルダ固定
- 🚫 DNS の `host` / `content` に対して IDN 正規化をアサートするテスト → 逆のアサート (非変換) が正しい
- 🚫 3 ケース未満の scaffold → 正常系 + 入力検証 + API エラーは RED の最低要件

## Related

- `.claude/rules/tdd-workflow.md` — TDD 全体ポリシー (RED → GREEN → REFACTOR)
- `.claude/agents/test-writer.md` — RED 専任エージェント本体 (このスキルの主な呼び出し元)
- `.claude/agents/tdd-developer.md` — ソロ型エージェント (こちらからも呼ばれる)
- `CLAUDE.md` — Xserver API の癖、`STATUS_TO_CODE` テーブル、IDN ルール、rate-limit ヘッダ、TXT verification 409 の扱い
- `tests/helpers/mockFetch.ts` — `installFetchMock` シグネチャ (`MockFetchInit`, `FetchCall`)
- `tests/helpers/toolContext.ts` — `makeContext` と `testConfig` (apiKey/servername/retry.maxAttempts)
