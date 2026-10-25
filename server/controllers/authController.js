
const User = require('../models/User');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { getJwtSecret } = require('../config/auth');

function serializeUser(user) {
  return {
    id: user._id,
    name: user.name,
    email: user.email,
    role: user.role,
  };
}

function setAuthCookie(res, token) {
  res.cookie('token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge: 24 * 60 * 60 * 1000,
  });
}

async function registerUser(req, res, next) {
  const {
    name,
    email: submittedEmail,
    password,
    role: submittedRole,
  } = req.body || {};

  if (typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({
      status: 'fail',
      message: 'Name is required',
    });
  }

  if (
    typeof submittedEmail !== 'string' ||
    !submittedEmail.trim()
  ) {
    return res.status(400).json({
      status: 'fail',
      message: 'A valid email address is required',
    });
  }

  if (typeof password !== 'string' || !password) {
    return res.status(400).json({
      status: 'fail',
      message: 'Password is required',
    });
  }

  if (password.length < 8) {
    return res.status(400).json({
      status: 'fail',
      message: 'Password must be at least 8 characters',
    });
  }

  const email = submittedEmail.trim().toLowerCase();

  try {
    const existingUser = await User.findOne({ email });

    if (existingUser) {
      return res.status(409).json({
        status: 'fail',
        message: 'Email already registered',
      });
    }

    let role = 'Student';

    if (submittedRole !== undefined && submittedRole !== null) {
      if (typeof submittedRole !== 'string') {
        return res.status(400).json({
          status: 'fail',
          message: 'Role must be Student or Organizer',
        });
      }

      const normalizedRole = submittedRole.trim().toLowerCase();

      if (normalizedRole === 'admin') {
        return res.status(403).json({
          status: 'fail',
          message: 'Administrator accounts cannot be self-registered',
        });
      }

      if (normalizedRole === 'student') {
        role = 'Student';
      } else if (normalizedRole === 'organizer') {
        role = 'Organizer';
      } else if (normalizedRole) {
        return res.status(400).json({
          status: 'fail',
          message: 'Role must be Student or Organizer',
        });
      }
    }

    const user = await User.create({
      name: name.trim(),
      email,
      password,
      role,
    });
    const token = jwt.sign(
      { id: user._id, role: user.role },
      getJwtSecret(),
      { expiresIn: '1d' }
    );

    setAuthCookie(res, token);

    return res.status(201).json({
      status: 'success',
      data: { user: serializeUser(user) },
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({
        status: 'fail',
        message: 'Email already registered',
      });
    }

    return next(error);
  }
}

async function loginUser(req, res, next) {
  const { email: submittedEmail, password } = req.body || {};

  if (
    typeof submittedEmail !== 'string' ||
    !submittedEmail.trim() ||
    typeof password !== 'string' ||
    !password
  ) {
    return res.status(400).json({
      status: 'fail',
      message: 'Email and password are required',
    });
  }

  try {
    const email = submittedEmail.trim().toLowerCase();
    const user = await User.findOne({ email }).select('+password');

    if (!user) {
      return res.status(401).json({
        status: 'fail',
        message: 'Invalid email or password',
      });
    }

    const passwordMatches = await bcrypt.compare(
      password,
      user.password
    );

    if (!passwordMatches) {
      return res.status(401).json({
        status: 'fail',
        message: 'Invalid email or password',
      });
    }

    const token = jwt.sign(
      { id: user._id, role: user.role },
      getJwtSecret(),
      { expiresIn: '1d' }
    );

    setAuthCookie(res, token);

    return res.status(200).json({
      status: 'success',
      data: { user: serializeUser(user) },
    });
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  registerUser,
  loginUser,
};
