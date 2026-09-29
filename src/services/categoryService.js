const mongoose = require('mongoose');
const Category = require('../models/Category');
const { slugify } = require('../utils/slugify');

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Finds a category by id, slug or name (case-insensitive).
const findCategory = async (value) => {
  if (!value) return null;
  const str = String(value).trim();
  if (mongoose.isValidObjectId(str)) {
    const byId = await Category.findById(str);
    if (byId) return byId;
  }
  return Category.findOne({
    $or: [{ slug: slugify(str) }, { name: new RegExp(`^${escapeRegex(str)}$`, 'i') }],
  });
};

// Like findCategory, but creates the category when a plain name doesn't match anything.
const resolveCategory = async (value) => {
  const existing = await findCategory(value);
  if (existing) return existing;
  return Category.create({ name: String(value).trim() });
};

module.exports = { findCategory, resolveCategory };
