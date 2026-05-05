/*
	Unit tests for meadow-connection-meadow-endpoints.

	A tiny in-process http server stands in for a meadow-endpoints API so the
	suite stays hermetic — no network and no upstream dependencies required.
*/

const Chai = require('chai');
const Expect = Chai.expect;

const libHttp = require('http');

const libFable = require('fable');
const libConnection = require('../source/Meadow-Connection-MeadowEndpoints.js');
const libFormSchema = require('../source/Meadow-Connection-MeadowEndpoints-FormSchema.js');

const _Package = require('../package.json');

let _Server = null;
let _ServerPort = 0;
let _LastAuthRequest = null;

const startStubServer = (fCallback) =>
{
	_Server = libHttp.createServer((pReq, pRes) =>
	{
		let tmpBody = '';
		pReq.on('data', (pChunk) => tmpBody += pChunk);
		pReq.on('end', () =>
		{
			let tmpUrl = pReq.url.replace(/\/+/g, '/');
			if (pReq.method === 'POST' && tmpUrl === '/1.0/Authenticate')
			{
				let tmpParsed = {};
				try { tmpParsed = JSON.parse(tmpBody || '{}'); } catch (e) { /* invalid */ }
				_LastAuthRequest = { headers: pReq.headers, body: tmpParsed };
				if (tmpParsed.UserName === 'alice' && tmpParsed.Password === 'wonderland')
				{
					pRes.setHeader('Set-Cookie', 'SessionID=stub-session-001; Path=/; HttpOnly');
					pRes.writeHead(200, { 'Content-Type': 'application/json' });
					return pRes.end(JSON.stringify({ LoggedIn: true, SessionID: 'stub-session-001', UserID: 1, CustomerID: 7, LoginID: 'alice' }));
				}
				if (tmpParsed.UserName === 'body-only' && tmpParsed.Password === 'pw')
				{
					pRes.writeHead(200, { 'Content-Type': 'application/json' });
					return pRes.end(JSON.stringify({ LoggedIn: true, SessionID: 'stub-body-only', UserID: 2, CustomerID: 8, LoginID: 'body-only' }));
				}
				pRes.writeHead(200, { 'Content-Type': 'application/json' });
				return pRes.end(JSON.stringify({ LoggedIn: false, Error: 'Authentication failed.' }));
			}
			pRes.writeHead(404);
			pRes.end();
		});
	});
	_Server.listen(0, '127.0.0.1', () =>
	{
		_ServerPort = _Server.address().port;
		fCallback();
	});
};

const stopStubServer = (fCallback) =>
{
	if (!_Server) return fCallback();
	_Server.close(() => { _Server = null; fCallback(); });
};

const buildConfigOptions = (pOverrides) =>
{
	return Object.assign(
		{
			ServerProtocol: 'http',
			ServerAddress: '127.0.0.1',
			ServerPort: _ServerPort,
			ServerEndpointPrefix: '1.0/'
		},
		pOverrides || {});
};

const instantiate = (pOptions) =>
{
	let tmpFable = new libFable();
	let tmpConn = new libConnection(tmpFable, pOptions || {}, 'unit-test');
	return { fable: tmpFable, connection: tmpConn };
};

suite(
	`Basic ${_Package.name}.v.${_Package.version} tests`,
	() =>
	{
		suiteSetup((fDone) => startStubServer(fDone));
		suiteTeardown((fDone) => stopStubServer(fDone));
		setup(() => { _LastAuthRequest = null; });

		suite('Form schema', () =>
		{
			test('exposes the canonical Provider name and authentication fields', () =>
			{
				Expect(libFormSchema.Provider).to.equal('MeadowEndpoints');
				let tmpFieldNames = libFormSchema.Fields.map((pField) => pField.Name);
				Expect(tmpFieldNames).to.include('ServerAddress');
				Expect(tmpFieldNames).to.include('Authentication.UserName');
				Expect(tmpFieldNames).to.include('Authentication.CookieName');
			});
		});

		suite('Connection', () =>
		{
			test('builds URLs from the configured pieces', () =>
			{
				let { connection } = instantiate(buildConfigOptions({}));
				let tmpURL = connection.buildURL('Project/123');
				Expect(tmpURL).to.equal(`http://127.0.0.1:${_ServerPort}/1.0/Project/123`);
			});

			test('normalizes a missing trailing slash on ServerEndpointPrefix', () =>
			{
				let { connection } = instantiate(buildConfigOptions({ ServerEndpointPrefix: '1.0' }));
				Expect(connection.settings.ServerEndpointPrefix).to.equal('1.0/');
			});

			test('projects shared headers + cookies onto fable.settings.MeadowEndpoints', () =>
			{
				let { fable, connection } = instantiate(buildConfigOptions({ Headers: { 'X-Test': 'yes' }, Cookies: [ 'pre=existing' ] }));
				Expect(fable.settings.MeadowEndpoints).to.be.an('object');
				Expect(fable.settings.MeadowEndpoints.Headers).to.equal(connection.headers);
				Expect(fable.settings.MeadowEndpoints.Cookies).to.equal(connection.cookies);
				Expect(fable.settings.MeadowEndpoints.Cookies).to.deep.include('pre=existing');
				Expect(fable.settings.MeadowEndpoints.Headers['X-Test']).to.equal('yes');
			});

			test('connectAsync resolves immediately when no Authentication is configured', (fDone) =>
			{
				let { connection } = instantiate(buildConfigOptions({}));
				connection.connectAsync((pError, pSession) =>
				{
					Expect(pError).to.equal(null);
					Expect(pSession).to.equal(null);
					Expect(connection.connected).to.equal(true);
					return fDone();
				});
			});
		});

		suite('Authentication (option A — connection logs in)', () =>
		{
			test('authenticates with credentials and harvests the Set-Cookie session', (fDone) =>
			{
				let { connection } = instantiate(buildConfigOptions(
					{
						Authentication:
						{
							UserName: 'alice',
							Password: 'wonderland',
							AutoConnect: false
						}
					}));
				connection.connectAsync((pError, pSession) =>
				{
					Expect(pError).to.equal(null);
					Expect(pSession).to.be.an('object');
					Expect(pSession.CustomerID).to.equal(7);
					Expect(connection.connected).to.equal(true);
					Expect(connection.sessionInfo).to.equal(pSession);
					Expect(connection.cookies).to.deep.include('SessionID=stub-session-001');
					return fDone();
				});
			});

			test('falls back to JSON SessionID when the upstream omits Set-Cookie', (fDone) =>
			{
				let { connection } = instantiate(buildConfigOptions(
					{
						Authentication:
						{
							UserName: 'body-only',
							Password: 'pw',
							AutoConnect: false
						}
					}));
				connection.connectAsync((pError, pSession) =>
				{
					Expect(pError).to.equal(null);
					Expect(pSession.SessionID).to.equal('stub-body-only');
					Expect(connection.cookies).to.deep.include('SessionID=stub-body-only');
					return fDone();
				});
			});

			test('returns a rejection when the upstream replies LoggedIn:false', (fDone) =>
			{
				let { connection } = instantiate(buildConfigOptions(
					{
						Authentication:
						{
							UserName: 'alice',
							Password: 'WRONG',
							AutoConnect: false
						}
					}));
				connection.connectAsync((pError, pSession) =>
				{
					Expect(pError).to.be.an('error');
					Expect(connection.connected).to.equal(false);
					return fDone();
				});
			});

			test('refuses to connect without UserName / Password', (fDone) =>
			{
				let { connection } = instantiate(buildConfigOptions(
					{
						Authentication: { AutoConnect: false }
					}));
				connection.connectAsync((pError) =>
				{
					Expect(pError).to.be.an('error');
					return fDone();
				});
			});
		});

		suite('Disconnect', () =>
		{
			test('clears cookies and session info', (fDone) =>
			{
				let { connection } = instantiate(buildConfigOptions(
					{
						Authentication: { UserName: 'alice', Password: 'wonderland', AutoConnect: false }
					}));
				connection.connectAsync(() =>
				{
					Expect(connection.cookies.length).to.be.greaterThan(0);
					connection.disconnect((pError) =>
					{
						Expect(pError).to.equal(null);
						Expect(connection.cookies.length).to.equal(0);
						Expect(connection.sessionInfo).to.equal(null);
						Expect(connection.connected).to.equal(false);
						return fDone();
					});
				});
			});
		});
	}
);
