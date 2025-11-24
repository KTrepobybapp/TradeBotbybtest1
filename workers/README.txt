Bybit WebSocket Worker (Node.js)

Run locally:

1) Ensure env.local contains:
   - BYBIT_API_KEY
   - BYBIT_API_SECRET
   - BYBIT_TESTNET=true/false
   - SUPABASE_URL
   - SUPABASE_SERVICE_ROLE_KEY
   - SUPABASE_DEFAULT_USER_ID

2) Run:
   node workers/bybit-ws-worker.js

3) Optional: use a process manager (PM2) or Docker in production.