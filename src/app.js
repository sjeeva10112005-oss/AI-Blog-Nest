const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const mongoSanitize = require('express-mongo-sanitize');
const authRoutes = require('./routes/authRoutes');
const blogRoutes = require('./routes/blogRoutes');
const categoryRoutes = require('./routes/categoryRoutes');
const commentRoutes = require('./routes/commentRoutes');
const adminRoutes = require('./routes/adminRoutes');
const aiRoutes = require('./routes/aiRoutes');
const jsonBody = require('./middleware/jsonBody');
const errorMiddleware = require('./middleware/errorMiddleware');
const { notFound } = require('./middleware/errorMiddleware');
const { globalLimiter, authLimiter, aiLimiter, xssClean } = require('./middleware/securityMiddleware');

const app = express();

app.set('trust proxy', 1);
app.use(helmet());
app.use(cors());
app.use(jsonBody);
if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('dev'));
}
app.use(mongoSanitize());
app.use(xssClean);
app.use('/api', globalLimiter);

app.get('/', (req, res) => {
  res.json({ message: 'AI BlogNest API is running' });
});

app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/blogs', blogRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/comments', commentRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/ai', aiLimiter, aiRoutes);

app.use(notFound);
app.use(errorMiddleware);

module.exports = app;
