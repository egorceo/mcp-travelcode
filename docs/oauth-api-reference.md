# OAuth 2.1 Authorization Server

OAuth 2.1 авторизация для AI-клиентов (MCP-серверы, Claude Desktop, Cursor и др.).

**OAuth эндпоинты размещены на основном домене** (backend), а не на REST API. Это позволяет использовать существующую сессию пользователя — если пользователь залогинен, ему не нужно вводить email/password на странице авторизации.

**API эндпоинты** (`/v1/*`) принимают как обычные `user_access_token`, так и OAuth `oauth_access_token`.

## Общая информация

- **Authorization Server URL**: `https://travel-code.com` (основной домен)
- **API URL**: `https://api.travel-code.com` (REST API, принимает OAuth токены)
- **Тип токенов**: opaque Bearer (случайные строки, хранятся в БД)
- **PKCE**: обязателен (S256)
- **Client authentication**: `none` (public clients)
- **Refresh token rotation**: при каждом обновлении старый refresh token отзывается
- **Localhost redirect_uri**: поддерживаются динамические порты (MCP-клиенты)

## Эндпоинты

Все OAuth эндпоинты на основном домене (`https://travel-code.com`):

| Метод | URL | Описание |
|-------|-----|----------|
| GET | `/.well-known/oauth-authorization-server` | Server metadata |
| GET | `/oauth/authorize` | Страница авторизации (HTML) |
| POST | `/oauth/authorize` | Обработка формы согласия |
| POST | `/oauth/token` | Получение/обновление токенов |
| POST | `/oauth/register` | Регистрация клиента (DCR) |
| POST | `/oauth/revoke` | Отзыв токена |

---

## 1. Server Metadata

```
GET /.well-known/oauth-authorization-server
```

### Ответ (200 OK)

```json
{
  "issuer": "https://travel-code.com",
  "authorization_endpoint": "https://travel-code.com/oauth/authorize",
  "token_endpoint": "https://travel-code.com/oauth/token",
  "registration_endpoint": "https://travel-code.com/oauth/register",
  "revocation_endpoint": "https://travel-code.com/oauth/revoke",
  "scopes_supported": [
    "airports:read",
    "airlines:read",
    "flights:search",
    "flights:status",
    "flights:stats",
    "orders:read",
    "orders:write"
  ],
  "response_types_supported": ["code"],
  "grant_types_supported": ["authorization_code", "refresh_token"],
  "token_endpoint_auth_methods_supported": ["none"],
  "code_challenge_methods_supported": ["S256"]
}
```

---

## 2. Authorization Endpoint

```
GET /oauth/authorize
```

Открывается в браузере. Показывает страницу согласия.

### Поведение

- **Если пользователь залогинен** — показывает "Logged in as **username**" с кнопками Authorize/Deny и ссылкой Sign out. Все доступные scopes отображаются с чекбоксами (запрошенные отмечены по умолчанию).
- **Если не залогинен** — показывает форму email/password + scopes с чекбоксами.

### Query Parameters

| Параметр | Обязательный | Описание |
|---|---|---|
| `response_type` | да | Всегда `code` |
| `client_id` | да | ID клиента (из регистрации) |
| `redirect_uri` | да | URL для callback |
| `scope` | да | Запрашиваемые права, через пробел |
| `state` | да | Случайная строка для CSRF-защиты |
| `code_challenge` | да | PKCE challenge (SHA256 от code_verifier, base64url) |
| `code_challenge_method` | да | Всегда `S256` |
| `resource` | нет | URI ресурса (RFC 8707) |

### Пример URL

```
https://travel-code.com/oauth/authorize?
  response_type=code&
  client_id=abc123&
  redirect_uri=http://localhost:3000/callback&
  scope=flights:search%20airports:read%20orders:read&
  state=xyz789&
  code_challenge=E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM&
  code_challenge_method=S256
```

### Результат

- При согласии — редирект на `redirect_uri?code=AUTH_CODE&state=STATE`
- При отказе — редирект на `redirect_uri?error=access_denied&state=STATE`

### Возможные ошибки в редиректе

| error | Описание |
|-------|----------|
| `access_denied` | Пользователь отказал в доступе |
| `invalid_request` | Невалидные параметры |
| `invalid_client` | Неизвестный client_id |
| `unsupported_response_type` | response_type не `code` |

---

## 3. Token Endpoint

```
POST /oauth/token
Content-Type: application/x-www-form-urlencoded
```

### 3.1 Обмен authorization code на токены

| Параметр | Обязательный | Описание |
|---|---|---|
| `grant_type` | да | `authorization_code` |
| `code` | да | Authorization code из `/oauth/authorize` |
| `redirect_uri` | да | Тот же redirect_uri что в authorize |
| `client_id` | да | ID клиента |
| `code_verifier` | да | PKCE verifier (SHA256 должен совпасть с code_challenge) |

### Пример запроса

```bash
curl -X POST https://travel-code.com/oauth/token \
  -d "grant_type=authorization_code" \
  -d "code=AUTH_CODE_HERE" \
  -d "redirect_uri=http://localhost:3000/callback" \
  -d "client_id=abc123" \
  -d "code_verifier=dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"
```

### Ответ (200 OK)

```json
{
  "access_token": "randomString64chars...",
  "token_type": "Bearer",
  "expires_in": 3600,
  "refresh_token": "anotherRandomString64chars...",
  "scope": "flights:search airports:read orders:read"
}
```

### 3.2 Обновление токена (refresh)

| Параметр | Обязательный | Описание |
|---|---|---|
| `grant_type` | да | `refresh_token` |
| `refresh_token` | да | Текущий refresh token |
| `client_id` | да | ID клиента |

### Пример запроса

```bash
curl -X POST https://travel-code.com/oauth/token \
  -d "grant_type=refresh_token" \
  -d "refresh_token=REFRESH_TOKEN_HERE" \
  -d "client_id=abc123"
```

### Ответ (200 OK)

```json
{
  "access_token": "newAccessToken...",
  "token_type": "Bearer",
  "expires_in": 3600,
  "refresh_token": "newRefreshToken...",
  "scope": "flights:search airports:read orders:read"
}
```

> **Refresh token rotation**: старый refresh token отзывается, выдаётся новый. Повторное использование старого refresh token вернёт ошибку.

### Возможные ошибки

| HTTP | error | Описание |
|------|-------|----------|
| 400 | `invalid_request` | Отсутствуют обязательные параметры |
| 400 | `invalid_grant` | Невалидный, использованный или истёкший code/refresh_token |
| 400 | `invalid_grant` | Client ID или redirect_uri не совпадают |
| 400 | `invalid_grant` | PKCE verification failed |
| 400 | `unsupported_grant_type` | Неподдерживаемый grant_type |

---

## 4. Dynamic Client Registration (DCR)

```
POST /oauth/register
Content-Type: application/json
```

### Request Body

```json
{
  "client_name": "MCP TravelCode Server",
  "redirect_uris": ["http://localhost:3000/callback"],
  "grant_types": ["authorization_code", "refresh_token"],
  "response_types": ["code"],
  "token_endpoint_auth_method": "none"
}
```

| Поле | Обязательный | Описание |
|------|-------------|----------|
| `client_name` | да | Название приложения |
| `redirect_uris` | да | Массив разрешённых redirect URI |
| `grant_types` | нет | По умолчанию: `["authorization_code", "refresh_token"]` |
| `response_types` | нет | По умолчанию: `["code"]` |
| `token_endpoint_auth_method` | нет | По умолчанию: `"none"` |

### Ответ (201 Created)

```json
{
  "client_id": "generatedRandomString32chars",
  "client_name": "MCP TravelCode Server",
  "redirect_uris": ["http://localhost:3000/callback"],
  "grant_types": ["authorization_code", "refresh_token"]
}
```

> **Localhost redirect_uri**: при проверке redirect_uri для `localhost`/`127.0.0.1` порт игнорируется — клиент может зарегистрироваться с `localhost:3000` и использовать `localhost:19284`.

---

## 5. Token Revocation

```
POST /oauth/revoke
Content-Type: application/x-www-form-urlencoded
```

| Параметр | Обязательный | Описание |
|---|---|---|
| `token` | да | Access token или refresh token |
| `token_type_hint` | нет | `access_token` или `refresh_token` |

### Ответ

Всегда **200 OK** (даже если токен не найден — по RFC 7009).

При отзыве access token — связанные refresh tokens тоже отзываются. При отзыве refresh token — связанный access token тоже отзывается.

---

## 6. Scopes

На странице согласия все scopes отображаются с чекбоксами и описаниями. Запрошенные клиентом scopes отмечены по умолчанию, пользователь может изменить выбор перед авторизацией.

| Scope | Описание | Покрываемые эндпоинты |
|-------|----------|----------------------|
| `airports:read` | View airports and airport data | `GET /v1/data/airports`, `GET /v1/data/airports/{id}` |
| `airlines:read` | View airlines | `GET /v1/data/airlines` |
| `flights:search` | Search flights | `POST /v1/search/flights`, `GET /v1/search/flights/{id}` |
| `flights:status` | View flight status | (зарезервировано) |
| `flights:stats` | View flight delay statistics | (зарезервировано) |
| `orders:read` | View orders | `GET /v1/orders`, `GET /v1/orders/{id}`, `GET /v1/orders/{id}/cancel/check`, `GET /v1/orders/{id}/modify/check` |
| `orders:write` | Create, cancel and modify orders | `POST /v1/orders`, `POST /v1/orders/{id}/cancel`, `POST /v1/orders/{id}/modify` |

---

## 7. TTL токенов

| Тип | Время жизни |
|-----|-------------|
| Authorization code | 10 минут |
| Access token | 1 час |
| Refresh token | 30 дней |

---

## 8. Использование OAuth токена в REST API

После получения `access_token` через OAuth, он используется как обычный Bearer токен для REST API:

```
GET https://api.travel-code.com/v1/data/airports
Authorization: Bearer {oauth_access_token}
```

REST API проверяет токен в следующем порядке:
1. `user_access_token` (обычный API-токен)
2. `oauth_access_token` (OAuth-токен) — fallback

Оба типа токенов работают одинаково для всех API эндпоинтов.

---

## 9. Полный флоу авторизации

```
MCP Client                    TravelCode (backend)              User Browser
    |                                  |                              |
    |  1. POST /oauth/register         |                              |
    |--------------------------------->|                              |
    |  { client_name, redirect_uris }  |                              |
    |<---------------------------------|                              |
    |  { client_id }                   |                              |
    |                                  |                              |
    |  2. Open browser:                |                              |
    |  /oauth/authorize?               |                              |
    |   client_id=...&                 |                              |
    |   scope=...&                     |                              |
    |   code_challenge=...             |                              |
    |--------------------------------->|------------------------------>|
    |                                  |  3. Consent page (HTML)      |
    |                                  |     - If logged in: show     |
    |                                  |       user + scope checkboxes|
    |                                  |     - If guest: show login   |
    |                                  |       form + scope checkboxes|
    |                                  |<------------------------------|
    |                                  |  4. User clicks Authorize    |
    |                                  |------------------------------>|
    |                                  |  5. Redirect to redirect_uri |
    |                                  |     ?code=AUTH_CODE           |
    |<-----------------------------------------------------------------|
    |  6. POST /oauth/token            |                              |
    |   grant_type=authorization_code  |                              |
    |   code=AUTH_CODE                 |                              |
    |   code_verifier=...              |                              |
    |--------------------------------->|                              |
    |<---------------------------------|                              |
    |  { access_token, refresh_token } |                              |
    |                                  |                              |
    |  7. API calls to REST API        |                              |
    |  Authorization: Bearer {token}   |                              |
    |------> api.travel-code.com/v1/*  |                              |
```

---

## 10. Ответы на вопросы из ТЗ

| Вопрос | Ответ |
|--------|-------|
| URL Authorization Server | `https://travel-code.com` (основной домен) |
| Формат токенов | Opaque (случайные строки), не JWT |
| DCR или статичный client_id? | DCR поддерживается (`POST /oauth/register`) |
| Scopes | `airports:read`, `airlines:read`, `flights:search`, `flights:status`, `flights:stats`, `orders:read`, `orders:write` |
| JWKS endpoint | Нет (токены opaque, валидация через БД) |
| Система пользователей | Существующая — пользователь TravelCode (сессия или email/password) |
| Rate limits | Пока одинаковые для OAuth и API-ключей |

---

## Ключевые файлы

### Backend (OAuth Authorization Server)
- `backend/controllers/OAuthController.php` — контроллер (metadata, authorize, token, register, revoke)
- `backend/views/o-auth/oauth-authorize.php` — consent page (HTML)
- `backend/config/main.php` — URL rules для OAuth

### ActiveRecord модели
- `common/models/OAuth/OAuthClient.php` — клиенты (DCR)
- `common/models/OAuth/OAuthAuthorizationCode.php` — коды авторизации
- `common/models/OAuth/OAuthAccessToken.php` — access токены
- `common/models/OAuth/OAuthRefreshToken.php` — refresh токены

### Валидация токенов в REST API
- `common/models/user/User.php` — `findIdentityByAccessToken()` проверяет `oauth_access_token` как fallback

### Миграция
- `console/migrations84/m260314_120000_create_oauth_tables.php`

### REST API handlers (устаревшие, не используются)
- `rest/controllers/OAuth/` — старые actions (OAuth перенесён в backend)
- `rest/models/OAuth/` — старые handlers
