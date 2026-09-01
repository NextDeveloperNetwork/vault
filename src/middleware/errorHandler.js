function errorHandler(err, req, res, next) {
  console.error('[Error Handler]', err);

  const status = err.statusCode || 500;
  const message = process.env.NODE_ENV === 'production' && status === 500
    ? 'Internal Server Error'
    : err.message || 'An unexpected error occurred';

  res.status(status).json({
    error: message
  });
}

module.exports = errorHandler;
