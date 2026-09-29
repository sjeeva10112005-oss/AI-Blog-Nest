process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret';
process.env.GEMINI_API_KEY = 'test-key';

const mongoose = require('mongoose');
const request = require('supertest');
const bcrypt = require('bcryptjs');
const { MongoMemoryServer } = require('mongodb-memory-server');
const app = require('../src/app');
const User = require('../src/models/User');

let mongo;

const setupDb = () => {
  beforeAll(async () => {
    mongo = await MongoMemoryServer.create();
    await mongoose.connect(mongo.getUri());
  });

  afterEach(async () => {
    const collections = await mongoose.connection.db.collections();
    await Promise.all(collections.map((c) => c.deleteMany({})));
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongo.stop();
  });
};

// Creates a user directly with the given role and returns { user, token, auth }.
const createUser = async (role = 'reader', overrides = {}) => {
  const email = overrides.email || `${role}-${new mongoose.Types.ObjectId()}@test.com`;
  const password = 'secret123';
  const user = await User.create({
    name: overrides.name || `${role} user`,
    email,
    password: await bcrypt.hash(password, 4),
    role,
  });
  const res = await request(app).post('/api/auth/login').send({ email, password });
  return { user, token: res.body.token, auth: { Authorization: `Bearer ${res.body.token}` } };
};

const createPost = (auth, overrides = {}) =>
  request(app)
    .post('/api/blogs')
    .set(auth)
    .send({ title: 'Hello World', content: 'Some useful content here.', category: 'Technology', ...overrides });

module.exports = { app, request, setupDb, createUser, createPost };
