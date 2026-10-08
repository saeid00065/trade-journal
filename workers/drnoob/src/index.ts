export interface Env {
  TRADES: D1Database;
  INGEST_TOKEN: string;
  PANEL_PASSWORD: string;
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

const textEncoder = new TextEncoder();

async function sessionValue(env: Env) {
  const key = await crypto.subtle.importKey(
    "raw",
    textEncoder.encode(env.INGEST_TOKEN),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, textEncoder.encode("drnoob-panel"));
  return btoa(String.fromCharCode(...new Uint8Array(signature)));
}

async function panelAuthorized(request: Request, env: Env) {
  const session = request.headers
    .get("Cookie")
    ?.split(";")
    .map((cookie) => cookie.trim())
    .find((cookie) => cookie.startsWith("drnoob_session="))
    ?.slice("drnoob_session=".length);
  return session === (await sessionValue(env));
}

const escapeHtml = (value: unknown) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

function loginPage(error = "") {
  return `<!doctype html><title>drnoob | Sign in</title><style>${styles}</style><main class="login"><h1>drnoob</h1><p>MetaTrader trade journal</p>${error ? `<p class="error">${error}</p>` : ""}<form method="post" action="/login"><label>Password<input name="password" type="password" autofocus required></label><button>Sign in</button></form></main>`;
}

const styles = `body{margin:0;background:#07111d;color:#e7eef7;font:16px system-ui,sans-serif}main{max-width:1100px;margin:0 auto;padding:32px}h1{margin:0;color:#6ee7b7}p{color:#9fb0c3}.login{max-width:360px;margin:12vh auto}.login form,.toolbar{display:grid;gap:14px}label{display:grid;gap:6px}input{padding:11px;border-radius:7px;border:1px solid #29445f;background:#0d1c2c;color:inherit}button{padding:11px 16px;border:0;border-radius:7px;background:#34d399;color:#042015;font-weight:700;cursor:pointer}.error{color:#fca5a5}header{display:flex;justify-content:space-between;align-items:center;gap:16px}.toolbar{grid-template-columns:1fr auto;max-width:550px;margin:28px 0}table{width:100%;border-collapse:collapse;background:#0b1827}th,td{padding:12px;text-align:left;border-bottom:1px solid #19334b}th{color:#9fb0c3;font-size:13px}@media(max-width:700px){main{padding:20px;overflow:auto}.toolbar{grid-template-columns:1fr}header{align-items:flex-start;flex-direction:column}}`;

async function dashboard(request: Request, env: Env) {
  const url = new URL(request.url);
  const accountId = url.searchParams.get("accountId")?.trim() ?? "";
  let rows: Record<string, unknown>[] = [];
  if (accountId) {
    rows = (await env.TRADES.prepare(
      "SELECT ticket, symbol, side, volume, close_time, profit, commission, swap FROM mt_trades WHERE account_id = ? ORDER BY close_time DESC LIMIT 500",
    ).bind(accountId).all()).results as Record<string, unknown>[];
  }
  const body = rows.length
    ? rows.map((trade) => `<tr><td>${escapeHtml(trade.close_time)}</td><td>${escapeHtml(trade.symbol)}</td><td>${escapeHtml(trade.side)}</td><td>${escapeHtml(trade.volume)}</td><td>${escapeHtml(trade.profit)}</td><td>${escapeHtml(trade.commission)}</td><td>${escapeHtml(trade.swap)}</td></tr>`).join("")
    : accountId ? `<tr><td colspan="7">No synced closed trades for this account.</td></tr>` : "";
  return new Response(`<!doctype html><title>drnoob | Trade journal</title><style>${styles}</style><main><header><div><h1>drnoob</h1><p>Read-only MetaTrader trade journal</p></div><form method="post" action="/logout"><button>Sign out</button></form></header><form class="toolbar" method="get"><input name="accountId" value="${escapeHtml(accountId)}" placeholder="MetaTrader account number" required><button>View trades</button></form>${accountId ? `<p>${rows.length} most recent closed trades for account ${escapeHtml(accountId)}</p><table><thead><tr><th>Closed</th><th>Symbol</th><th>Side</th><th>Volume</th><th>Profit</th><th>Commission</th><th>Swap</th></tr></thead><tbody>${body}</tbody></table>` : "<p>Enter the MetaTrader account number used by the Expert Advisor.</p>"}</main>`, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}

type McpRequest = { id?: string | number | null; method?: string; params?: Record<string, unknown> };

const mcpResponse = (id: McpRequest["id"], result: unknown) =>
  Response.json({ jsonrpc: "2.0", id: id ?? null, result });

const mcpError = (id: McpRequest["id"], code: number, message: string) =>
  Response.json({ jsonrpc: "2.0", id: id ?? null, error: { code, message } });

async function mcp(request: Request, env: Env) {
  let message: McpRequest;
  try {
    message = await request.json();
  } catch {
    return mcpError(null, -32700, "Invalid JSON");
  }
  if (message.method === "initialize") {
    return mcpResponse(message.id, {
      protocolVersion: "2025-06-18",
      capabilities: { tools: {} },
      serverInfo: { name: "drnoob-mt5", version: "1.0.0" },
    });
  }
  if (message.method === "notifications/initialized") return new Response(null, { status: 202 });
  if (message.method === "tools/list") {
    return mcpResponse(message.id, {
      tools: [
        { name: "list_mt5_accounts", description: "List MetaTrader accounts with synced closed-trade counts.", inputSchema: { type: "object", properties: {}, additionalProperties: false } },
        { name: "list_mt5_trades", description: "List recent closed trades for one synced MetaTrader account.", inputSchema: { type: "object", properties: { accountId: { type: "string", description: "MetaTrader account number" }, limit: { type: "number", minimum: 1, maximum: 500 } }, required: ["accountId"], additionalProperties: false } },
      ],
    });
  }
  if (message.method === "tools/call") {
    const name = message.params?.name;
    const args = (message.params?.arguments ?? {}) as Record<string, unknown>;
    if (name === "list_mt5_accounts") {
      const accounts = (await env.TRADES.prepare("SELECT account_id, COUNT(*) AS trade_count, MAX(close_time) AS latest_close FROM mt_trades GROUP BY account_id ORDER BY latest_close DESC").all()).results;
      return mcpResponse(message.id, { content: [{ type: "text", text: JSON.stringify(accounts) }] });
    }
    if (name === "list_mt5_trades" && typeof args.accountId === "string") {
      const limit = typeof args.limit === "number" ? Math.max(1, Math.min(500, Math.floor(args.limit))) : 100;
      const trades = (await env.TRADES.prepare("SELECT * FROM mt_trades WHERE account_id = ? ORDER BY close_time DESC LIMIT ?").bind(args.accountId, limit).all()).results;
      return mcpResponse(message.id, { content: [{ type: "text", text: JSON.stringify(trades) }] });
    }
    return mcpError(message.id, -32602, "Unknown tool or invalid arguments");
  }
  return mcpError(message.id, -32601, "Method not found");
}

export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/health") return json({ ok: true });
    if (url.pathname === "/login" && request.method === "POST") {
      const form = await request.formData();
      if (form.get("password") !== env.PANEL_PASSWORD) return new Response(loginPage("Incorrect password."), { status: 401, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
      return new Response(null, { status: 303, headers: { Location: "/", "Set-Cookie": `drnoob_session=${await sessionValue(env)}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=28800` } });
    }
    if (url.pathname === "/logout" && request.method === "POST") return new Response(null, { status: 303, headers: { Location: "/", "Set-Cookie": "drnoob_session=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0" } });
    if (url.pathname === "/") return (await panelAuthorized(request, env)) ? dashboard(request, env) : new Response(loginPage(), { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
    if (!authorized(request, env)) return json({ error: "Unauthorized" }, 401);
    if (request.method === "POST" && url.pathname === "/mcp") return mcp(request, env);

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
