# OAuth Authorization для MCP TravelCode

## Проблема
Сейчас для работы MCP-сервера нужно вручную получить API-токен и прописать его в `.env`.
Агенты и браузеры не должны искать API-ключ — нужен удобный OAuth-флоу.

## Цель
Красивая кнопка / ссылка → переход на сайт TravelCode → "Вы согласны дать доступ?" → OK → токен возвращается автоматически.

## Ключевой вывод: два сценария

### Сценарий A: Stdio-транспорт (текущий)
По спецификации MCP, OAuth **не применяется** к stdio-транспортам. Для stdio:
- Токен берётся из окружения (env) — как сейчас
- НО можно добавить удобный CLI-флоу для получения токена: `npx mcp-travelcode auth`
- CLI открывает браузер → OAuth → сохраняет токен в keychain/файл → MCP-сервер подхватывает

### Сценарий B: HTTP-транспорт (Streamable HTTP) ← рекомендуемый путь
MCP OAuth 2.1 spec полностью применяется. MCP-клиент (Claude Desktop, Cursor) сам:
1. Получает 401 от сервера
2. Обнаруживает Authorization Server через Protected Resource Metadata
3. Регистрируется (Client ID Metadata Document / DCR)
4. Проводит Authorization Code + PKCE флоу
5. Получает токен и использует его

**Вывод: нужно перейти на HTTP-транспорт (Streamable HTTP) и реализовать MCP OAuth spec.**

## Архитектура

```
┌──────────────┐                      ┌───────────────────────┐
│  MCP Client  │  1. Request (no tok) │  MCP Server           │
│  (Claude,    │ ───────────────────→ │  (HTTP transport)     │
│   Cursor)    │                      │                       │
│              │  2. 401 + resource   │  Serves:              │
│              │     metadata URL     │  /.well-known/        │
│              │ ←─────────────────── │    oauth-protected-   │
│              │                      │    resource           │
│              │  3. Fetch metadata   │                       │
│              │ ───────────────────→ │  → authorization_     │
│              │ ←─────────────────── │    servers: [AS URL]  │
│              │                      └───────────────────────┘
│              │
│              │  4. Discover AS      ┌───────────────────────┐
│              │ ───────────────────→ │  Authorization Server │
│              │ ←─────────────────── │  (TravelCode / IdP)   │
│              │                      │                       │
│              │  5. Register client  │  /.well-known/        │
│              │ ───────────────────→ │    oauth-authorization│
│              │ ←─────────────────── │    -server            │
│              │                      │                       │
│              │  6. Auth Code+PKCE   │  /authorize           │
│              │ ───→ [Browser] ───→  │  /token               │
│              │ ←─── [Callback] ←──  │  /register (optional) │
│              │                      └───────────────────────┘
│              │
│              │  7. Bearer token     ┌───────────────────────┐
│              │ ───────────────────→ │  MCP Server (API)     │
│              │  8. Tool results     │  Validates token      │
│              │ ←─────────────────── │  Proxies to TravelCode│
└──────────────┘                      └───────────────────────┘
```

## Шаги реализации

### Фаза 0: Узнать OAuth-возможности TravelCode API ✅
- [x] Есть ли у TravelCode OAuth endpoints? — **ДА**
  - `GET /.well-known/oauth-authorization-server` — Server Metadata
  - `GET /oauth/authorize` — Authorization Endpoint (consent page)
  - `POST /oauth/token` — Token Endpoint
  - `POST /oauth/register` — Dynamic Client Registration
  - `POST /oauth/revoke` — Token Revocation
- [x] Формат токенов: **opaque** (случайные строки, не JWT)
- [x] PKCE: обязателен (S256)
- [x] Scopes: `flights:search`, `flights:status`, `flights:stats`, `airports:read`, `airlines:read`
- [x] TTL: access token 1ч, refresh token 30д, auth code 10мин
- [x] Refresh token rotation: да
- [x] DCR поддерживается
- [x] Документация: `docs/oauth-api-reference.md`, `docs/openapi-oauth.yml`

### Фаза 1: HTTP-транспорт ✅
- [x] Добавить Streamable HTTP транспорт (`src/http-server.ts`)
- [x] Express-сервер слушает на HTTP порте
- [x] CORS настроен
- [x] Health check: `GET /health`
- [x] Stdio-транспорт (`src/index.ts`) работает как раньше

### Фаза 2: Protected Resource Metadata ✅
- [x] `GET /.well-known/oauth-protected-resource` → указывает на TravelCode AS
- [x] При 401 возвращает `WWW-Authenticate: Bearer resource_metadata="..."`

### Фаза 3: Authorization Server ✅
**Реализован Вариант A — TravelCode сам AS:**
- [x] TravelCode реализовал полный OAuth 2.1 AS
- [x] MCP-клиент работает напрямую с TravelCode AS
- [x] Наш сервер — только Protected Resource, не прокси AS

### Фаза 4: Token handling в MCP-сервере ✅
- [x] Bearer token извлекается из HTTP-запросов
- [x] Per-session McpServer с токеном пользователя
- [x] Токен используется для запросов к TravelCode API
- [x] Примечание: токены opaque, валидируются TravelCode API (не JWKS)

### Фаза 5: Graceful fallback ✅
- [x] Stdio транспорт: env-токен работает как раньше (`npm start`)
- [x] HTTP транспорт: OAuth-флоу (`npm run start:http`)
- [ ] CLI-команда `auth` для интерактивного получения токена

## Важные требования из MCP OAuth spec

### MUST
- PKCE с S256 (не plain)
- Resource Indicators (RFC 8707) — в auth и token запросах
- HTTPS для всех AS endpoints
- Redirect URIs: только localhost или HTTPS
- Валидация audience токена
- НЕ передавать полученный токен дальше в upstream API (confused deputy)
- Refresh token rotation для public clients

### SHOULD
- State parameter для CSRF
- Короткоживущие access tokens
- Step-up authorization (403 + insufficient_scope)

## Технические детали

### Хранение токенов (для CLI-сценария)
- macOS: Keychain Access (через `security` CLI)
- Linux: Secret Service API / encrypted file
- Fallback: `~/.travelcode/tokens.json`

### Зависимости (новые)
- `open` — открытие браузера (для CLI auth)
- `jose` — JWT-валидация, JWKS
- Без `express` — можно использовать встроенный `http` или MCP SDK Streamable HTTP

### MCP SDK поддержка
`@modelcontextprotocol/sdk` уже имеет `StreamableHTTPServerTransport` — использовать его.

## Закрытые вопросы
1. ✅ TravelCode API поддерживает OAuth — полный AS реализован
2. ✅ TravelCode сам AS — не нужен Auth0/WorkOS
3. ✅ Public client (token_endpoint_auth_method: "none") + PKCE S256
4. ✅ Scopes: flights:search, flights:status, flights:stats, airports:read, airlines:read
5. ⏳ Где хостится HTTP MCP-сервер — пока localhost, деплой TBD
6. ✅ Да, per-session серверы с индивидуальным токеном каждого пользователя
