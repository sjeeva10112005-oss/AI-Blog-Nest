// One-time upgrade of data created by the first version of the API:
//  - users without a role get 'reader'
//  - blogs whose category is a plain string get a Category document and an ObjectId reference
//  - blogs without slug/status/excerpt get them (existing posts were public, so they become 'published')
// Safe to run more than once. Usage: npm run migrate
require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../src/config/db');
const Blog = require('../src/models/Blog');
const { resolveCategory } = require('../src/services/categoryService');
const { uniqueSlug } = require('../src/utils/slugify');

const run = async () => {
  await connectDB();
  const db = mongoose.connection.db;

  const users = await db.collection('users').updateMany({ role: { $exists: false } }, { $set: { role: 'reader' } });
  console.log(`Users given default role: ${users.modifiedCount}`);

  const blogs = await db.collection('blogs').find({}).toArray();
  let updated = 0;

  for (const raw of blogs) {
    const set = {};

    if (typeof raw.category === 'string') {
      set.category = (await resolveCategory(raw.category || 'General'))._id;
    } else if (!raw.category) {
      set.category = (await resolveCategory('General'))._id;
    }
    if (!raw.slug) set.slug = await uniqueSlug(Blog, raw.title, raw._id);
    if (!raw.status) {
      set.status = 'published';
      set.publishedAt = raw.createdAt || new Date();
    }
    if (!raw.excerpt && raw.content) {
      const plain = raw.content.replace(/\s+/g, ' ').trim();
      set.excerpt = plain.length > 200 ? `${plain.slice(0, 197)}...` : plain;
    }
    if (raw.likesCount === undefined) set.likesCount = 0;
    if (raw.views === undefined) set.views = 0;
    if (!Array.isArray(raw.tags)) set.tags = [];

    if (Object.keys(set).length) {
      await db.collection('blogs').updateOne({ _id: raw._id }, { $set: set });
      updated += 1;
    }
  }
  console.log(`Blogs migrated: ${updated} of ${blogs.length}`);

  await Blog.syncIndexes();
  console.log('Indexes synced');
  await mongoose.disconnect();
};

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
