// Creates the first admin account, or promotes an existing user to admin.
// Usage: npm run seed:admin   (reads ADMIN_NAME, ADMIN_EMAIL, ADMIN_PASSWORD from .env)
require('dotenv').config();
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const connectDB = require('../src/config/db');
const User = require('../src/models/User');

const run = async () => {
  const { ADMIN_NAME = 'Admin', ADMIN_EMAIL, ADMIN_PASSWORD } = process.env;
  if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
    console.error('Set ADMIN_EMAIL and ADMIN_PASSWORD in .env first');
    process.exit(1);
  }

  await connectDB();
  const email = ADMIN_EMAIL.toLowerCase();
  const existing = await User.findOne({ email });

  if (existing) {
    existing.role = 'admin';
    await existing.save();
    console.log(`Promoted ${email} to admin`);
  } else {
    await User.create({
      name: ADMIN_NAME,
      email,
      password: await bcrypt.hash(ADMIN_PASSWORD, 10),
      role: 'admin',
    });
    console.log(`Created admin ${email}`);
  }

  await mongoose.disconnect();
};

run().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
