const slugify = (text) =>
  String(text)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'post';

// Returns a slug that no other document in `Model` uses, appending -2, -3... when taken.
const uniqueSlug = async (Model, text, excludeId) => {
  const base = slugify(text);
  let candidate = base;
  let n = 2;
  // eslint-disable-next-line no-await-in-loop
  while (await Model.exists({ slug: candidate, ...(excludeId && { _id: { $ne: excludeId } }) })) {
    candidate = `${base}-${n}`;
    n += 1;
  }
  return candidate;
};

module.exports = { slugify, uniqueSlug };
