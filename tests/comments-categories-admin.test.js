const { app, request, setupDb, createUser, createPost } = require('./helpers');

setupDb();

describe('comments', () => {
  it('holds reader comments for moderation until approved', async () => {
    const editor = await createUser('editor');
    const reader = await createUser('reader');
    const { body: post } = await createPost(editor.auth, { status: 'published' });

    const created = await request(app).post(`/api/blogs/${post._id}/comments`).set(reader.auth).send({ content: 'Nice post!' });
    expect(created.status).toBe(201);
    expect(created.body.status).toBe('pending');

    expect((await request(app).get(`/api/blogs/${post._id}/comments`)).body).toHaveLength(0);
    expect((await request(app).get(`/api/blogs/${post._id}/comments`).set(reader.auth)).body).toHaveLength(1);

    expect((await request(app).get('/api/comments?status=pending').set(reader.auth)).status).toBe(403);
    const queue = await request(app).get('/api/comments?status=pending').set(editor.auth);
    expect(queue.body.total).toBe(1);

    await request(app).patch(`/api/comments/${created.body._id}/status`).set(editor.auth).send({ status: 'approved' });
    const visible = await request(app).get(`/api/blogs/${post._id}/comments`);
    expect(visible.body).toHaveLength(1);
    expect(visible.body[0].user.name).toBe('reader user');
  });

  it('does not allow comments on unpublished posts', async () => {
    const author = await createUser('author');
    const reader = await createUser('reader');
    const { body: post } = await createPost(author.auth);
    const res = await request(app).post(`/api/blogs/${post._id}/comments`).set(reader.auth).send({ content: 'hi' });
    expect(res.status).toBe(404);
  });

  it('lets only the comment owner or staff delete it', async () => {
    const editor = await createUser('editor');
    const reader = await createUser('reader');
    const other = await createUser('reader');
    const { body: post } = await createPost(editor.auth, { status: 'published' });
    const { body: comment } = await request(app).post(`/api/blogs/${post._id}/comments`).set(reader.auth).send({ content: 'x' });

    expect((await request(app).delete(`/api/comments/${comment._id}`).set(other.auth)).status).toBe(403);
    expect((await request(app).delete(`/api/comments/${comment._id}`).set(reader.auth)).status).toBe(200);
  });
});

describe('categories', () => {
  it('lets staff manage categories and protects ones in use', async () => {
    const editor = await createUser('editor');
    const author = await createUser('author');

    expect((await request(app).post('/api/categories').set(author.auth).send({ name: 'Travel' })).status).toBe(403);
    const travel = await request(app).post('/api/categories').set(editor.auth).send({ name: 'Travel', description: 'Trips' });
    expect(travel.status).toBe(201);
    expect(travel.body.slug).toBe('travel');
    expect((await request(app).post('/api/categories').set(editor.auth).send({ name: 'travel' })).status).toBe(409);

    await createPost(author.auth, { category: 'Travel' });
    const blocked = await request(app).delete(`/api/categories/${travel.body._id}`).set(editor.auth);
    expect(blocked.status).toBe(409);

    const moved = await request(app).delete(`/api/categories/${travel.body._id}?reassignTo=General`).set(editor.auth);
    expect(moved.status).toBe(409); // General doesn't exist yet
    await request(app).post('/api/categories').set(editor.auth).send({ name: 'General' });
    const ok = await request(app).delete(`/api/categories/${travel.body._id}?reassignTo=General`).set(editor.auth);
    expect(ok.body).toMatchObject({ reassigned: 1 });

    const list = await request(app).get('/api/categories');
    expect(list.body.map((c) => c.name)).toEqual(['General']);
  });
});

describe('admin', () => {
  it('manages users and roles', async () => {
    const admin = await createUser('admin');
    const editor = await createUser('editor');
    const reader = await createUser('reader');

    expect((await request(app).get('/api/admin/users').set(editor.auth)).status).toBe(403);

    const users = await request(app).get('/api/admin/users?role=reader').set(admin.auth);
    expect(users.body.total).toBe(1);
    expect(users.body.data[0].password).toBeUndefined();

    const promoted = await request(app).patch(`/api/admin/users/${reader.user._id}/role`).set(admin.auth).send({ role: 'author' });
    expect(promoted.body.role).toBe('author');
    expect((await request(app).patch(`/api/admin/users/${admin.user._id}/role`).set(admin.auth).send({ role: 'reader' })).status).toBe(400);
    expect((await request(app).patch(`/api/admin/users/${reader.user._id}/role`).set(admin.auth).send({ role: 'god' })).status).toBe(422);

    expect((await request(app).delete(`/api/admin/users/${reader.user._id}`).set(admin.auth)).status).toBe(200);

    const stats = await request(app).get('/api/admin/stats').set(admin.auth);
    expect(stats.body.users).toEqual({ admin: 1, editor: 1 });
  });
});
