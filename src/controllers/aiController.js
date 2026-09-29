const { callGemini } = require('../services/geminiService');
const { resolveCategory } = require('../services/categoryService');
const { isStaff } = require('../middleware/roleMiddleware');
const Blog = require('../models/Blog');

const LENGTHS = {
  short: '150-250 words',
  medium: '400-600 words',
  long: '800-1200 words',
};

const cleanGeneratedText = (text) => {
  if (!text) return '';
  return String(text)
    .replace(/^\s*#{1,6}\s*/gm, '')
    .replace(/^\s*[\*\-\+]\s*/gm, '')
    .replace(/\*{1,3}(.+?)\*{1,3}/g, '$1')
    .replace(/[\*_]{2,}/g, '')
    .replace(/\r\n|\r/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
};

const inferCategory = (topic) => {
  const normalized = topic.toLowerCase();
  const mapping = [
    { keywords: ['ai', 'technology', 'software', 'programming', 'cloud'], category: 'Technology' },
    { keywords: ['learning', 'school', 'education', 'teaching', 'study'], category: 'Education' },
    { keywords: ['health', 'fitness', 'medicine', 'wellness', 'mental'], category: 'Health' },
    { keywords: ['sports', 'football', 'basketball', 'soccer', 'athlete'], category: 'Sports' },
    { keywords: ['lifestyle', 'fashion', 'travel', 'home', 'beauty'], category: 'Lifestyle' },
    { keywords: ['business', 'startup', 'finance', 'economy', 'marketing'], category: 'Business' },
    { keywords: ['travel', 'tourism', 'destination', 'adventure', 'holiday'], category: 'Travel' },
    { keywords: ['money', 'investment', 'stocks', 'banking', 'crypto'], category: 'Finance' },
    { keywords: ['entertainment', 'movies', 'music', 'celebrity', 'gaming'], category: 'Entertainment' },
  ];

  const match = mapping.find((item) => item.keywords.some((keyword) => normalized.includes(keyword)));
  return match ? match.category : 'General';
};

// Resolves text to work on from either { content } or { blogId } in the body.
const getSourceText = async (req) => {
  if (req.body.content) return req.body.content;
  const blog = await Blog.findById(req.body.blogId);
  if (!blog || (blog.status !== 'published' && String(blog.author) !== String(req.user._id) && !isStaff(req.user))) {
    return null;
  }
  return `${blog.title}\n\n${blog.content}`;
};

// POST /api/ai/generate-blog — creates a draft (or pending) post from a topic
const generateBlog = async (req, res, next) => {
  try {
    const { topic, category, tone = 'friendly and informative', length = 'short', status = 'draft' } = req.body;
    const prompt = `You are a professional blog writer. Write a blog post about "${topic}" in a ${tone} tone, ${LENGTHS[length] || LENGTHS.short} long.
Include an engaging introduction, the key points, and a conclusion, as plain paragraphs separated by blank lines.
Do not use markdown, headings, bullet symbols or asterisks.
Respond with JSON only, in this shape:
{"title": "catchy title", "excerpt": "one or two sentence teaser under 200 characters", "content": "full post text", "tags": ["3 to 6 lowercase tags"]}`;

    const result = await callGemini(prompt, { json: true });
    const content = cleanGeneratedText(result.content);
    if (!content) {
      return res.status(502).json({ message: 'AI did not return any content, please try again' });
    }

    const resolvedCategory = await resolveCategory(category || inferCategory(topic));
    const blog = await Blog.create({
      title: cleanGeneratedText(result.title) || `Guide to ${topic}`,
      excerpt: cleanGeneratedText(result.excerpt).slice(0, 500) || undefined,
      content,
      tags: Array.isArray(result.tags) ? result.tags.slice(0, 6) : [],
      category: resolvedCategory._id,
      status,
      aiGenerated: true,
      author: req.user._id,
      authorName: req.user.name,
    });

    res.status(201).json(blog);
  } catch (error) {
    next(error);
  }
};

// POST /api/ai/summarize — { content } or { blogId }
const summarizeBlog = async (req, res, next) => {
  try {
    const source = await getSourceText(req);
    if (!source) {
      return res.status(404).json({ message: 'Blog not found' });
    }
    const prompt = `Summarize the following blog content in a short, easy-to-read paragraph:\n\n${source}`;
    const summaryText = await callGemini(prompt);

    res.json({ summary: cleanGeneratedText(summaryText) });
  } catch (error) {
    next(error);
  }
};

// POST /api/ai/quality-audit — style and quality review for editors/admins
const qualityAudit = async (req, res, next) => {
  try {
    const source = await getSourceText(req);
    if (!source) {
      return res.status(404).json({ message: 'Blog not found' });
    }
    const prompt = `You are a senior blog editor. Audit the following blog post for quality.
Respond with JSON only, in this shape:
{"overallScore": 0-100, "scores": {"readability": 0-10, "grammar": 0-10, "structure": 0-10, "engagement": 0-10, "seo": 0-10},
 "tone": "short description", "strengths": ["..."], "issues": ["..."], "suggestions": ["concrete, actionable edits"],
 "verdict": "publish" | "minor-edits" | "major-edits"}

Post:
${source}`;

    res.json(await callGemini(prompt, { json: true }));
  } catch (error) {
    next(error);
  }
};

// POST /api/ai/faq — FAQ list for a topic or an existing post
const generateFaq = async (req, res, next) => {
  try {
    const { topic, count = 5 } = req.body;
    const source = topic || (await getSourceText(req));
    if (!source) {
      return res.status(404).json({ message: 'Blog not found' });
    }
    const prompt = `Write ${count} frequently asked questions with clear, concise answers about the following.
Respond with JSON only: {"faqs": [{"question": "...", "answer": "..."}]}

${source}`;

    res.json(await callGemini(prompt, { json: true }));
  } catch (error) {
    next(error);
  }
};

// POST /api/ai/weatherwise — general weather-aware guidance (no live weather data)
const weatherWise = async (req, res, next) => {
  try {
    const { location, date, activity, conditions } = req.body;
    const prompt = `You are WeatherWise, a helpful weather advisor. You do not have live forecast data, so base your answer on
typical climate for the place and season${conditions ? ` and these reported conditions: ${conditions}` : ''}.
Location: ${location}${date ? `\nDate: ${date}` : ''}${activity ? `\nPlanned activity: ${activity}` : ''}
Respond with JSON only:
{"summary": "...", "expectedConditions": "...", "whatToWear": ["..."], "tips": ["..."], "blogIdeas": ["weather-related blog post ideas"],
 "disclaimer": "remind the user to check a live forecast"}`;

    res.json(await callGemini(prompt, { json: true }));
  } catch (error) {
    next(error);
  }
};

// POST /api/ai/fittrack — personalised workout suggestions
const fitTrack = async (req, res, next) => {
  try {
    const { goal, fitnessLevel = 'beginner', daysPerWeek = 3, minutesPerSession = 30, equipment = 'none' } = req.body;
    const prompt = `You are FitTrack, a fitness coach. Build a weekly plan.
Goal: ${goal}
Fitness level: ${fitnessLevel}
Days per week: ${daysPerWeek}
Minutes per session: ${minutesPerSession}
Equipment: ${equipment}
Respond with JSON only:
{"overview": "...", "weeklyPlan": [{"day": "Day 1", "focus": "...", "exercises": [{"name": "...", "sets": 3, "reps": "10-12", "notes": "..."}]}],
 "nutritionTips": ["..."], "progressTracking": ["what to measure each week"],
 "disclaimer": "advise consulting a professional before starting a new program"}`;

    res.json(await callGemini(prompt, { json: true }));
  } catch (error) {
    next(error);
  }
};

module.exports = {
  generateBlog,
  summarizeBlog,
  qualityAudit,
  generateFaq,
  weatherWise,
  fitTrack,
};
