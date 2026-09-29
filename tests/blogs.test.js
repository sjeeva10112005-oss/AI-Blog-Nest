const { app, request, setupDb, createUser, createPost } = require('./helpers');
const Blog = require('../src/models/Blog');
const { publishDuePosts } = require('../src/services/scheduler');

setupDb();

describe('blogs', () => {
  it('blocks readers from creating posts', async () => {
    const { auth } = await createUser('reader');
    expect((await createPost(auth)).status).toBe(403);
  });

  it('creates a draft with slug, excerpt and a category document', async () => {
    const { auth } = await createUser('author');
    const res = await createPost(auth, { tags: ['Node', 'node', 'API'] });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ status: 'draft', slug: 'hello-world', tags: ['node', 'api'] });
    expect(res.body.excerpt).toBe('Some useful content here.');

    const second = await createPost(auth);
    expect(second.body.slug).toBe('hello-world-2');
  });

  it('runs the full lifecycle: draft -> pending -> published -> public', async () => {
    const author = await createUser('author');
    const editor = await createUser('editor');
    const reader = await createUser('reader');

    const { body: post } = await createPost(author.auth);
    expect((await request(app).get('/api/blogs')).body.total).toBe(0);
    expect((await request(app).get(`/api/blogs/${post._id}`)).status).toBe(404);
    expect((await request(app).get(`/api/blogs/${post._id}`).set(author.auth)).status).toBe(200);

    // Authors cannot publish themselves
    expect((await request(app).put(`/api/blogs/${post._id}`).set(author.auth).send({ status: 'published' })).status).toBe(403);
    expect((await request(app).put(`/api/blogs/${post._id}`).set(author.auth).send({ status: 'pending' })).status).toBe(200);

    const queue = await request(app).get('/api/blogs/review-queue').set(editor.auth);
    expect(queue.body.data.map((b) => b._id)).toContain(post._id);
    expect((await request(app).get('/api/blogs/review-queue').set(author.auth)).status).toBe(403);

    const published = await request(app).patch(`/api/blogs/${post._id}/status`).set(editor.auth).send({ status: 'published' });
    expect(published.status).toBe(200);
    expect(published.body.publishedAt).toBeTruthy();

    const list = await request(app).get('/api/blogs');
    expect(list.body.total).toBe(1);
    expect(list.body.data[0].category.name).toBe('Technology');

    // Views count for other readers, by id or slug
    await request(app).get(`/api/blogs/${post._id}`).set(reader.auth);
    const bySlug = await request(app).get('/api/blogs/hello-world');
    expect(bySlug.body.views).toBe(2);

    // An author editing a live post sends it back for review
    const edited = await request(app).put(`/api/blogs/${post._id}`).set(author.auth).send({ content: 'Updated body' });
    expect(edited.body.status).toBe('pending');
  });

  it('only lets the owner or staff edit and delete', async () => {
    const owner = await createUser('author');
    const other = await createUser('author');
    const admin = await createUser('admin');
    const { body: post } = await createPost(owner.auth);

    expect((await request(app).put(`/api/blogs/${post._id}`).set(other.auth).send({ title: 'x' })).status).toBe(403);
    expect((await request(app).delete(`/api/blogs/${post._id}`).set(other.auth)).status).toBe(403);
    expect((await request(app).delete(`/api/blogs/${post._id}`).set(admin.auth)).status).toBe(200);
    expect(await Blog.countDocuments()).toBe(0);
  });

  it('publishes scheduled posts once their time has passed', async () => {
    const editor = await createUser('editor');
    const future = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const { body: post } = await createPost(editor.auth, { status: 'scheduled', publishAt: future });
    expect(post.status).toBe('scheduled');

    expect(await publishDuePosts()).toBe(0);
    await Blog.updateOne({ _id: post._id }, { publishAt: new Date(Date.now() - 1000) });
    expect(await publishDuePosts()).toBe(1);
    expect((await Blog.findById(post._id)).status).toBe('published');
  });

  it('rejects scheduling without a future date', async () => {
    const editor = await createUser('editor');
    const res = await createPost(editor.auth, { status: 'scheduled' });
    expect(res.status).toBe(400);
  });

  it('searches, filters and paginates', async () => {
    const editor = await createUser('editor');
    await createPost(editor.auth, { title: 'React hooks guide', content: 'useState and useEffect', status: 'published', tags: ['react'] });
    await createPost(editor.auth, { title: 'Healthy breakfast', content: 'Oats and fruit', category: 'Health', status: 'published' });
    await createPost(editor.auth, { title: 'Secret draft', content: 'React draft' });
    await Blog.syncIndexes();

    expect((await request(app).get('/api/blogs?search=react')).body.total).toBe(1);
    expect((await request(app).get('/api/blogs?category=health')).body.total).toBe(1);
    expect((await request(app).get('/api/blogs?tag=react')).body.total).toBe(1);
    const page = await request(app).get('/api/blogs?limit=1&page=2');
    expect(page.body).toMatchObject({ page: 2, limit: 1, total: 2, pages: 2 });
    expect(page.body.data).toHaveLength(1);
  });

  it('toggles likes and reports stats', async () => {
    const editor = await createUser('editor');
    const reader = await createUser('reader');
    const { body: post } = await createPost(editor.auth, { status: 'published' });

    const like = await request(app).post(`/api/blogs/${post._id}/like`).set(reader.auth);
    expect(like.body).toEqual({ liked: true, likesCount: 1 });
    const unlike = await request(app).post(`/api/blogs/${post._id}/like`).set(reader.auth);
    expect(unlike.body).toEqual({ liked: false, likesCount: 0 });

    await request(app).post(`/api/blogs/${post._id}/like`).set(reader.auth);
    const stats = await request(app).get(`/api/blogs/${post._id}/stats`).set(editor.auth);
    expect(stats.body).toMatchObject({ likes: 1, views: 0, comments: { pending: 0, approved: 0, spam: 0 } });

    const mine = await request(app).get('/api/blogs/my-stats').set(editor.auth);
    expect(mine.body).toMatchObject({ posts: 1, published: 1, likes: 1 });
  });

  it('returns 422 for invalid ids', async () => {
    const { auth } = await createUser('author');
    expect((await request(app).put('/api/blogs/not-an-id').set(auth).send({ title: 'x' })).status).toBe(422);
  });

  it('strips script tags from content', async () => {
    const { auth } = await createUser('author');
    const res = await createPost(auth, { content: 'Hi <script>alert(1)</script> there' });
    expect(res.body.content).not.toContain('<script>');
  });
});
