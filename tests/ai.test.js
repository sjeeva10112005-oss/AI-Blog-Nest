jest.mock('../src/services/geminiService', () => ({ callGemini: jest.fn() }));

const { callGemini } = require('../src/services/geminiService');
const { app, request, setupDb, createUser, createPost } = require('./helpers');

setupDb();

beforeEach(() => callGemini.mockReset());

describe('ai', () => {
  it('generates a draft post from structured Gemini output', async () => {
    const { auth } = await createUser('author');
    callGemini.mockResolvedValue({
      title: 'Why **React** Still Matters',
      excerpt: 'A quick look at React.',
      content: '## Intro\nReact is great.\n\n\n\nThe end.',
      tags: ['react', 'frontend'],
    });

    const res = await request(app).post('/api/ai/generate-blog').set(auth).send({ topic: 'React.js' });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      title: 'Why React Still Matters',
      content: 'Intro\nReact is great.\n\nThe end.',
      status: 'draft',
      aiGenerated: true,
      tags: ['react', 'frontend'],
    });
    expect(callGemini).toHaveBeenCalledWith(expect.stringContaining('React.js'), { json: true });
  });

  it('does not let readers generate posts or authors publish AI posts', async () => {
    const reader = await createUser('reader');
    expect((await request(app).post('/api/ai/generate-blog').set(reader.auth).send({ topic: 'x' })).status).toBe(403);
    const author = await createUser('author');
    const res = await request(app).post('/api/ai/generate-blog').set(author.auth).send({ topic: 'x', status: 'published' });
    expect(res.status).toBe(422);
  });

  it('summarizes raw content or a stored post, and requires login', async () => {
    const editor = await createUser('editor');
    callGemini.mockResolvedValue('A **short** summary.');

    expect((await request(app).post('/api/ai/summarize').send({ content: 'x' })).status).toBe(401);

    const byContent = await request(app).post('/api/ai/summarize').set(editor.auth).send({ content: 'Long text' });
    expect(byContent.body.summary).toBe('A short summary.');

    const { body: post } = await createPost(editor.auth, { status: 'published' });
    await request(app).post('/api/ai/summarize').set(editor.auth).send({ blogId: post._id });
    expect(callGemini).toHaveBeenLastCalledWith(expect.stringContaining('Some useful content here.'));

    expect((await request(app).post('/api/ai/summarize').set(editor.auth).send({})).status).toBe(422);
  });

  it('restricts quality audits to staff', async () => {
    const author = await createUser('author');
    const editor = await createUser('editor');
    callGemini.mockResolvedValue({ overallScore: 80 });

    expect((await request(app).post('/api/ai/quality-audit').set(author.auth).send({ content: 'x' })).status).toBe(403);
    const res = await request(app).post('/api/ai/quality-audit').set(editor.auth).send({ content: 'x' });
    expect(res.body).toEqual({ overallScore: 80 });
  });

  it('serves faq, weatherwise and fittrack', async () => {
    const { auth } = await createUser('reader');
    callGemini.mockResolvedValue({ ok: true });

    expect((await request(app).post('/api/ai/faq').set(auth).send({ topic: 'Node.js' })).body).toEqual({ ok: true });
    expect((await request(app).post('/api/ai/weatherwise').set(auth).send({ location: 'Chennai' })).body).toEqual({ ok: true });
    expect((await request(app).post('/api/ai/fittrack').set(auth).send({ goal: 'Run 5k' })).body).toEqual({ ok: true });
    expect((await request(app).post('/api/ai/fittrack').set(auth).send({})).status).toBe(422);
  });

  it('passes Gemini failures through as 502', async () => {
    const { auth } = await createUser('reader');
    const err = new Error('upstream down');
    err.status = 502;
    callGemini.mockRejectedValue(err);
    const res = await request(app).post('/api/ai/summarize').set(auth).send({ content: 'x' });
    expect(res.status).toBe(502);
  });
});
