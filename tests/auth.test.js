const { app, request, setupDb, createUser } = require('./helpers');

setupDb();

describe('auth', () => {
  it('registers a reader by default and hides the password', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Rohan', email: 'rohan@gmail.com', password: '123456' });
    expect(res.status).toBe(201);
    expect(res.body.user).toMatchObject({ name: 'Rohan', email: 'rohan@gmail.com', role: 'reader' });
    expect(res.body.user.password).toBeUndefined();
  });

  it('allows registering as author but never as admin', async () => {
    const author = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Priya', email: 'priya@test.com', password: '123456', role: 'author' });
    expect(author.body.user.role).toBe('author');

    const admin = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Eve', email: 'eve@test.com', password: '123456', role: 'admin' });
    expect(admin.status).toBe(422);
  });

  it('rejects duplicate emails and bad credentials', async () => {
    const body = { name: 'A', email: 'a@test.com', password: '123456' };
    await request(app).post('/api/auth/register').send(body);
    expect((await request(app).post('/api/auth/register').send(body)).status).toBe(400);
    expect((await request(app).post('/api/auth/login').send({ email: 'a@test.com', password: 'wrong1' })).status).toBe(401);
  });

  it('logs in and returns the profile with role', async () => {
    const { auth } = await createUser('editor');
    const res = await request(app).get('/api/auth/profile').set(auth);
    expect(res.status).toBe(200);
    expect(res.body.role).toBe('editor');
  });

  it('rejects missing or invalid tokens', async () => {
    expect((await request(app).get('/api/auth/profile')).status).toBe(401);
    expect((await request(app).get('/api/auth/profile').set({ Authorization: 'Bearer nope' })).status).toBe(401);
  });

  it('strips NoSQL operators from the body', async () => {
    await createUser('reader', { email: 'victim@test.com' });
    const res = await request(app).post('/api/auth/login').send({ email: { $gt: '' }, password: { $gt: '' } });
    expect(res.status).toBe(422);
  });

  it('returns 404 JSON for unknown routes', async () => {
    const res = await request(app).get('/api/nope');
    expect(res.status).toBe(404);
    expect(res.body.message).toMatch(/Route not found/);
  });
});
