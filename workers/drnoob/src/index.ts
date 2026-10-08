export interface Env {
  TRADES: D1Database;
  INGEST_TOKEN: string;
}

type Trade = {
  accountId: string;
  ticket: string | number;
  symbol: string;
  side: "buy" | "sell";
  volume: number;
  closeTime: string;
  profit: number;
  openTime?: string;
  openPrice?: number;
  closePrice?: number;
  commission?: number;
  swap?: number;
};

const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

function authorized(request: Request, env: Env) {
  return request.headers.get("Authorization") === `Bearer ${env.INGEST_TOKEN}`;
}

function validTrade(value: unknown): value is Trade {
  if (!value || typeof value !== "object") return false;
  const trade = value as Record<string, unknown>;
  return (
    typeof trade.accountId === "string" &&
    (typeof trade.ticket === "string" || typeof trade.ticket === "number") &&
    typeof trade.symbol === "string" &&
    (trade.side === "buy" || trade.side === "sell") &&
    typeof trade.volume === "number" &&
    typeof trade.closeTime === "string" &&
    typeof trade.profit === "number"
  );
}

export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/health") return json({ ok: true });
    if (!authorized(request, env)) return json({ error: "Unauthorized" }, 401);

    if (request.method === "POST" && url.pathname === "/v1/trades") {
      let payload: unknown;
      try {
        payload = await request.json();
      } catch {
        return json({ error: "Body must be JSON" }, 400);
      }
      const trades = Array.isArray(payload) ? payload : [payload];
      if (!trades.length || !trades.every(validTrade)) {
        return json({ error: "Invalid trade payload" }, 400);
      }
      const statements = trades.map((trade) =>
        env.TRADES.prepare(
          `INSERT INTO mt_trades (account_id, ticket, symbol, side, volume, open_time, close_time, open_price, close_price, profit, commission, swap)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(account_id, ticket) DO UPDATE SET symbol=excluded.symbol, side=excluded.side, volume=excluded.volume, open_time=excluded.open_time, close_time=excluded.close_time, open_price=excluded.open_price, close_price=excluded.close_price, profit=excluded.profit, commission=excluded.commission, swap=excluded.swap, received_at=CURRENT_TIMESTAMP`,
        ).bind(trade.accountId, String(trade.ticket), trade.symbol, trade.side, trade.volume, trade.openTime ?? null, trade.closeTime, trade.openPrice ?? null, trade.closePrice ?? null, trade.profit, trade.commission ?? 0, trade.swap ?? 0),
      );
      await env.TRADES.batch(statements);
      return json({ imported: trades.length }, 201);
    }

    if (request.method === "GET" && url.pathname === "/v1/trades") {
      const accountId = url.searchParams.get("accountId");
      if (!accountId) return json({ error: "accountId is required" }, 400);
      const result = await env.TRADES.prepare(
        "SELECT * FROM mt_trades WHERE account_id = ? ORDER BY close_time DESC LIMIT 500",
      ).bind(accountId).all();
      return json({ trades: result.results });
    }
    return json({ error: "Not found" }, 404);
  },
} satisfies ExportedHandler<Env>;
