const express = require('express');

// Text copied from rendered pages (Markdown previews, docs, chat) often carries non-breaking or
// zero-width spaces that look like normal whitespace but make JSON.parse fail.
const SPACE_LIKE = /[   -   　]/g;
const INVISIBLE = /[​-‍⁠﻿]/g;

const readText = express.text({ type: ['application/json', 'application/*+json'], limit: '1mb' });

const parse = (req, res, next) => {
  if (typeof req.body !== 'string') return next();

  const text = req.body.replace(SPACE_LIKE, ' ').replace(INVISIBLE, '').trim();
  if (!text) {
    req.body = {};
    return next();
  }

  try {
    req.body = JSON.parse(text);
    return next();
  } catch (e) {
    const err = new Error(e.message);
    err.type = 'entity.parse.failed';
    return next(err);
  }
};

module.exports = [readText, parse];
