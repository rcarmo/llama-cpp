# llama-ui-search-mcp

Tiny stdio MCP server for llama-ui, based on `rcarmo/umcp`.

Tools:

- `search_web(query, limit=5, fetch=false, fetch_limit=2, searx_url="http://192.168.1.100:3080/search", timeout=15)`
- `fetch_url(url, timeout=15, max_chars=12000)` — fetch a specific URL and return extracted Markdown content

Manual stdio smoke tests:

```bash
echo '{"jsonrpc":"2.0","method":"tools/list","id":1}' | /workspace/tools/llama-ui-search-mcp/search_mcp.py

echo '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"search_web","arguments":{"query":"llama.cpp tools MCP","limit":3}},"id":2}' \
  | /workspace/tools/llama-ui-search-mcp/search_mcp.py

echo '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"fetch_url","arguments":{"url":"https://example.com"}},"id":3}' \
  | /workspace/tools/llama-ui-search-mcp/search_mcp.py
```

Example MCP client config:

```json
{
  "mcpServers": {
    "web-search": {
      "command": "/workspace/tools/llama-ui-search-mcp/search_mcp.py",
      "args": []
    }
  }
}
```
