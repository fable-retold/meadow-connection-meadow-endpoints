/**
 * Meadow connection that fronts a remote meadow-endpoints REST API.
 *
 * Pairs with the in-meadow `Meadow-Provider-MeadowEndpoints` provider.
 * The provider already does the HTTP work — this module is the
 * connection-manager-shaped wrapper: it owns the configuration shape, holds
 * the shared cookie / header state, and (option A from the design) logs
 * into a remote authentication endpoint at connect time so every
 * downstream meadow request automatically carries the right session.
 *
 * Configuration (`fable.settings.MeadowEndpoints` or constructor options):
 *
 *   ServerProtocol           'http' | 'https'                 default 'https'
 *   ServerAddress            host name                        default '127.0.0.1'
 *   ServerPort               port number                      default 443
 *   ServerEndpointPrefix     path prefix on the remote        default '1.0/'
 *
 *   Headers                  { name: value }                  arbitrary outbound headers
 *   Cookies                  [ 'name=value', ... ]            arbitrary outbound cookies
 *
 *   Authentication           — option A, "the connection logs in"
 *     {
 *       Endpoint: 'Authenticate',     // path under ServerEndpointPrefix
 *       Method:   'POST',             // 'POST' or 'GET'
 *       UserNameField: 'UserName',    // body field name for the user id
 *       PasswordField: 'Password',    // body field name for the password
 *       UserName: '...',              // credentials
 *       Password: '...',
 *       CookieName: 'SessionID',      // session cookie to harvest from Set-Cookie
 *       AutoConnect: true             // call connect() in the constructor
 *     }
 *
 * After connect(), the captured session cookie is appended to `Cookies`,
 * which `Meadow-Provider-MeadowEndpoints` reads at request build time. The
 * session record from the upstream auth response is exposed as
 * `this.sessionInfo` for callers that want to read e.g. CustomerID for
 * scoping decisions.
 */

const libFableServiceProviderBase = require('fable-serviceproviderbase');
const libSimpleGet = require('simple-get');

const DEFAULT_SETTINGS =
	{
		ServerProtocol: 'https',
		ServerAddress: '127.0.0.1',
		ServerPort: 443,
		ServerEndpointPrefix: '1.0/'
	};

class MeadowConnectionMeadowEndpoints extends libFableServiceProviderBase
{
	constructor(pFable, pManifest, pServiceHash)
	{
		super(pFable, pManifest, pServiceHash);

		this.serviceType = 'MeadowConnectionMeadowEndpoints';

		// Resolve config from explicit options first, then the conventional
		// fable.settings.MeadowEndpoints bag. The Meadow-Provider-MeadowEndpoints
		// provider reads from fable.settings.MeadowEndpoints, so we always
		// project our final shape back onto that key for it to pick up.
		let tmpFromSettings = (this.fable.settings && typeof this.fable.settings.MeadowEndpoints === 'object')
			? this.fable.settings.MeadowEndpoints : {};
		let tmpFromOptions = (typeof this.options.MeadowEndpoints === 'object') ? this.options.MeadowEndpoints : this.options;

		let tmpEndpointSettings = Object.assign({}, DEFAULT_SETTINGS, tmpFromSettings, tmpFromOptions);

		// `simple-get` happily accepts numeric ports, but downstream string
		// concatenation in the provider's buildURL makes a string port
		// safer for round-trip equality (e.g. config import/export tests).
		if (typeof tmpEndpointSettings.ServerPort === 'number')
		{
			tmpEndpointSettings.ServerPort = String(tmpEndpointSettings.ServerPort);
		}

		// Normalize trailing-slash on the prefix — buildURL just concatenates,
		// so missing slash → routes glued onto each other, double slash → 404
		// on strict servers.
		if (tmpEndpointSettings.ServerEndpointPrefix && !tmpEndpointSettings.ServerEndpointPrefix.endsWith('/'))
		{
			tmpEndpointSettings.ServerEndpointPrefix = tmpEndpointSettings.ServerEndpointPrefix + '/';
		}

		this.settings = tmpEndpointSettings;
		this.headers = Object.assign({}, tmpEndpointSettings.Headers || {});
		this.cookies = Array.isArray(tmpEndpointSettings.Cookies) ? tmpEndpointSettings.Cookies.slice() : [];
		this.authentication = tmpEndpointSettings.Authentication || null;

		this.connected = false;
		this.sessionInfo = null;

		// Project our resolved config onto fable.settings.MeadowEndpoints so
		// Meadow-Provider-MeadowEndpoints (which reads from there) sees the
		// same view. We DO want to share the cookies + headers so the
		// provider picks them up; an explicit shared reference makes
		// post-connect cookie writes immediately visible to the provider.
		this.fable.settings.MeadowEndpoints = Object.assign(
			{},
			this.settings,
			{
				Headers: this.headers,
				Cookies: this.cookies
			});

		if (this.authentication && this.authentication.AutoConnect !== false)
		{
			// Best-effort: do not throw out of the constructor. Callers that
			// care about auth failure should call connectAsync() explicitly
			// or consult `this.connected` after the harness picks up.
			this.connect((pError) =>
			{
				if (pError)
				{
					this.log.error(`MeadowConnectionMeadowEndpoints: AutoConnect failed: ${pError.message}`);
				}
			});
		}
	}

	/**
	 * Build the absolute URL for a path under the configured endpoint prefix.
	 *
	 * @param {string} pPath - path under the ServerEndpointPrefix; leading '/' is trimmed.
	 * @returns {string}
	 */
	buildURL(pPath)
	{
		let tmpPath = (typeof pPath === 'string') ? pPath : '';
		if (tmpPath.startsWith('/')) tmpPath = tmpPath.substring(1);
		return `${this.settings.ServerProtocol}://${this.settings.ServerAddress}:${this.settings.ServerPort}/${this.settings.ServerEndpointPrefix}${tmpPath}`;
	}

	/**
	 * Add a fully-formed Cookie header value (e.g. `SessionID=abc`) to the
	 * outbound cookie list. Visible to Meadow-Provider-MeadowEndpoints on
	 * its next request.
	 */
	addCookie(pCookie)
	{
		if (typeof pCookie !== 'string' || pCookie.length === 0) return;
		this.cookies.push(pCookie);
	}

	/**
	 * Set or remove an outbound header. Pass null/undefined to remove.
	 */
	setHeader(pName, pValue)
	{
		if (typeof pName !== 'string' || pName.length === 0) return;
		if (pValue === null || pValue === undefined)
		{
			delete this.headers[pName];
			return;
		}
		this.headers[pName] = String(pValue);
	}

	/**
	 * Synchronous connect compatibility shim — the standard meadow connection
	 * interface has a sync `connect()` for drivers that don't need to talk
	 * to the network. For us the network call is async; we kick it off and
	 * return immediately. Use connectAsync() when you need to wait.
	 */
	connect()
	{
		this.connectAsync(() => {});
	}

	/**
	 * Authenticate against the configured remote endpoint and capture the
	 * session cookie. If no authentication is configured we just mark
	 * connected and return — the provider will issue requests with whatever
	 * Headers / Cookies the caller pre-populated.
	 *
	 * @param {(pError: Error|null, pSessionInfo: object|null) => void} fCallback
	 */
	connectAsync(fCallback)
	{
		let tmpCallback = (typeof fCallback === 'function') ? fCallback : (() => {});

		if (!this.authentication)
		{
			this.connected = true;
			return tmpCallback(null, null);
		}

		let tmpAuth = this.authentication;
		let tmpEndpoint = tmpAuth.Endpoint || 'Authenticate';
		let tmpMethod = (tmpAuth.Method || 'POST').toUpperCase();
		let tmpUserField = tmpAuth.UserNameField || 'UserName';
		let tmpPasswordField = tmpAuth.PasswordField || 'Password';
		let tmpCookieName = tmpAuth.CookieName || 'SessionID';

		if (!tmpAuth.UserName || !tmpAuth.Password)
		{
			return tmpCallback(new Error('MeadowConnectionMeadowEndpoints: Authentication.UserName and Authentication.Password are required.'));
		}

		let tmpBody = {};
		tmpBody[tmpUserField] = tmpAuth.UserName;
		tmpBody[tmpPasswordField] = tmpAuth.Password;

		let tmpRequestOptions =
			{
				method: tmpMethod,
				url: this.buildURL(tmpEndpoint),
				headers: Object.assign({ 'Content-Type': 'application/json' }, this.headers),
				body: tmpBody,
				json: true
			};

		this.log.info(`MeadowConnectionMeadowEndpoints: authenticating at ${tmpRequestOptions.url} as [${tmpAuth.UserName}]...`);

		libSimpleGet.concat(tmpRequestOptions, (pError, pResponse, pData) =>
		{
			if (pError)
			{
				this.log.error(`MeadowConnectionMeadowEndpoints: auth request error: ${pError.message}`);
				return tmpCallback(pError, null);
			}

			let tmpStatus = pResponse && pResponse.statusCode;
			if (typeof tmpStatus !== 'number' || tmpStatus < 200 || tmpStatus >= 300)
			{
				let tmpAuthError = new Error(`MeadowConnectionMeadowEndpoints: auth failed (status ${tmpStatus}).`);
				this.log.error(tmpAuthError.message);
				return tmpCallback(tmpAuthError, null);
			}

			let tmpSessionInfo = (pData && typeof pData === 'object') ? pData : null;
			if (tmpSessionInfo && tmpSessionInfo.LoggedIn === false)
			{
				let tmpReason = tmpSessionInfo.Error || 'rejected';
				let tmpRejected = new Error(`MeadowConnectionMeadowEndpoints: auth rejected — ${tmpReason}.`);
				this.log.error(tmpRejected.message);
				return tmpCallback(tmpRejected, null);
			}

			let tmpCaptured = this._captureSessionCookie(pResponse, tmpCookieName, tmpSessionInfo);
			if (!tmpCaptured)
			{
				let tmpMissing = new Error(`MeadowConnectionMeadowEndpoints: auth succeeded but no [${tmpCookieName}] cookie was returned.`);
				this.log.error(tmpMissing.message);
				return tmpCallback(tmpMissing, tmpSessionInfo);
			}

			this.sessionInfo = tmpSessionInfo;
			this.connected = true;
			this.log.info(`MeadowConnectionMeadowEndpoints: authenticated. Session cookie [${tmpCookieName}] captured.`);
			return tmpCallback(null, tmpSessionInfo);
		});
	}

	/**
	 * Pull the session cookie out of a Set-Cookie response header (or, if the
	 * upstream responded only with a JSON body containing a SessionID, fall
	 * back to that). The captured cookie is appended to `this.cookies` so
	 * subsequent meadow requests carry it.
	 *
	 * @param {object} pResponse - simple-get / node http response object
	 * @param {string} pCookieName - cookie name to harvest
	 * @param {object|null} pSessionInfo - parsed JSON body, may contain SessionID
	 * @returns {boolean} true if a cookie was captured.
	 */
	_captureSessionCookie(pResponse, pCookieName, pSessionInfo)
	{
		let tmpHeaders = pResponse && pResponse.headers ? pResponse.headers : {};
		let tmpSetCookie = tmpHeaders['set-cookie'];
		if (Array.isArray(tmpSetCookie))
		{
			for (let i = 0; i < tmpSetCookie.length; i++)
			{
				let tmpFirst = tmpSetCookie[i].split(';')[0];
				if (tmpFirst.startsWith(`${pCookieName}=`))
				{
					this.addCookie(tmpFirst);
					return true;
				}
			}
		}

		// Fallback: meadow-endpoints servers (and Headlight) typically also
		// echo SessionID in the JSON body, which lets stateless callers
		// rebuild a cookie even when set-cookie wasn't surfaced.
		if (pSessionInfo && typeof pSessionInfo.SessionID === 'string' && pSessionInfo.SessionID.length > 0)
		{
			this.addCookie(`${pCookieName}=${pSessionInfo.SessionID}`);
			return true;
		}

		return false;
	}

	/**
	 * The connection manager / meadow integration calls this on shutdown.
	 * Best-effort deauthenticate when an auth endpoint is configured; never
	 * throw.
	 */
	disconnect(fCallback)
	{
		let tmpCallback = (typeof fCallback === 'function') ? fCallback : (() => {});
		this.connected = false;
		// Cookies and headers are shared with the meadow provider; clear
		// here so a re-connect starts clean.
		this.cookies.length = 0;
		this.sessionInfo = null;
		return tmpCallback(null);
	}

	// --- Schema delegation ---------------------------------------------------
	// The MeadowEndpoints provider doesn't own DDL — the upstream meadow
	// owns its own schema. The methods below exist for connection-manager
	// shape parity with SQL drivers; they no-op or report the limitation.

	get schemaProvider() { return null; }

	listTables(fCallback)
	{
		// Discovery via meadow-endpoints isn't a generic operation — the
		// remote may or may not expose a schema list. Callers that want
		// introspection should hit the upstream's documented routes.
		return fCallback(null, []);
	}

	introspectDatabaseSchema(fCallback)
	{
		return fCallback(new Error('MeadowConnectionMeadowEndpoints: introspection is not supported. The upstream owns its own schema.'));
	}
}

module.exports = MeadowConnectionMeadowEndpoints;
