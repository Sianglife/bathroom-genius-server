import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { getModelToken, MongooseModule } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import { createHash } from 'node:crypto';
import { AuthModule } from './auth.module';
import { AuthConfig } from './auth.config';
import { User } from './schemas/user.schema';
import { LoginAttempt, Session } from './schemas/session.schema';
import { ToiletsModule } from '../toilets/toilets.module';
import { ReviewsModule } from '../reviews/reviews.module';
import { Toilet } from '../toilets/schemas/toilet.schema';
import { Review } from '../reviews/schemas/review.schema';
import { AdminRoleService } from './admin-role.service';
import { HttpExceptionFilter } from '../../common/filters/http-exception.filter';

jest.setTimeout(120000);

describe('LINE sessions and authorization (isolated MongoDB)', () => {
  const origin = 'http://127.0.0.1:5173';
  let mongo: MongoMemoryServer;
  let app: INestApplication;
  let users: Model<User>;
  let sessions: Model<Session>;
  let attempts: Model<LoginAttempt>;
  let toilets: Model<Toilet>;
  let reviews: Model<Review>;
  let roles: AdminRoleService;
  let fetchSpy: jest.SpyInstance;
  let badNonce = false;

  beforeAll(async () => {
    mongo = await MongoMemoryServer.create();
    const module = await Test.createTestingModule({
      imports: [
        MongooseModule.forRoot(mongo.getUri()),
        AuthModule,
        ToiletsModule,
        ReviewsModule,
      ],
    })
      .overrideProvider(AuthConfig)
      .useValue(
        new AuthConfig(
          new ConfigService({
            NODE_ENV: 'test',
            APP_ORIGIN: origin,
            LINE_LOGIN_CHANNEL_ID: '12345',
            LINE_LOGIN_CHANNEL_SECRET: 'test-secret',
            LINE_PROVIDER_ID: 'test-provider',
          }),
        ),
      )
      .compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    );
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
    users = module.get(getModelToken(User.name));
    sessions = module.get(getModelToken(Session.name));
    attempts = module.get(getModelToken(LoginAttempt.name));
    toilets = module.get(getModelToken(Toilet.name));
    reviews = module.get(getModelToken(Review.name));
    roles = new AdminRoleService(users);
    await Promise.all([
      users.init(),
      sessions.init(),
      attempts.init(),
      toilets.init(),
      reviews.init(),
    ]);
    fetchSpy = jest
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async (url, options) => {
        const params = options?.body as URLSearchParams;
        if (String(url).endsWith('/token')) {
          return Response.json({ id_token: 'valid-a' });
        }
        const token = params.get('id_token');
        if (token === 'forged')
          return Response.json({ error: 'invalid' }, { status: 400 });
        return Response.json({
          iss: 'https://access.line.me',
          aud: token === 'wrong-channel' ? 'other' : '12345',
          sub: `U${(token === 'valid-b' ? 'b' : 'a').repeat(32)}`,
          name: '測試使用者',
          iat: Math.floor(Date.now() / 1000) - 5,
          exp:
            Math.floor(Date.now() / 1000) + (token === 'expired' ? -10 : 3600),
          nonce: badNonce ? 'wrong-nonce' : params.get('nonce') || undefined,
        });
      });
  });

  beforeEach(async () => {
    badNonce = false;
    await Promise.all([
      users.deleteMany({}),
      sessions.deleteMany({}),
      attempts.deleteMany({}),
      toilets.deleteMany({}),
      reviews.deleteMany({}),
    ]);
    fetchSpy.mockClear();
  });

  afterAll(async () => {
    fetchSpy?.mockRestore();
    await app?.close();
    await mongo?.stop();
  });

  async function login(token = 'valid-a') {
    const agent = request.agent(app.getHttpServer());
    const guest = await agent.get('/api/auth/csrf').expect(200);
    const response = await agent
      .post('/api/auth/line')
      .set('Origin', origin)
      .set('X-CSRF-Token', guest.body.csrfToken)
      .send({ idToken: token })
      .expect(200);
    return {
      agent,
      user: response.body.user,
      csrf: response.body.csrfToken,
      cookie: response.headers['set-cookie'][0].split(';')[0],
    };
  }

  async function fixtureToilet() {
    return toilets.create({
      name: '測試廁所',
      address: '測試地址',
      location: { type: 'Point', coordinates: [121.5, 25] },
    });
  }

  it('keeps reads public and rejects missing sessions and forged bearer credentials', async () => {
    await request(app.getHttpServer()).get('/api/toilets').expect(200);
    await request(app.getHttpServer())
      .post('/api/toilets')
      .send({})
      .expect(401);
    await request(app.getHttpServer())
      .post('/api/toilets/507f1f77bcf86cd799439011/reviews')
      .set('Authorization', 'Bearer forged')
      .send({ comment: 'No' })
      .expect(401);
  });

  it('requires browser-bound CSRF and exact Origin even for LIFF login', async () => {
    const agent = request.agent(app.getHttpServer());
    const guest = await agent.get('/api/auth/csrf').expect(200);
    await agent
      .post('/api/auth/line')
      .set('Origin', origin)
      .send({ idToken: 'valid-a' })
      .expect(403);
    await agent
      .post('/api/auth/line')
      .set('Origin', 'https://evil.example')
      .set('X-CSRF-Token', guest.body.csrfToken)
      .send({ idToken: 'valid-a' })
      .expect(403);
    await agent
      .post('/api/auth/line')
      .set('X-CSRF-Token', guest.body.csrfToken)
      .send({ idToken: 'valid-a' })
      .expect(403);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it.each(['forged', 'expired', 'wrong-channel'])(
    'rejects %s LINE identities without creating users',
    async (token) => {
      const agent = request.agent(app.getHttpServer());
      const guest = await agent.get('/api/auth/csrf');
      await agent
        .post('/api/auth/line')
        .set('Origin', origin)
        .set('X-CSRF-Token', guest.body.csrfToken)
        .send({ idToken: token })
        .expect(401);
      expect(await users.countDocuments()).toBe(0);
    },
  );

  it('rotates the guest session, does not persist raw credentials, and revokes logout sessions', async () => {
    const agent = request.agent(app.getHttpServer());
    const guest = await agent.get('/api/auth/csrf');
    const oldCookie = guest.headers['set-cookie'][0].split(';')[0];
    const response = await agent
      .post('/api/auth/line')
      .set('Origin', origin)
      .set('X-CSRF-Token', guest.body.csrfToken)
      .send({ idToken: 'valid-a' })
      .expect(200);
    expect(response.headers['set-cookie'][0]).toContain('HttpOnly');
    expect(response.headers['set-cookie'][0]).toContain('SameSite=Lax');
    expect(response.body.user.role).toBe('user');
    expect(response.body.csrfToken).not.toBe(guest.body.csrfToken);
    await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Cookie', oldCookie)
      .expect(401);
    const cookie = response.headers['set-cookie'][0].split(';')[0];
    const stored = await sessions.findOne().lean();
    expect(stored?.tokenHash).not.toBe(cookie.split('=')[1]);
    await agent.get('/api/auth/me').expect(200);
    await agent
      .post('/api/auth/logout')
      .set('Origin', origin)
      .set('X-CSRF-Token', response.body.csrfToken)
      .expect(200);
    await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Cookie', cookie)
      .expect(401);
  });

  it('enforces expiry before the TTL cleanup and rejects client-supplied roles', async () => {
    const { agent, csrf } = await login();
    await agent
      .post('/api/auth/line')
      .set('Origin', origin)
      .set('X-CSRF-Token', csrf)
      .send({ idToken: 'valid-a', role: 'admin' })
      .expect(400);
    await sessions.updateMany({}, { $set: { expiresAt: new Date(0) } });
    await agent.get('/api/auth/me').expect(401);
  });

  it('validates OAuth state, browser binding, nonce, PKCE and safe return paths', async () => {
    const agent = request.agent(app.getHttpServer());
    const start = await agent
      .get('/api/auth/line/start')
      .query({ returnTo: '/toilets/507f1f77bcf86cd799439011/review' })
      .expect(302);
    const authorize = new URL(start.headers.location);
    expect(authorize.searchParams.get('code_challenge_method')).toBe('S256');
    expect(authorize.searchParams.get('code_challenge')).toHaveLength(43);
    const state = authorize.searchParams.get('state');
    await request(app.getHttpServer())
      .get('/api/auth/line/callback')
      .query({ state, code: 'ok' })
      .expect(401);
    const callback = await agent
      .get('/api/auth/line/callback')
      .query({ state, code: 'ok' })
      .expect(302);
    expect(callback.headers.location).toBe(
      '/toilets/507f1f77bcf86cd799439011/review',
    );
    expect(callback.headers['referrer-policy']).toBe('no-referrer');
    const exchange = fetchSpy.mock.calls.find(([url]) =>
      String(url).endsWith('/token'),
    );
    expect(
      (exchange?.[1].body as URLSearchParams).get('code_verifier'),
    ).toHaveLength(43);
    await agent
      .get('/api/auth/line/callback')
      .query({ state, code: 'ok' })
      .expect(401);
    const unsafe = await agent
      .get('/api/auth/line/start')
      .query({ returnTo: '//evil.example' });
    const unsafeState = new URL(unsafe.headers.location).searchParams.get(
      'state',
    );
    const safe = await agent
      .get('/api/auth/line/callback')
      .query({ state: unsafeState, code: 'ok' })
      .expect(302);
    expect(safe.headers.location).toBe('/');
  });

  it('rejects nonce mismatch and expired attempts without leaking callback codes', async () => {
    const agent = request.agent(app.getHttpServer());
    let start = await agent.get('/api/auth/line/start');
    badNonce = true;
    const failure = await agent
      .get('/api/auth/line/callback')
      .query({
        state: new URL(start.headers.location).searchParams.get('state'),
        code: 'secret-code',
      })
      .expect(401);
    expect(JSON.stringify(failure.body)).not.toContain('secret-code');
    expect(await users.countDocuments()).toBe(0);
    badNonce = false;
    start = await agent.get('/api/auth/line/start');
    await attempts.updateMany({}, { $set: { expiresAt: new Date(0) } });
    await agent
      .get('/api/auth/line/callback')
      .query({
        state: new URL(start.headers.location).searchParams.get('state'),
        code: 'ok',
      })
      .expect(401);
    start = await agent.get('/api/auth/line/start');
    await agent
      .get('/api/auth/line/callback')
      .query({
        state: new URL(start.headers.location).searchParams.get('state'),
        error: 'SERVER_ERROR',
      })
      .expect(401);
  });

  it('returns a cancelled login to the original page without signing in and consumes state once', async () => {
    const agent = request.agent(app.getHttpServer());
    const returnTo = '/toilets/507f1f77bcf86cd799439011';
    const start = await agent
      .get('/api/auth/line/start')
      .query({ returnTo })
      .expect(302);
    const state = new URL(start.headers.location).searchParams.get('state')!;
    const wrongState = (state.startsWith('a') ? 'b' : 'a') + state.slice(1);
    await agent
      .get('/api/auth/line/callback')
      .query({ state: wrongState, error: 'ACCESS_DENIED' })
      .expect(401);
    const cancelled = await agent
      .get('/api/auth/line/callback')
      .query({
        state,
        error: 'ACCESS_DENIED',
        error_description: 'The resource owner denied the request.',
      })
      .expect(302);
    expect(cancelled.headers.location).toBe(`${returnTo}?login=cancelled`);
    expect(cancelled.headers.location).not.toContain('state=');
    expect(cancelled.headers.location).not.toContain('error_description');
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(await users.countDocuments()).toBe(0);
    await agent.get('/api/auth/me').expect(401);
    await agent
      .get('/api/auth/line/callback')
      .query({ state, error: 'ACCESS_DENIED' })
      .expect(401);
    const retry = await agent
      .get('/api/auth/line/start')
      .query({ returnTo })
      .expect(302);
    const success = await agent
      .get('/api/auth/line/callback')
      .query({
        state: new URL(retry.headers.location).searchParams.get('state'),
        code: 'ok',
      })
      .expect(302);
    expect(success.headers.location).toBe(returnTo);
    await agent.get('/api/auth/me').expect(200);
  });

  it('keeps an existing session when the user cancels a new login', async () => {
    const actor = await login();
    const start = await actor.agent.get('/api/auth/line/start').expect(302);
    const state = new URL(start.headers.location).searchParams.get('state');
    const cancelled = await actor.agent
      .get('/api/auth/line/callback')
      .query({ state, error: 'ACCESS_DENIED' })
      .expect(302);
    expect(cancelled.headers.location).toBe('/?login=cancelled');
    const me = await actor.agent.get('/api/auth/me').expect(200);
    expect(me.body.id).toBe(actor.user.id);
    await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Cookie', actor.cookie)
      .expect(200);
  });

  it('allows authors, rejects other users and does not let legacy userId claim ownership', async () => {
    const author = await login();
    const other = await login('valid-b');
    const toilet = await fixtureToilet();
    const created = await author.agent
      .post(`/api/toilets/${toilet.id}/reviews`)
      .set('Origin', origin)
      .set('X-CSRF-Token', author.csrf)
      .send({ comment: '原始評論' })
      .expect(201);
    expect(created.body.ownerId).toBeUndefined();
    const path = `/api/reviews/${created.body._id}`;
    await other.agent
      .patch(path)
      .set('Origin', origin)
      .set('X-CSRF-Token', other.csrf)
      .send({ comment: '竄改' })
      .expect(403);
    await other.agent
      .delete(path)
      .set('Origin', origin)
      .set('X-CSRF-Token', other.csrf)
      .expect(403);
    await author.agent
      .patch(path)
      .set('Origin', origin)
      .set('X-CSRF-Token', author.csrf)
      .send({ ownerId: other.user.id })
      .expect(400);
    await author.agent
      .patch(path)
      .set('Origin', origin)
      .set('X-CSRF-Token', author.csrf)
      .send({ comment: '更新' })
      .expect(200);
    const legacy = await reviews.create({
      toiletId: toilet._id,
      userId: author.user.id,
      comment: '舊匿名資料',
    });
    await author.agent
      .delete(`/api/reviews/${legacy.id}`)
      .set('Origin', origin)
      .set('X-CSRF-Token', author.csrf)
      .expect(403);
    await author.agent
      .delete(path)
      .set('Origin', origin)
      .set('X-CSRF-Token', author.csrf)
      .expect(200);
  });

  it('applies administrator grants and revocations to the same live session and records atomic audit entries', async () => {
    const admin = await login();
    const toilet = await fixtureToilet();
    const path = `/api/toilets/${toilet.id}`;
    await admin.agent
      .patch(path)
      .set('Origin', origin)
      .set('X-CSRF-Token', admin.csrf)
      .send({ name: '更新' })
      .expect(403);
    expect(
      await roles.change(admin.user.id, 'admin', 'user', 'test-operator'),
    ).toEqual({ changed: true });
    expect(
      await roles.change(admin.user.id, 'admin', 'admin', 'test-operator'),
    ).toEqual({ changed: false });
    await admin.agent
      .patch(path)
      .set('Origin', origin)
      .set('X-CSRF-Token', admin.csrf)
      .send({ name: '更新' })
      .expect(200);
    const legacy = await reviews.create({
      toiletId: toilet._id,
      comment: '匿名',
    });
    await admin.agent
      .delete(`/api/reviews/${legacy.id}`)
      .set('Origin', origin)
      .set('X-CSRF-Token', admin.csrf)
      .expect(200);
    await roles.change(admin.user.id, 'user', 'admin', 'test-operator');
    await admin.agent
      .patch(path)
      .set('Origin', origin)
      .set('X-CSRF-Token', admin.csrf)
      .send({ name: '不可更新' })
      .expect(403);
    const stored = await users.findById(admin.user.id);
    expect(stored?.roleChanges).toHaveLength(2);
    expect(stored?.roleChanges[1].operator).toBe('test-operator');
    await expect(roles.target('invalid')).rejects.toThrow(
      'Invalid application user ID',
    );
    await expect(
      roles.target(new Types.ObjectId().toHexString()),
    ).rejects.toThrow('User does not exist');
  });

  it('protects every write route and binds CSRF tokens to the current session', async () => {
    const actor = await login();
    const other = await login('valid-b');
    await roles.change(actor.user.id, 'admin', 'user', 'test');
    const toilet = await fixtureToilet();
    const review = await reviews.create({
      toiletId: toilet._id,
      ownerId: actor.user.id,
      comment: '不可變更',
    });
    const routes = [
      ['post', '/api/toilets', {}],
      ['patch', `/api/toilets/${toilet.id}`, { name: '不可變更' }],
      ['delete', `/api/toilets/${toilet.id}`, {}],
      ['post', `/api/toilets/${toilet.id}/reviews`, { comment: '不可新增' }],
      ['patch', `/api/reviews/${review.id}`, { comment: '不可變更' }],
      ['delete', `/api/reviews/${review.id}`, {}],
      ['post', '/api/auth/logout', {}],
    ] as const;
    for (const [method, path, body] of routes) {
      await request(app.getHttpServer())[method](path).send(body).expect(401);
      await actor.agent[method](path)
        .set('Origin', origin)
        .send(body)
        .expect(403);
      await actor.agent[method](path)
        .set('Origin', origin)
        .set('X-CSRF-Token', other.csrf)
        .send(body)
        .expect(403);
      await actor.agent[method](path)
        .set('Origin', 'null')
        .set('X-CSRF-Token', actor.csrf)
        .send(body)
        .expect(403);
    }
    expect(await toilets.countDocuments()).toBe(1);
    expect(await reviews.countDocuments()).toBe(1);
    await actor.agent.get('/api/auth/me').expect(200);
  });

  it('denies all restroom mutations for ordinary users and allows admin create/delete', async () => {
    const actor = await login();
    const toilet = await fixtureToilet();
    const dto = {
      name: '管理員新增',
      address: '測試',
      location: { type: 'Point', coordinates: [121.5, 25] },
    };
    await actor.agent
      .post('/api/toilets')
      .set('Origin', origin)
      .set('X-CSRF-Token', actor.csrf)
      .send(dto)
      .expect(403);
    await actor.agent
      .patch(`/api/toilets/${toilet.id}`)
      .set('Origin', origin)
      .set('X-CSRF-Token', actor.csrf)
      .send({ name: '不可修改' })
      .expect(403);
    await actor.agent
      .delete(`/api/toilets/${toilet.id}`)
      .set('Origin', origin)
      .set('X-CSRF-Token', actor.csrf)
      .expect(403);
    await roles.change(actor.user.id, 'admin', 'user', 'test');
    const created = await actor.agent
      .post('/api/toilets')
      .set('Origin', origin)
      .set('X-CSRF-Token', actor.csrf)
      .send(dto)
      .expect(201);
    await actor.agent
      .delete(`/api/toilets/${created.body._id}`)
      .set('Origin', origin)
      .set('X-CSRF-Token', actor.csrf)
      .expect(200);
  });

  it('reuses the verified account across OAuth and LIFF without resetting its administrator role', async () => {
    const actor = await login();
    await roles.change(actor.user.id, 'admin', 'user', 'test');
    const start = await actor.agent
      .get('/api/auth/line/start')
      .query({ returnTo: '/me/reviews' })
      .expect(302);
    const state = new URL(start.headers.location).searchParams.get('state');
    await actor.agent
      .get('/api/auth/line/callback')
      .query({ state, code: 'ok' })
      .expect(302);
    const me = await actor.agent.get('/api/auth/me').expect(200);
    expect(me.body.id).toBe(actor.user.id);
    expect(me.body.role).toBe('admin');
    expect(await users.countDocuments()).toBe(1);
    await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Cookie', actor.cookie)
      .expect(401);
  });

  it('rejects altered state and consumes simultaneous callback attempts only once', async () => {
    const agent = request.agent(app.getHttpServer());
    const start = await agent.get('/api/auth/line/start').expect(302);
    const authorize = new URL(start.headers.location);
    const state = authorize.searchParams.get('state');
    const wrongState = (state!.startsWith('a') ? 'b' : 'a') + state!.slice(1);
    await agent
      .get('/api/auth/line/callback')
      .query({ state: wrongState, code: 'ok' })
      .expect(401);
    expect(fetchSpy).not.toHaveBeenCalled();
    const results = await Promise.all([
      agent.get('/api/auth/line/callback').query({ state, code: 'ok' }),
      agent.get('/api/auth/line/callback').query({ state, code: 'ok' }),
    ]);
    expect(results.map((result) => result.status).sort()).toEqual([302, 401]);
    const exchanges = fetchSpy.mock.calls.filter(([url]) =>
      String(url).endsWith('/token'),
    );
    expect(exchanges).toHaveLength(1);
    const verifier = (exchanges[0][1].body as URLSearchParams).get(
      'code_verifier',
    )!;
    expect(createHash('sha256').update(verifier).digest('base64url')).toBe(
      authorize.searchParams.get('code_challenge'),
    );
    expect(await users.countDocuments()).toBe(1);
  });

  it('rejects malformed cookies and sessions whose account has been deleted', async () => {
    const actor = await login();
    await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Cookie', 'bathroom-session=malformed')
      .expect(401);
    await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Cookie', `${actor.cookie}; ${actor.cookie}`)
      .expect(401);
    await users.deleteOne({ _id: actor.user.id });
    await actor.agent.get('/api/auth/me').expect(401);
  });

  it('checks actual identity and expiry indexes in the isolated database', async () => {
    const userIndexes = await users.collection.indexes();
    expect(userIndexes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: { providerId: 1, lineSubject: 1 },
          unique: true,
        }),
      ]),
    );
    for (const model of [sessions, attempts]) {
      const indexes = await model.collection.indexes();
      expect(indexes).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            key: { expiresAt: 1 },
            expireAfterSeconds: 0,
          }),
        ]),
      );
    }
  });

  it('records no audit events for duplicate revocation and rejects stale role expectations', async () => {
    const actor = await login();
    await expect(
      roles.change(actor.user.id, 'admin', 'admin', 'test'),
    ).rejects.toThrow('Role changed');
    expect(await roles.change(actor.user.id, 'user', 'user', 'test')).toEqual({
      changed: false,
    });
    expect((await users.findById(actor.user.id))?.roleChanges).toHaveLength(0);
  });

  it('emits and clears secure host-only cookies for the HTTPS production configuration', async () => {
    const secureConfig = new AuthConfig(
      new ConfigService({
        NODE_ENV: 'production',
        APP_ORIGIN: 'https://bathroom.example.com',
        LINE_LOGIN_CHANNEL_ID: '12345',
        LINE_LOGIN_CHANNEL_SECRET: 'test-secret',
        LINE_PROVIDER_ID: 'test-provider',
      }),
    );
    const module = await Test.createTestingModule({
      imports: [MongooseModule.forRoot(mongo.getUri()), AuthModule],
    })
      .overrideProvider(AuthConfig)
      .useValue(secureConfig)
      .compile();
    const secureApp = module.createNestApplication();
    secureApp.setGlobalPrefix('api');
    await secureApp.init();
    try {
      // The test transport is local HTTP; Cookie headers are supplied manually.
      const guest = await request(secureApp.getHttpServer())
        .get('/api/auth/csrf')
        .expect(200);
      const header = guest.headers['set-cookie'][0];
      expect(header).toMatch(/^__Host-session=/);
      expect(header).toContain('HttpOnly');
      expect(header).toContain('Secure');
      expect(header).toContain('SameSite=Lax');
      expect(header).toContain('Path=/');
      expect(header).not.toContain('Domain=');
      const signedIn = await request(secureApp.getHttpServer())
        .post('/api/auth/line')
        .set('Cookie', header.split(';')[0])
        .set('Origin', secureConfig.origin)
        .set('X-CSRF-Token', guest.body.csrfToken)
        .send({ idToken: 'valid-a' })
        .expect(200);
      const cookie = signedIn.headers['set-cookie'][0].split(';')[0];
      const logout = await request(secureApp.getHttpServer())
        .post('/api/auth/logout')
        .set('Cookie', cookie)
        .set('Origin', secureConfig.origin)
        .set('X-CSRF-Token', signedIn.body.csrfToken)
        .expect(200);
      expect(logout.headers['set-cookie'][0]).toContain(
        'Expires=Thu, 01 Jan 1970',
      );
      expect(logout.headers['set-cookie'][0]).toContain('Secure');
      await request(secureApp.getHttpServer())
        .get('/api/auth/me')
        .set('Cookie', cookie)
        .expect(401);
    } finally {
      await secureApp.close();
    }
  });
});
