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

### Фаза 0: Узнать OAuth-возможности TravelCode API
- [ ] Есть ли у TravelCode OAuth endpoints? (`/oauth/authorize`, `/oauth/token`)
- [ ] Если нет → нужен свой Authorization Server (или Auth0/WorkOS)
- [ ] Какие scopes, TTL токенов, rate limits?

### Фаза 1: HTTP-транспорт
- [ ] Добавить Streamable HTTP транспорт (параллельно с stdio)
- [ ] Сервер слушает на HTTP порте (Express или встроенный `http`)
- [ ] Настроить CORS, health check

### Фаза 2: Protected Resource Metadata
- [ ] Реализовать `GET /.well-known/oauth-protected-resource`
  ```json
  {
    "resource": "https://mcp-travelcode.example.com",
    "authorization_servers": ["https://auth.travel-code.com"],
    "scopes_supported": ["flights:search", "flights:status", "airports:read"],
    "bearer_methods_supported": ["header"]
  }
  ```
- [ ] При 401 возвращать `WWW-Authenticate: Bearer resource_metadata="..."`

### Фаза 3: Authorization Server
**Вариант A — TravelCode сам AS:**
- [ ] Прокси OAuth endpoints через MCP-сервер

**Вариант B — Внешний IdP (Auth0, WorkOS и т.п.):**
- [ ] Настроить OAuth app в IdP
- [ ] Прописать redirect URIs, scopes
- [ ] Валидация JWT-токенов через JWKS

**Вариант C — Свой минимальный AS:**
- [ ] `/authorize` — генерация authorization code
- [ ] `/token` — обмен code на access_token
- [ ] Поддержка PKCE (S256)
- [ ] Dynamic Client Registration или Client ID Metadata Documents

### Фаза 4: Token validation в MCP-сервере
- [ ] Middleware для проверки Bearer token на каждый запрос
- [ ] Проверка audience (resource indicator) — токен выдан именно для нашего сервера
- [ ] Проверка scopes — достаточно прав для запрашиваемого tool
- [ ] Обмен внешнего токена на внутренний TravelCode API token (НЕ passthrough!)

### Фаза 5: Graceful fallback
- [ ] Stdio транспорт: env-токен работает как раньше
- [ ] HTTP транспорт: OAuth-флоу
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

## Открытые вопросы
1. Поддерживает ли TravelCode API OAuth? Какие эндпоинты?
2. Если нет OAuth — использовать Auth0/WorkOS или делать свой AS?
3. Нужен ли client_id/client_secret или достаточно PKCE (public client)?
4. Какие scopes нужны?
5. Где будет хостится HTTP MCP-сервер? (localhost / cloud)
6. Нужно ли поддерживать несколько пользователей?
