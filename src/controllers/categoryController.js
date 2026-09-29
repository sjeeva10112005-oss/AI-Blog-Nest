const Category = require('../models/Category');
const Blog = require('../models/Blog');
const { findCategory } = require('../services/categoryService');

// GET /api/categories — with the number of published posts in each
const getCategories = async (req, res, next) => {
  try {
    const [categories, counts] = await Promise.all([
      Category.find().sort({ name: 1 }).lean(),
      Blog.aggregate([{ $match: { status: 'published' } }, { $group: { _id: '$category', count: { $sum: 1 } } }]),
    ]);
    const countMap = new Map(counts.map((c) => [String(c._id), c.count]));
    res.json(categories.map((c) => ({ ...c, postCount: countMap.get(String(c._id)) || 0 })));
  } catch (error) {
    next(error);
  }
};

const getCategory = async (req, res, next) => {
  try {
    const category = await findCategory(req.params.id);
    if (!category) {
      return res.status(404).json({ message: 'Category not found' });
    }
    res.json(category);
  } catch (error) {
    next(error);
  }
};

const createCategory = async (req, res, next) => {
  try {
    const { name, description } = req.body;
    if (await findCategory(name)) {
      return res.status(409).json({ message: 'Category already exists' });
    }
    const category = await Category.create({ name, description });
    res.status(201).json(category);
  } catch (error) {
    next(error);
  }
};

const updateCategory = async (req, res, next) => {
  try {
    const category = await Category.findById(req.params.id);
    if (!category) {
      return res.status(404).json({ message: 'Category not found' });
    }
    const { name, description } = req.body;
    if (name) category.name = name;
    if (description !== undefined) category.description = description;
    await category.save();
    res.json(category);
  } catch (error) {
    next(error);
  }
};

// DELETE /api/categories/:id — refuses while posts still use it, unless ?reassignTo=<category>
const deleteCategory = async (req, res, next) => {
  try {
    const category = await Category.findById(req.params.id);
    if (!category) {
      return res.status(404).json({ message: 'Category not found' });
    }

    const inUse = await Blog.countDocuments({ category: category._id });
    if (inUse > 0) {
      const target = req.query.reassignTo && (await findCategory(req.query.reassignTo));
      if (!target || String(target._id) === String(category._id)) {
        return res.status(409).json({
          message: `Category is used by ${inUse} post(s). Pass ?reassignTo=<category id or name> to move them first.`,
        });
      }
      await Blog.updateMany({ category: category._id }, { category: target._id });
    }

    await category.deleteOne();
    res.json({ message: 'Category deleted successfully', reassigned: inUse });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getCategories,
  getCategory,
  createCategory,
  updateCategory,
  deleteCategory,
};
