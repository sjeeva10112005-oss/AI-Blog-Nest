const mongoose = require('mongoose');
const { uniqueSlug } = require('../utils/slugify');

const categorySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Category name is required'],
      unique: true,
      trim: true,
    },
    slug: {
      type: String,
      unique: true,
      lowercase: true,
    },
    description: {
      type: String,
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

categorySchema.pre('validate', async function setSlug() {
  if (this.isNew || this.isModified('name')) {
    this.slug = await uniqueSlug(this.constructor, this.name, this._id);
  }
});

module.exports = mongoose.model('Category', categorySchema);
