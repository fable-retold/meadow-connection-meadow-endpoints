# Configuration & Authentication

This page documents every configuration key the connection reads, the form schema that drives connection UIs, the authentication flow, and how the upstream session scopes data per customer.

---

## Where Configuration Comes From

The constructor resolves its config by layering three sources, last wins:

1. **Defaults** -- `ServerProtocol: 'https'`, `ServerAddress: '127.0.0.1'`, `ServerPort: 443`, `ServerEndpointPrefix: '1.0/'`.
2. **`fable.settings.MeadowEndpoints`** -- the conventional settings bag. The connection manager sets this from a stored connection's config.
3. **Constructor options** -- `options.MeadowEndpoints` if present, otherwise the options object itself.

The resolved shape is then written back to `fable.settings.MeadowEndpoints` (with `Headers` and `Cookies` shared by reference) so the meadow provider reads the same view.

Two normalizations happen on the way through:

- **`ServerPort` is coerced to a string.** The provider's URL builder concatenates strings, and a string port makes config round-trips (import/export) compare equal.
- **`ServerEndpointPrefix` gets a trailing slash** if it is missing. The provider just concatenates the prefix and the route, so a missing slash glues them together and a double slash 404s on strict servers.

---

## Connection Keys

| Key | Type | Default | Notes |
| --- | --- | --- | --- |
| `ServerProtocol` | string | `https` | `http` or `https` |
| `ServerAddress` | string | `127.0.0.1` | Hostname of the upstream API |
| `ServerPort` | number/string | `443` | Coerced to a string internally |
| `ServerEndpointPrefix` | string | `1.0/` | Path prefix after the host; trailing slash auto-added |
| `Headers` | object | `{}` | Arbitrary outbound headers; shared with the provider |
| `Cookies` | array | `[]` | Pre-set outbound cookies as `name=value` strings; shared with the provider |
| `Authentication` | object | `null` | See below. When absent, connect just marks the connection connected |

The effective URL for any route is built as:

```
<ServerProtocol>://<ServerAddress>:<ServerPort>/<ServerEndpointPrefix><path>
```

---

## Authentication Keys

When an `Authentication` object is present, the connection logs in at connect time ("the connection logs in" -- option A of the design). The block accepts:

| Key | Type | Default | Notes |
| --- | --- | --- | --- |
| `Authentication.UserName` | string | — | Required for authenticated mode |
| `Authentication.Password` | string | — | Required for authenticated mode |
| `Authentication.Endpoint` | string | `Authenticate` | Path under `ServerEndpointPrefix` |
| `Authentication.Method` | string | `POST` | `POST` or `GET` (upper-cased) |
| `Authentication.UserNameField` | string | `UserName` | Body field name carrying the user id |
| `Authentication.PasswordField` | string | `Password` | Body field name carrying the password |
| `Authentication.CookieName` | string | `SessionID` | `Set-Cookie` name to harvest from the auth response |
| `Authentication.AutoConnect` | boolean | `true` | Authenticate during construction; set `false` to call `connectAsync()` yourself |

If `UserName` or `Password` is missing while an `Authentication` block exists, `connectAsync()` returns an error rather than attempting the request.

### Example

```json
{
	"ServerProtocol": "https",
	"ServerAddress": "api.qa.headlight.com",
	"ServerPort": 443,
	"ServerEndpointPrefix": "1.0/",
	"Headers": { "X-Client": "beacon-acme" },
	"Authentication":
	{
		"UserName": "alice@example.com",
		"Password": "wonderland",
		"Endpoint": "Authenticate",
		"Method": "POST",
		"UserNameField": "UserName",
		"PasswordField": "Password",
		"CookieName": "SessionID",
		"AutoConnect": true
	}
}
```

---

## The Form Schema

The module ships a pure-data form schema at `source/Meadow-Connection-MeadowEndpoints-FormSchema.js`. It is safe to `require()` even when `simple-get` / `meadow` are not installed, so a UI can render a connection form without pulling in the HTTP machinery.

It is consumed by `meadow-connection-manager`'s `getProviderFormSchema('MeadowEndpoints')` and by any UI that renders a "connect to a meadow-endpoints API" form (a beacon's Connections panel, retold-data-mapper, the lab Stack form, and so on).

```javascript
{
	Provider:    'MeadowEndpoints',
	DisplayName: 'Meadow Endpoints (REST)',
	Description: 'Connect to a remote meadow-endpoints REST API (e.g. the Headlight Platform API). Customer scoping is enforced by the authenticated upstream session.',
	Fields: [ /* ... */ ]
}
```

### Fields

| Name | Label | Type | Default | Group |
| --- | --- | --- | --- | --- |
| `ServerProtocol` | Protocol | Select (`https`, `http`) | `https` | — |
| `ServerAddress` | Host | String | `api.qa.headlight.com` | — |
| `ServerPort` | Port | Number (1–65535) | `443` | — |
| `ServerEndpointPrefix` | Endpoint Prefix | String | `1.0/` | — |
| `Authentication.UserName` | Username | String | — | Authentication |
| `Authentication.Password` | Password | Password | — | Authentication |
| `Authentication.Endpoint` | Auth Endpoint | String | `Authenticate` | Authentication |
| `Authentication.Method` | Auth Method | Select (`POST`, `GET`) | `POST` | Authentication |
| `Authentication.UserNameField` | Username Field | String | `UserName` | Authentication |
| `Authentication.PasswordField` | Password Field | String | `Password` | Authentication |
| `Authentication.CookieName` | Session Cookie | String | `SessionID` | Authentication |
| `Authentication.AutoConnect` | Auto-Connect | Boolean | `true` | Authentication |

The four server fields are marked `Required`. The authentication fields share the `Authentication` group so a form can render them as a collapsible section. The schema's defaults (host `api.qa.headlight.com`, prefix `1.0/`) reflect the Headlight Platform API as the canonical target; note these differ from the connection class's bare network defaults (`127.0.0.1`).

---

## Customer Scoping via the Upstream Session

Every meadow request issued by the provider carries the captured session cookie (joined from the shared `Cookies` list onto the request's `cookie` header). The upstream API enforces customer scoping based on that session.

The practical consequence: a consumer process -- a retold-databeacon, for example -- **never needs to know `IDCustomer`**. Whatever the authenticated user is allowed to see is exactly what the connection serves. There is no per-request customer parameter to thread through.

The auth response object is retained as `connection.sessionInfo` for callers that want to read it. In the Headlight shape it includes fields such as `CustomerID`, `UserID`, and `LoginID`, which a caller can use for its own scoping or display decisions:

```javascript
_Connection.connectAsync(
	(pError, pSessionInfo) =>
	{
		if (pError) return console.error(pError.message);
		// e.g. pSessionInfo.CustomerID, pSessionInfo.UserID
		console.log('Logged in as customer', pSessionInfo.CustomerID);
	});
```

> The exact field names in `sessionInfo` are defined by the upstream server, not by this module. `CustomerID` / `UserID` / `LoginID` are what Headlight returns; another meadow-endpoints server may shape its auth response differently. The only field this module itself looks for is `SessionID` (the cookie fallback) and `LoggedIn` (a `false` value is treated as a rejection).

---

## Schema and Introspection

This connection does not own or expose the remote schema. Configuration has no DDL or schema options because the upstream meadow-endpoints server owns its own schema:

- `listTables()` returns an empty array.
- `introspectDatabaseSchema()` returns an error stating introspection is not supported.
- `schemaProvider` is `null`.

To discover what the remote exposes, consult the upstream server's documented routes.

---

## Related Pages

- [Quickstart](quickstart.md) -- Configure and connect end to end
- [Architecture](architecture.md) -- How the shared settings bag and authentication flow work
- [API Reference](api.md) -- The methods and properties on the connection class
