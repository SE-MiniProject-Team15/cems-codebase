function errorHandler(error, req, res, next) {
  const withRequestId = (payload) => ({
    ...payload,
    ...(req?.id ? { requestId: req.id } : {}),
  });

  if (res.headersSent) {
    return next(error);
  }

  if (error?.type === 'entity.parse.failed') {
    return res.status(400).json(withRequestId({
      status: 'fail',
      message: 'Malformed JSON request body',
    }));
  }

  if (error?.type === 'entity.too.large') {
    return res.status(413).json(withRequestId({
      status: 'fail',
      message: 'Request body is too large',
    }));
  }

  if (
    error?.name === 'ValidationError' ||
    error?.name === 'CastError'
  ) {
    return res.status(400).json(withRequestId({
      status: 'fail',
      message: 'Invalid request data',
    }));
  }

  if (Number.isInteger(error?.statusCode) && error.statusCode >= 400 && error.statusCode < 500) {
    return res.status(error.statusCode).json(withRequestId({
      status: 'fail',
      message: error.message,
    }));
  }

  console.error('Unhandled request error:', error?.name || 'Error');
  return res.status(500).json(withRequestId({
    status: 'error',
    message: 'Internal server error',
  }));
}

module.exports = errorHandler;
