# drnoob MT5 Codex plugin

This plugin connects Codex to the read-only `drnoob` MCP server for synced MetaTrader 5 trades.

Before installing, create the environment variable `DRNOOB_MCP_TOKEN` with the Worker ingestion token. The token is never stored in this repository.

The plugin provides `list_mt5_accounts` and `list_mt5_trades` through the deployed MCP endpoint.
