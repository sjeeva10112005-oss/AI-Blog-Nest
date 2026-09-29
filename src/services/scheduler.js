const Blog = require('../models/Blog');

// Moves every scheduled post whose publishAt has passed to published.
const publishDuePosts = async () => {
  const now = new Date();
  const result = await Blog.updateMany(
    { status: 'scheduled', publishAt: { $lte: now } },
    { $set: { status: 'published', publishedAt: now } }
  );
  if (result.modifiedCount > 0 && process.env.NODE_ENV !== 'test') {
    console.log(`Scheduler: published ${result.modifiedCount} scheduled post(s)`);
  }
  return result.modifiedCount;
};

const startScheduler = (intervalMs = 60 * 1000) => {
  const run = () => publishDuePosts().catch((err) => console.error('Scheduler error:', err.message));
  run();
  const timer = setInterval(run, intervalMs);
  timer.unref();
  return timer;
};

module.exports = { publishDuePosts, startScheduler };
