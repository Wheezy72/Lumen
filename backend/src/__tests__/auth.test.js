import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';

let mongod;
let app;

afterAll(async () => {
  if (mongoose.connection.readyState) {
    await mongoose.disconnect();
  }
  if (mongod) {
    await mongod.stop();
  }
});

test('register -> me -> logout invalidates session', async () => {
  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = 'test_secret_123';
  process.env.COOKIE_DOMAIN = '';
  process.env.COOKIE_SECURE = 'false';
  process.env.PWNED_PASSWORDS_CHECK = 'false';
  process.env.ALLOW_PRIVATE_TARGETS = 'true';

  mongod = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongod.getUri();

  ({ app } = await import('../index.js'));

  const reg = await request(app)
    .post('/api/auth/register')
    .send({ username: 'alice', password: 'Str0ng!Password12' })
    .expect(200);

  expect(reg.body.username).toBe('alice');

  const cookies = reg.headers['set-cookie'];
  expect(Array.isArray(cookies)).toBe(true);

  const me = await request(app)
    .get('/api/auth/me')
    .set('Cookie', cookies)
    .expect(200);

  expect(me.body.username).toBe('alice');

  await request(app)
    .post('/api/auth/logout')
    .set('Cookie', cookies)
    .expect(200);

  await request(app)
    .get('/api/auth/me')
    .set('Cookie', cookies)
    .expect(401);
});
