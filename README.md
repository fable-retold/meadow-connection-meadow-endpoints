# meadow-connection-meadow-endpoints

Meadow connection that fronts a remote
[meadow-endpoints](https://github.com/stevenvelozo/meadow-endpoints) REST
API as a meadow data source. Pairs with the in-meadow
`Meadow-Provider-MeadowEndpoints` provider — this module supplies the
connection-manager-shaped wrapper, form schema, and a shared cookie/header
state so consumers (retold-databeacon, retold-data-service, retold
data-mapper, ...) can pick `Type: 'MeadowEndpoints'` and treat the upstream
API like any other database.

## When to use

You have a process (a beacon, a CLI, a service) that already speaks meadow
and you want it to read/write through someone else's meadow-endpoints API
instead of a direct DB connection. The canonical case: a retold-databeacon
fronting the Headlight Platform API, where the authenticated user's session
naturally scopes data per customer — the beacon never has to handle
`IDCustomer` itself.

## Configuration

```json
{
  "Type": "MeadowEndpoints",
  "Config": {
    "ServerProtocol": "https",
    "ServerAddress": "api.qa.headlight.com",
    "ServerPort": 443,
    "ServerEndpointPrefix": "1.0/",
    "Authentication": {
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
| `ServerPort` | `443` | Port of the upstream API |
| `ServerEndpointPrefix` | `1.0/` | Path prefix appended after the host |
| `Headers` | `{}` | Arbitrary outbound headers |
| `Cookies` | `[]` | Pre-set outbound cookies (`name=value`) |
| `Authentication.UserName` | — | Required for authenticated mode |
| `Authentication.Password` | — | Required for authenticated mode |
| `Authentication.Endpoint` | `Authenticate` | Path under the prefix |
| `Authentication.Method` | `POST` | `POST` or `GET` |
| `Authentication.UserNameField` | `UserName` | Body field for the user id |
| `Authentication.PasswordField` | `Password` | Body field for the password |
| `Authentication.CookieName` | `SessionID` | Set-Cookie name to harvest |
| `Authentication.AutoConnect` | `true` | Authenticate during construction |

## Customer scoping

Every meadow request issued by `Meadow-Provider-MeadowEndpoints` carries the
captured session cookie. Headlight's API enforces customer scoping based on
that session, so the beacon process never needs to know `IDCustomer` —
whatever the authenticated user can see is what the beacon serves.

## Sister modules

- `meadow` — base ORM. Hosts `Meadow-Provider-MeadowEndpoints`, the request
  builder this connection feeds.
- `meadow-connection-manager` — registry that maps `Type: 'MeadowEndpoints'`
  to this module. Without the registry entry consumers can't pick this type.
- `meadow-connection-mysql` / `-mssql` / `-sqlite` / ... — sibling
  connection drivers for direct database links.

## License

MIT.
