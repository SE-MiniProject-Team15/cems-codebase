const express = require('express');
const mongoose = require('mongoose');

const router = express.Router();
const DATABASE_STATES = {
  0: 'disconnected',
  1: 'connected',
  2: 'connecting',
  3: 'disconnecting',
};

router.get('/', (req, res) => {
  const readyState = mongoose.connection.readyState;

  return res.status(200).json({
    status: readyState === 1 ? 'healthy' : 'degraded',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    database: {
      readyState,
      state: DATABASE_STATES[readyState] || 'unknown',
    },
  });
});

module.exports = router;
