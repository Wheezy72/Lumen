import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mongod;
let app;

function getCookieValue(setCookieHeaders, name) {
  const prefix = `${name}=`;
  const header = (setCookieHeaders || []).find((h) => h.startsWith(prefix));
  if (!header) return null;
  return header.slice(prefix.length).split(';')[0];
}

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
  process.env.COMMON_PASSWORDS_FILE = path.join(__dirname, 'common-passwords.txt');
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

  const csrfToken = getCookieValue(cookies, process.env.CSRF_COOKIE_NAME || 'csrf');
  expect(csrfToken).toBeTruthy();

  const me = await request(app)
    .get('/api/auth/me')
    .set('Cookie', cookies)
    .expect(200);

  expect(me.body.username).toBe('alice');

  await request(app)
    .post('/api/auth/logout')
    .set('Cookie', cookies)
    .set('x-csrf-token', csrfToken)
    .expect(200);

  await request(app)
    .get('/api/auth/me')
    .set('Cookie', cookies)
    .expect(401);
});
