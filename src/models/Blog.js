const mongoose = require('mongoose');
const { uniqueSlug } = require('../utils/slugify');

const STATUSES = ['draft', 'pending', 'scheduled', 'published'];

const blogSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, 'Title is required'],
      trim: true,
    },
    slug: {
      type: String,
      unique: true,
      lowercase: true,
    },
    excerpt: {
      type: String,
      trim: true,
      maxlength: 500,
    },
    content: {
      type: String,
      required: [true, 'Content is required'],
    },
    coverImage: {
      type: String,
      trim: true,
    },
    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Category',
      required: [true, 'Category is required'],
    },
    tags: {
      type: [String],
      default: [],
      set: (tags) => [...new Set((tags || []).map((t) => String(t).trim().toLowerCase()).filter(Boolean))],
    },
    status: {
      type: String,
      enum: STATUSES,
      default: 'draft',
    },
    publishAt: Date,
    publishedAt: Date,
    author: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    authorName: {
      type: String,
      required: true,
      trim: true,
    },
    likes: {
      type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
      default: [],
      select: false,
    },
    likesCount: {
      type: Number,
      default: 0,
    },
    views: {
      type: Number,
      default: 0,
    },
    aiGenerated: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

blogSchema.index({ title: 'text', content: 'text', tags: 'text' });
blogSchema.index({ status: 1, publishedAt: -1 });

blogSchema.pre('validate', async function prepare() {
  if (this.isNew || this.isModified('title')) {
    this.slug = await uniqueSlug(this.constructor, this.title, this._id);
  }
  if (!this.excerpt && this.content) {
    const plain = this.content.replace(/\s+/g, ' ').trim();
    this.excerpt = plain.length > 200 ? `${plain.slice(0, 197)}...` : plain;
  }
  if (this.isModified('status') && this.status === 'published' && !this.publishedAt) {
    this.publishedAt = new Date();
  }
});

module.exports = mongoose.model('Blog', blogSchema);
module.exports.STATUSES = STATUSES;
