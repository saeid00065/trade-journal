# drnoob MetaTrader bridge

This Cloudflare Worker accepts **read-only closed-trade** records from an MT4/MT5 Expert Advisor and stores them in D1. It never receives broker passwords and cannot place, modify, or close orders.

Open the Worker URL in a browser to sign in to the read-only dashboard. The dashboard password is stored in Cloudflare as `PANEL_PASSWORD`; it is separate from the ingestion token.

## Endpoints

- `GET /health` returns the Worker status.
- `POST /v1/trades` writes one trade object or an array of trade objects.
- `GET /v1/trades?accountId=...` retrieves the latest 500 records for an account.

All trade endpoints require `Authorization: Bearer <INGEST_TOKEN>`.

## MCP endpoint

An authenticated Streamable HTTP MCP endpoint is available at `https://drnoob.saeid00065.workers.dev/mcp`. Configure an MCP client with the same bearer token used by the EA. It exposes `list_mt5_accounts` and `list_mt5_trades`, both read-only tools over the synced D1 records.

## MetaTrader payload

Configure an Expert Advisor to POST closed deals to `https://drnoob.<your-subdomain>.workers.dev/v1/trades` with this JSON:

```json
{
  "accountId": "your-mt-account-number",
  "ticket": "123456",
  "symbol": "EURUSD",
  "side": "buy",
  "volume": 0.1,
  "openTime": "2026-10-09T09:00:00Z",
  "closeTime": "2026-10-09T10:00:00Z",
  "openPrice": 1.161,
  "closePrice": 1.162,
  "profit": 10.0,
  "commission": -0.7,
  "swap": 0
}
```

In MT4/MT5, add the Worker origin to **Tools → Options → Expert Advisors → Allow WebRequest for listed URL**. Keep the ingest token in the EA input settings, never in source control.

## MT5 Expert Advisor

Copy `metatrader/DrnoobTradeSync.mq5` to `MQL5/Experts`, compile it in MetaEditor, and attach it to any chart. Set its `ApiToken` input to the Worker ingest token. It sends completed buy and sell deals every 60 seconds and cannot trade, modify orders, or access your broker password.

On its first run, the EA imports up to ten years of closed history. Set `InitialHistoryDays` to a larger number before attaching it if your account is older.
