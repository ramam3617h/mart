

//============================================
// 4. UPDATE server.js - ADD NEW ROUTES
// ============================================

/*
STEP 1: Add these imports at the top of server.js:

const settingsRoutes = require('./routes/settings');

STEP 2: Add this route after other routes:

app.use('/api/settings', settingsRoutes);

COMPLETE server.js SHOULD LOOK LIKE:
*/

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');

// Import services
const notificationService = require('./services/notificationService');

// Import routes
const authRoutes = require('./routes/auth');
const productRoutes = require('./routes/products');
const orderRoutes = require('./routes/orders');
const paymentRoutes = require('./routes/payment');
const auditRoutes = require('./routes/audit');
const userRoutes = require('./routes/users');
const notificationRoutes = require('./routes/notifications');
const settingsRoutes = require('./routes/settings'); // NEW LINE

const app = express();

// Security middleware
app.use(helmet());

// CORS configuration
app.use(cors({
  origin: process.env.FRONTEND_URL || '*',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Logging middleware
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
} else {
  app.use(morgan('combined'));
}

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: {
    success: false,
    error: 'Too many requests from this IP, please try again later.'
  },
  standardHeaders: true,
  legacyHeaders: false
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: {
    success: false,
    error: 'Too many login attempts, please try again later.'
  }
});

app.use('/api/', limiter);
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    success: true,
    status: 'OK',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
    notifications: {
      email: process.env.ENABLE_EMAIL === 'true',
      sms: process.env.ENABLE_SMS === 'true',
      whatsapp: process.env.ENABLE_WHATSAPP === 'true'
    }
  });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/payment', paymentRoutes);
app.use('/api/audit-logs', auditRoutes);
app.use('/api/users', userRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/settings', settingsRoutes); // NEW LINE

// Welcome route
app.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'Multi-Tenant E-Commerce API with Complete Admin Features',
    version: '2.0.0',
    features: [
      'Role-based access control',
      'Multi-tenant architecture',
      'Email/SMS/WhatsApp notifications',
      'Razorpay payments',
      'User management',
      'Settings management',
      'Product management',
      'Audit logging'
    ],
    endpoints: {
      health: '/health',
      auth: '/api/auth',
      products: '/api/products',
      orders: '/api/orders',
      payment: '/api/payment',
      auditLogs: '/api/audit-logs',
      users: '/api/users',
      notifications: '/api/notifications',
      settings: '/api/settings'
    }
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Route not found',
    path: req.path
  });
});

// Global error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err.stack);

  res.status(err.status || 500).json({
    success: false,
    error: process.env.NODE_ENV === 'development'
      ? err.message
      : 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

// Initialize notification services
//const initializeServices = async () => {
// Initialize notification services
const initializeServices = async () => {
  await notificationService.verifyAllServices();
};

// Start server
const PORT = process.env.PORT || 5000;

const startServer = async () => {
  try {
    await initializeServices();

    app.listen(PORT, () => {
      console.log('='.repeat(70));
      console.log(' ^=^z^` Multi-Tenant E-Commerce Server Started');
      console.log('='.repeat(70));
      console.log(` ^=^s  Server running on port: ${PORT}`);
      console.log(` ^=^l^m Environment: ${process.env.NODE_ENV}`);
      console.log(` ^=^t^w API Base URL: http://localhost:${PORT}/api`);
      console.log(` ^=^r^j Health Check: http://localhost:${PORT}/health`);
      console.log('\n ^=^s  Notification Services:');
      console.log(`    ^=^s  Email: ${process.env.ENABLE_EMAIL === 'true' ? ' ^|^e Enabled' : ' ^}^l Disabled'}`);
      console.log(`    ^=^s  SMS: ${process.env.ENABLE_SMS === 'true' ? ' ^|^e Enabled' : ' ^}^l Disabled'}`);
      console.log(`    ^=^r  WhatsApp: ${process.env.ENABLE_WHATSAPP === 'true' ? ' ^|^e Enabled' : ' ^}^l Disabled'}`);
      console.log('='.repeat(70));
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM signal received: closing HTTP server');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('SIGINT signal received: closing HTTP server');
  process.exit(0);
});

module.exports = app;





