
const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors');
const cookieParser = require('cookie-parser');

const connectDB = require('./config/db');
const authRouter = require('./routes/authRoutes');
const dashboardRouter = require('./routes/dashboardRoutes');
const eventRouter = require('./routes/eventRoutes');
const notificationRouter = require('./routes/notificationRoutes');
const { startReminderJob } = require('./services/reminderJob');
const errorHandler = require('./middleware/errorHandler');

dotenv.config();

const app = express();

const trustedProxies = (process.env.TRUST_PROXY || '')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);

if (trustedProxies.length) {
  app.set('trust proxy', trustedProxies);
}

app.disable('x-powered-by');

// Security headers and HTTPS enforcement in production.
app.use((req, res, next) => {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'no-referrer',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  });

  if (process.env.NODE_ENV === 'production') {
    res.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');

    if (!req.secure) {
      return res.status(400).json({
        status: 'fail',
        message: 'HTTPS is required',
      });
    }
  }

  next();
});

app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:5173',
  credentials: true,
}));

app.use(express.json({ limit: '10kb' }));
app.use(cookieParser());

// Application routes
app.use('/api/auth', authRouter);
app.use('/api/dashboard', dashboardRouter);
app.use('/api/events', eventRouter);
app.use('/api/notifications', notificationRouter);

app.use(errorHandler);

function validateEnvironment() {
  const required = ['MONGO_URI', 'JWT_SECRET'];
  const missing = required.filter((name) => !process.env[name]);

  if (missing.length) {
    throw new Error(
      `Missing required environment variables: ${missing.join(', ')}`
    );
  }

  if (
    process.env.NODE_ENV === 'production' &&
    !process.env.CLIENT_URL?.startsWith('https://')
  ) {
    throw new Error('CLIENT_URL must use HTTPS in production');
  }
}

async function startServer() {
  try {
    validateEnvironment();
    await connectDB();

    const port = process.env.PORT || 5000;

    app.listen(port, () => {
      console.log(`Server listening on port ${port}`);

      // Start the event reminder job after the server starts.
      startReminderJob();
    });
  } catch (error) {
    console.error('Failed to start server:', error.message);
    process.exitCode = 1;
  }
}

if (require.main === module) {
  startServer();
}

module.exports = app;
module.exports.validateEnvironment = validateEnvironment;
