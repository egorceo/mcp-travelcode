# ТЗ: OAuth 2.1 Authorization Server для TravelCode API

## Контекст

Мы разрабатываем MCP-сервер (Model Context Protocol), который проксирует запросы к TravelCode API. Сейчас авторизация работает через статичный Bearer-токен из env-переменной. Нужно перейти на OAuth 2.1, чтобы AI-клиенты (Claude Desktop, Cursor и др.) могли авторизоваться автоматически через браузер, без ручного копирования ключей.

MCP-протокол использует спецификацию **OAuth 2.1** с обязательными расширениями: **PKCE** и **Resource Indicators (RFC 8707)**.

---

## Что нужно реализовать

### 1. Authorization Server Metadata (обязательно)

Эндпоинт: `GET /.well-known/oauth-authorization-server`

Ответ (JSON):
```json
{
  "issuer": "https://auth.travel-code.com",
  "authorization_endpoint": "https://auth.travel-code.com/oauth/authorize",
  "token_endpoint": "https://auth.travel-code.com/oauth/token",
  "registration_endpoint": "https://auth.travel-code.com/oauth/register",
  "scopes_supported": ["flights:search", "flights:status", "airports:read", "airlines:read"],
  "response_types_supported": ["code"],
  "grant_types_supported": ["authorization_code", "refresh_token"],
  "token_endpoint_auth_methods_supported": ["none"],
  "code_challenge_methods_supported": ["S256"],
  "revocation_endpoint": "https://auth.travel-code.com/oauth/revoke"
}
```

> URL-ы можно менять, главное чтобы metadata была доступна по well-known и описывала все endpoint-ы.

---

### 2. Authorization Endpoint

`GET /oauth/authorize`

Query-параметры:

| Параметр | Обязательный | Описание |
|---|---|---|
| `response_type` | да | Всегда `code` |
| `client_id` | да | ID клиента (из регистрации или статичный) |
| `redirect_uri` | да | URL для callback (будет `http://localhost:PORT/callback` или HTTPS) |
| `scope` | да | Запрашиваемые права, через пробел |
| `state` | да | Случайная строка для CSRF-защиты |
| `code_challenge` | да | PKCE challenge (SHA256 от code_verifier, base64url) |
| `code_challenge_method` | да | Всегда `S256` |
| `resource` | желательно | URI ресурса (RFC 8707), например `https://mcp-travelcode.example.com` |

Поведение:
- Показать пользователю страницу согласия ("Приложение X запрашивает доступ к: ...")
- При согласии — редирект на `redirect_uri?code=AUTH_CODE&state=STATE`
- При отказе — редирект на `redirect_uri?error=access_denied&state=STATE`

---

### 3. Token Endpoint

`POST /oauth/token`

Content-Type: `application/x-www-form-urlencoded`

**Обмен code на токен:**

| Параметр | Обязательный | Описание |
|---|---|---|
| `grant_type` | да | `authorization_code` |
| `code` | да | Authorization code из п.2 |
| `redirect_uri` | да | Тот же redirect_uri что в authorize |
| `client_id` | да | ID клиента |
| `code_verifier` | да | PKCE verifier (сервер проверяет SHA256 == code_challenge) |
| `resource` | желательно | URI ресурса (RFC 8707) |

**Обновление токена:**

| Параметр | Обязательный | Описание |
|---|---|---|
| `grant_type` | да | `refresh_token` |
| `refresh_token` | да | Текущий refresh token |
| `client_id` | да | ID клиента |

Ответ (JSON):
```json
{
  "access_token": "eyJhbG...",
  "token_type": "Bearer",
  "expires_in": 3600,
  "refresh_token": "dGhpcyBpcyBh...",
  "scope": "flights:search flights:status airports:read"
}
```

Требования:
- **PKCE обязателен** — отклонять запросы без `code_verifier` или при несовпадении с `code_challenge`
- **Refresh token rotation** — при каждом обновлении выдавать новый refresh_token, старый инвалидировать
- Access token TTL: рекомендуется **1 час**
- Refresh token TTL: на ваше усмотрение (7-30 дней)

---

### 4. Dynamic Client Registration (желательно)

`POST /oauth/register`

Тело (JSON):
```json
{
  "client_name": "MCP TravelCode Server",
  "redirect_uris": ["http://localhost:3000/callback"],
  "grant_types": ["authorization_code", "refresh_token"],
  "response_types": ["code"],
  "token_endpoint_auth_method": "none"
}
```

Ответ:
```json
{
  "client_id": "generated-client-id",
  "client_name": "MCP TravelCode Server",
  "redirect_uris": ["http://localhost:3000/callback"],
  "grant_types": ["authorization_code", "refresh_token"]
}
```

> Если DCR сложно — можно выдать статичный `client_id` для нашего MCP-сервера. Сообщить нам какой.

---

### 5. Scopes

Нужны scopes, разделяющие доступ по функциональности. Предлагаемые (можете предложить свои):

| Scope | Покрывает |
|---|---|
| `airports:read` | search_airports, get_airport |
| `airlines:read` | search_airlines |
| `flights:search` | search_flights, get_flight_results |
| `flights:status` | get_flight_status, get_airport_flights |
| `flights:stats` | get_flight_delay_stats, get_airport_delay_stats |

---

### 6. Валидация токенов на стороне API

Когда наш MCP-сервер получит OAuth-токен от пользователя, он обменяет его на **внутренний API-токен** (мы не будем прокидывать пользовательский токен напрямую). Но нужно знать:

- **Формат access_token** — это JWT или opaque? Если JWT — нужен JWKS endpoint (`GET /.well-known/jwks.json`) для валидации
- **Как проверить что токен валиден** — есть ли introspection endpoint (`POST /oauth/introspect`) или достаточно JWT-валидации?
- **audience / resource** — будет ли в токене claim `aud` с URI ресурса?

---

## Вопросы, на которые нужен ответ

1. **Какой URL будет у Authorization Server?** (например `https://auth.travel-code.com`)
2. **Формат токенов** — JWT или opaque? Если JWT — алгоритм подписи (RS256?)?
3. **DCR или статичный client_id?**
4. **Согласны ли со списком scopes** или предлагаете другую гранулярность?
5. **Есть ли JWKS endpoint** для валидации JWT?
6. **Есть ли существующая система пользователей/аккаунтов**, или нужно создавать с нуля?
7. **Rate limits** — будут ли отличаться для OAuth-токенов vs текущих API-ключей?

---

## Что НЕ нужно делать на вашей стороне

- Реализация MCP-протокола — это наша задача
- Protected Resource Metadata (`/.well-known/oauth-protected-resource`) — это наш сервер будет отдавать
- Хранение токенов на стороне клиента — наша задача
