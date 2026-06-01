# meadow-connection-meadow-endpoints

> **[Read the Meadow-Connection-Meadow-Endpoints Documentation](https://fable-retold.github.io/meadow-connection-meadow-endpoints/)** - interactive docs with the full API reference.

Meadow connection that fronts a remote
[meadow-endpoints](https://github.com/fable-retold/meadow-endpoints) REST
API as a meadow data source. Pairs with the in-meadow
`Meadow-Provider-MeadowEndpoints` provider - this module supplies the
connection-manager-shaped wrapper, the form schema, and a shared
cookie/header state so consumers (retold-databeacon, retold-data-service,
retold-data-mapper, ...) can pick `Type: 'MeadowEndpoints'` and treat the
upstream API like any other database.

## When to use

You have a process (a beacon, a CLI, a service) that already speaks meadow
and you want it to read/write through someone else's meadow-endpoints API
instead of a direct DB connection. The canonical case: a retold-databeacon
fronting the Headlight Platform API, where the authenticated user's session
naturally scopes data per customer - the beacon never has to handle
`IDCustomer` itself.

## How it works

This module does **not** make the meadow CRUD requests itself. The HTTP work
lives in the meadow core provider `Meadow-Provider-MeadowEndpoints`. This
connection is the connection-manager-shaped wrapper around it:

- It owns the **configuration shape** (`ServerProtocol`, `ServerAddress`,
  `ServerPort`, `ServerEndpointPrefix`, `Headers`, `Cookies`,
  `Authentication`).
- It holds the **shared cookie / header state** and projects its resolved
  config onto `fable.settings.MeadowEndpoints`, which the provider reads at
  request-build time. The `Headers` and `Cookies` objects are shared by
  reference, so a cookie captured after connect is immediately visible to
  the provider.
- It **logs in** to a remote authentication endpoint at connect time and
  harvests the session cookie, so every downstream meadow request
  automatically carries the right session.

```
meadow entity (setProvider 'MeadowEndpoints')
        |
Meadow-Provider-MeadowEndpoints   <- builds path+verb via FoxHound, sends HTTP
        |   reads fable.settings.MeadowEndpoints (Headers + Cookies, shared)
        v
meadow-connection-meadow-endpoints  <- THIS module: config shape, auth, cookie jar
        |   simple-get POST /<prefix>/Authenticate  (at connect)
        v
remote meadow-endpoints REST API (e.g. Headlight Platform API)
```

See the [hosted documentation](https://fable-retold.github.io/meadow-connection-meadow-endpoints/)
for the full request flow.

## Install

```bash
npm install meadow-connection-meadow-endpoints
```

`meadow` is a peer in the same install and `simple-get` is bundled. The form
schema (`source/Meadow-Connection-MeadowEndpoints-FormSchema.js`) is pure
data and safe to `require()` even when `simple-get` / `meadow` are absent.

## Configuration

```json
{
	"Type": "MeadowEndpoints",
	"Config":
	{
		"ServerProtocol": "https",
		"ServerAddress": "api.qa.headlight.com",
		"ServerPort": 443,
		"ServerEndpointPrefix": "1.0/",
		"Authentication":
		{
			"UserName": "alice@example.com",
			"Password": "...",
			"CookieName": "SessionID",
			"AutoConnect": true
		}
	}
}
```

| Key | Default | Notes |
| --- | --- | --- |
| `ServerProtocol` | `https` | `http` or `https` |
| `ServerAddress` | `127.0.0.1` | Hostname of the upstream API |
| `ServerPort` | `443` | Port of the upstream API (coerced to a string internally) |
| `ServerEndpointPrefix` | `1.0/` | Path prefix appended after the host (trailing slash auto-added) |
| `Headers` | `{}` | Arbitrary outbound headers |
| `Cookies` | `[]` | Pre-set outbound cookies (`name=value`) |
| `Authentication.UserName` | - | Required for authenticated mode |
| `Authentication.Password` | - | Required for authenticated mode |
| `Authentication.Endpoint` | `Authenticate` | Path under the prefix |
| `Authentication.Method` | `POST` | `POST` or `GET` |
| `Authentication.UserNameField` | `UserName` | Body field for the user id |
| `Authentication.PasswordField` | `Password` | Body field for the password |
| `Authentication.CookieName` | `SessionID` | Set-Cookie name to harvest |
| `Authentication.AutoConnect` | `true` | Authenticate during construction |

See the [hosted documentation](https://fable-retold.github.io/meadow-connection-meadow-endpoints/)
for the field-by-field reference and the form schema.

## Customer scoping

Every meadow request issued by `Meadow-Provider-MeadowEndpoints` carries the
captured session cookie. Headlight's API enforces customer scoping based on
that session, so the beacon process never needs to know `IDCustomer` -
whatever the authenticated user can see is what the beacon serves. The
upstream auth response (which typically includes fields like `CustomerID`
and `UserID`) is exposed as `this.sessionInfo` for callers that want to read
it for their own scoping decisions.

## Loaded by the connection manager

`meadow-connection-manager` maps `Type: 'MeadowEndpoints'` to this module.
When a connection of that type is opened, the manager `require()`s
`meadow-connection-meadow-endpoints`, sets `fable.settings.MeadowEndpoints`
from the connection config, instantiates the provider, and calls
`connectAsync()`. Without the registry entry, consumers can't select this
type. `testConnection` treats this type as already-probed (the
`Authenticate` call during connect is the connectivity check).

## Schema introspection

The upstream meadow owns its own schema. This connection does not generate
DDL: `listTables()` returns an empty array, `introspectDatabaseSchema()`
reports the limitation as an error, and `schemaProvider` is `null`. These
methods exist for connection-manager shape parity with the SQL drivers.

## Related modules

- [meadow](https://fable-retold.github.io/meadow/) - base ORM. Hosts
  `Meadow-Provider-MeadowEndpoints`, the request builder this connection
  feeds.
- [meadow-endpoints](https://fable-retold.github.io/meadow-endpoints/) - the
  server-side framework that generates the REST API this connection talks
  to.
- [meadow-connection-manager](https://fable-retold.github.io/meadow-connection-manager/) -
  registry that maps `Type: 'MeadowEndpoints'` to this module.
- [retold-databeacon](https://fable-retold.github.io/retold-databeacon/) -
  the canonical consumer; points a beacon at a meadow-endpoints API.
- [retold-facto](https://fable-retold.github.io/retold-facto/) - fixture /
  test-data tooling that can target the same connection types.

## License

MIT.
