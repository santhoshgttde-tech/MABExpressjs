const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const swaggerUi = require('swagger-ui-express');
const { nodeEnv, appTimeZone, apiRateLimit, corsOptions } = require('./config/environment');
const { specs } = require('./config/swagger');
const routes = require('./routes');
const { errorHandler, notFoundHandler } = require('./middleware/error.middleware');

const app = express();

app.disable('x-powered-by');
app.use(helmet());
app.use(cors(corsOptions));
app.use(express.json({ limit: '1mb' }));

if (nodeEnv !== 'test') {
  app.use(morgan('dev'));
}

const apiLimiter = rateLimit({
  windowMs: apiRateLimit.windowMs,
  max: apiRateLimit.max,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many requests. Please try again later.',
    errorCode: 'RATE_LIMITED',
  },
});
app.use('/api', apiLimiter);

const healthRoute = (req, res) => {
  res.status(200).json({
    success: true,
    data: {
      status: 'ok',
      service: 'MABExpressjs',
      timezone: appTimeZone,
      serverTimeUtc: new Date().toISOString(),
    },
  });
};

app.get('/health', healthRoute);
app.get('/api/health', healthRoute);

app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(specs, { customSiteTitle: 'Voucher Approval API' }));

app.use('/api', routes);

app.use(notFoundHandler);
app.use(errorHandler);

module.exports = { app };