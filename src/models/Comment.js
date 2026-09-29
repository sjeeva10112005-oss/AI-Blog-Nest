const mongoose = require('mongoose');

const COMMENT_STATUSES = ['pending', 'approved', 'spam'];

const commentSchema = new mongoose.Schema(
  {
    blog: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Blog',
      required: true,
      index: true,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    content: {
      type: String,
      required: [true, 'Comment content is required'],
      trim: true,
      maxlength: 2000,
    },
    status: {
      type: String,
      enum: COMMENT_STATUSES,
      default: 'pending',
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('Comment', commentSchema);
module.exports.COMMENT_STATUSES = COMMENT_STATUSES;
