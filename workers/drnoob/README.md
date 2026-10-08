# drnoob MetaTrader bridge

This Cloudflare Worker accepts **read-only closed-trade** records from an MT4/MT5 Expert Advisor and stores them in D1. It never receives broker passwords and cannot place, modify, or close orders.

## Endpoints

- `GET /health` returns the Worker status.
- `POST /v1/trades` writes one trade object or an array of trade objects.
- `GET /v1/trades?accountId=...` retrieves the latest 500 records for an account.

All trade endpoints require `Authorization: Bearer <INGEST_TOKEN>`.

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
