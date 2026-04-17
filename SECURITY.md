# Security Policy

## Supported Versions

Only the latest `main` branch receives security fixes.

| Version | Supported          |
| ------- | ------------------ |
| latest  | :white_check_mark: |
| others  | :x:                |

## Reporting a Vulnerability

**Do NOT open a public GitHub issue for security vulnerabilities.**

Please report security vulnerabilities privately via **GitHub Security Advisories**:

<https://github.com/Mink16/xserver-mcp/security/advisories/new>

If GitHub Security Advisories is not accessible, you may contact the maintainer directly on GitHub: [@Mink16](https://github.com/Mink16).

Please include:

- Affected version / commit SHA
- Steps to reproduce
- Expected vs. actual behavior
- Potential impact (e.g., credential exposure, RCE, data loss)

We will acknowledge the report within **7 days** and aim to provide an initial assessment within **30 days**. Coordinated disclosure is appreciated — please refrain from publishing details until a fix is released.

## Security Considerations

This server requires an Xserver API key (`XSERVER_API_KEY`). When running:

- Keep the key in `.env` (gitignored) — never commit it.
- The key is sent only to the configured `XSERVER_BASE_URL` (default `https://api.xserver.ne.jp`) as a `Bearer` token.
- Error responses returned to the MCP client include the raw response body; the HTTP client is designed not to include request headers (including the token) in the error payload. See `src/client/errors.ts` and `src/tools/helpers.ts`.

## If your API key is leaked

鍵が漏洩した、または漏洩の疑いがあるときは次の順で対応してください。

1. **即座に鍵を無効化する**: Xserver サーバーパネル → 「API」 → 該当キーを削除。公式マニュアル: <https://www.xserver.ne.jp/manual/man_tool_api.php>
2. **新しい鍵を発行して `.env` を差し替え**、古い鍵を参照しているプロセスを再起動。
3. **被害確認**: サーバーパネルの操作ログ・メールアカウント一覧・DNS レコード一覧を点検し、身に覚えのない変更がないか確認。異常があれば Xserver サポートへ連絡。
4. **再発防止**: git 履歴に鍵が混入した場合は `git filter-repo` 等で履歴から除去し force-push。ただし **既に push 済の鍵は漏洩済み**として扱い、必ず 1 を先に実施すること。

本リポジトリは API キーを一切収集・中継しません。鍵はユーザーが発行・保管・失効まで責任を持って管理してください。
