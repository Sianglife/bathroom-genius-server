import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { getModelToken, MongooseModule } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import { Model, Types } from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import { AuthConfig } from '../auth/auth.config';
import { AuthModule } from '../auth/auth.module';
import { ReviewsModule } from '../reviews/reviews.module';
import { Toilet } from './schemas/toilet.schema';
import { ToiletsModule } from './toilets.module';

jest.setTimeout(120000);

describe('Public restroom search (isolated geospatial database)', () => {
  let app: INestApplication;
  let mongo: MongoMemoryServer;
  let toilets: Model<Toilet>;
  const id = (index: number) =>
    new Types.ObjectId(index.toString(16).padStart(24, '0'));

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
            APP_ORIGIN: 'http://127.0.0.1:5173',
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
    await app.init();
    toilets = module.get(getModelToken(Toilet.name));
    await toilets.init();
    await toilets.insertMany(
      Array.from({ length: 13 }, (_, index) => ({
        _id: id(index + 1),
        name: index === 0 ? '公園(東側)' : `廁所 ${index + 1}`,
        address: '臺北市測試地址',
        location: {
          type: 'Point',
          coordinates:
            index === 12
              ? [122, 26]
              : [121.5 + Math.max(0, index - 1) * 0.0001, 25],
        },
        avgCleanScore: index === 0 ? 1 : index === 1 ? 0 : 4,
        avgConvenienceScore: index === 1 ? 0 : 4,
        reviewCount: index === 1 ? 0 : 1,
        hasToiletPaper: index === 0 ? false : index === 1 ? null : true,
        isAccessible: index === 2,
        tags: index === 2 ? ['親子'] : [],
      })),
    );
  });
  afterAll(async () => {
    await app?.close();
    await mongo?.stop();
  });

  const nearby = (query: Record<string, unknown> = {}) =>
    request(app.getHttpServer())
      .get('/api/toilets/nearby')
      .query({ lat: 25, lng: 121.5, ...query });

  it('paginates nearby data with a filtered total and stable distance/id ordering', async () => {
    const first = await nearby().expect(200);
    expect(first.body).toMatchObject({
      total: 12,
      page: 1,
      limit: 10,
      hasMore: true,
    });
    expect(first.body.data).toHaveLength(10);
    expect(first.body.data.slice(0, 2).map((toilet) => toilet._id)).toEqual([
      id(1).toHexString(),
      id(2).toHexString(),
    ]);
    expect(first.body.data[0].distance).toBeCloseTo(0);
    const second = await nearby({ page: 2 }).expect(200);
    expect(second.body).toMatchObject({ total: 12, page: 2, hasMore: false });
    expect(second.body.data).toHaveLength(2);
    expect(second.body.data.map((toilet) => toilet._id)).toEqual([
      id(11).toHexString(),
      id(12).toHexString(),
    ]);
    const beyond = await nearby({ page: 99 }).expect(200);
    expect(beyond.body).toMatchObject({ data: [], total: 12, hasMore: false });
  });

  it('has no default rating floor and retains unrated toilets when a minimum is set', async () => {
    expect((await nearby().expect(200)).body.data[0].avgCleanScore).toBe(1);
    const filtered = await nearby({
      minCleanScore: 4,
      minConvenienceScore: 4,
    }).expect(200);
    expect(filtered.body.total).toBe(11);
    expect(filtered.body.data[0]._id).toBe(id(2).toHexString());
  });

  it('applies facilities, tags, radius and keywords before counting', async () => {
    expect(
      (await nearby({ hasToiletPaper: false }).expect(200)).body.total,
    ).toBe(1);
    expect(
      (await nearby({ isAccessible: true, tags: '親子' }).expect(200)).body
        .total,
    ).toBe(1);
    expect((await nearby({ search: '(' }).expect(200)).body.total).toBe(1);
    expect((await nearby({ search: '.*' }).expect(200)).body.total).toBe(0);
    expect(
      (await nearby({ lat: -25, lng: -121 }).expect(200)).body,
    ).toMatchObject({ total: 0, data: [], hasMore: false });
  });

  it('uses literal, bounded keywords and stable pagination for the unlocated directory', async () => {
    const literal = await request(app.getHttpServer())
      .get('/api/toilets')
      .query({ search: '(' })
      .expect(200);
    expect(literal.body.total).toBe(1);
    const page = await request(app.getHttpServer())
      .get('/api/toilets')
      .query({ page: 2, limit: 5 })
      .expect(200);
    expect(page.body.total).toBe(13);
    expect(page.body.data[0]._id).toBe(id(6).toHexString());
    await request(app.getHttpServer())
      .get('/api/toilets')
      .query({ search: 'x'.repeat(201) })
      .expect(400);
  });

  it.each([
    { page: 0 },
    { page: 1.5 },
    { lat: 91 },
    { lng: 181 },
    { radius: 0 },
    { radius: 10001 },
    { limit: 101 },
    { search: 'x'.repeat(201) },
  ])('rejects invalid nearby parameters %j', async (query) => {
    await nearby(query).expect(400);
  });
});
