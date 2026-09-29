// Prepares accounts for a recorded demo: one user per role, plus a Thunder Client environment
// file with their tokens already filled in.
//   npm run seed:demo           create (or reset passwords of) the demo users and write demo/thunder-client-demo-env.json
//   npm run seed:demo -- --reset  delete the demo users and everything they created
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const connectDB = require('../src/config/db');
const User = require('../src/models/User');
const Blog = require('../src/models/Blog');
const Comment = require('../src/models/Comment');

const DOMAIN = 'demo.blognest.com';
const PASSWORD = 'demo123';
const DEMO_USERS = [
  { key: 'adminToken', name: 'Demo Admin', email: `admin@${DOMAIN}`, role: 'admin' },
  { key: 'editorToken', name: 'Demo Editor', email: `editor@${DOMAIN}`, role: 'editor' },
  { key: 'token', name: 'Priya (Author)', email: `priya@${DOMAIN}`, role: 'author' },
  { key: 'readerToken', name: 'Rohan (Reader)', email: `rohan@${DOMAIN}`, role: 'reader' },
];
const ENV_FILE = path.join(__dirname, '..', 'demo', 'thunder-client-demo-env.json');

const reset = async () => {
  const users = await User.find({ email: new RegExp(`@${DOMAIN.replace(/\./g, '\\.')}$`) });
  const ids = users.map((u) => u._id);
  const blogs = await Blog.find({ author: { $in: ids } }).select('_id');
  const blogIds = blogs.map((b) => b._id);

  const comments = await Comment.deleteMany({ $or: [{ user: { $in: ids } }, { blog: { $in: blogIds } }] });
  const posts = await Blog.deleteMany({ _id: { $in: blogIds } });
  const removed = await User.deleteMany({ _id: { $in: ids } });
  if (fs.existsSync(ENV_FILE)) fs.unlinkSync(ENV_FILE);

  console.log(`Removed ${removed.deletedCount} demo users, ${posts.deletedCount} posts, ${comments.deletedCount} comments`);
  console.log('Categories are kept; delete unwanted ones via DELETE /api/categories/:id if needed.');
};

const seed = async () => {
  if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET is missing from .env');
  const hash = await bcrypt.hash(PASSWORD, 10);
  const env = {
    base_url: `http://localhost:${process.env.PORT || 5000}`,
    blogId: '',
    commentId: '',
    categoryId: '',
    userId: '',
  };

  for (const demo of DEMO_USERS) {
    const user = await User.findOneAndUpdate(
      { email: demo.email },
      { name: demo.name, email: demo.email, password: hash, role: demo.role },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    env[demo.key] = jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, { expiresIn: '7d' });
    if (demo.role === 'reader') env.userId = String(user._id);
    console.log(`${demo.role.padEnd(7)} ${demo.email}  /  ${PASSWORD}`);
  }

  fs.mkdirSync(path.dirname(ENV_FILE), { recursive: true });
  fs.writeFileSync(ENV_FILE, `${JSON.stringify(env, null, 2)}\n`);
  console.log(`\nThunder Client environment written to demo/thunder-client-demo-env.json (tokens valid 7 days)`);
};

const run = async () => {
  await connectDB();
  if (process.argv.includes('--reset')) await reset();
  else await seed();
  await mongoose.disconnect();
};

run().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
