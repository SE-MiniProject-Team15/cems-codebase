const express = require('express')
const dotenv = require('dotenv')
const cors = require('cors')
const cookieParser = require('cookie-parser')
const connectDB = require('./config/db')
const authRouter = require('./routes/authRoutes')
const dashboardRouter = require('./routes/dashboardRoutes')
dotenv.config()
const app = express()
app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:5173',
  credentials: true,
}))
app.use(express.json())
app.use(cookieParser())
app.use('/api/auth', authRouter)
app.use('/api/dashboard', dashboardRouter)
app.use((err, req, res, next) => {
  const statusCode = err.statusCode || 500
  return res.status(statusCode).json({
    status: 'error',
    message: err.message || 'Internal server error',
  })
})
function validateEnvironment() {
  const required = ['MONGO_URI', 'JWT_SECRET']
  const missing = required.filter((name) => !process.env[name])
  if (missing.length) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`)
  }
}
async function startServer() {
  try {
    validateEnvironment()
    await connectDB()
    const port = process.env.PORT || 5000
    app.listen(port, () => {
      console.log(`Server listening on port ${port}`)
    })
  } catch (error) {
    console.error('Failed to start server:', error.message)
    process.exitCode = 1
  }
}
if (require.main === module) {
  startServer()
}
module.exports = app
module.exports.validateEnvironment = validateEnvironment
