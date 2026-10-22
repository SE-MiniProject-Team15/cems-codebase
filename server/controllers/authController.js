const User = require('../models/User');
const jwt = require('jsonwebtoken');

function serializeUser(user) {
  return {
    id: user._id,
    name: user.name,
    email: user.email,
    role: user.role,
  };
}

async function registerUser(req, res, next) {
  const { name, email: submittedEmail, password, role: submittedRole } = req.body || {};

  if (typeof submittedEmail !== 'string' || !submittedEmail.trim()) {
    return res.status(400).json({ status: 'fail', message: 'A valid email address is required' });
  }

  const email = submittedEmail.trim().toLowerCase();

  try {
    const existingUser = await User.findOne({ email });

    if (existingUser) {
      return res.status(409).json({ status: 'fail', message: 'Email already registered' });
    }

    let role = 'Student';
    if (submittedRole !== undefined && submittedRole !== null) {
      if (typeof submittedRole !== 'string') {
        return res.status(400).json({ status: 'fail', message: 'Role must be Student or Organizer' });
      }

      const normalizedRole = submittedRole.trim().toLowerCase();
      if (normalizedRole === 'admin') {
        return res.status(403).json({
          status: 'fail',
          message: 'Administrator accounts cannot be self-registered',
        });
      }

      if (normalizedRole) {
        switch (normalizedRole) {
          case 'student':
            role = 'Student';
            break;
          case 'organizer':
            role = 'Organizer';
            break;
          default:
            return res.status(400).json({
              status: 'fail',
              message: 'Role must be Student or Organizer',
            });
        }
      }
    }

    const user = await User.create({ name, email, password, role });

    // Generate JWT token on registration so user is logged in immediately
    const token = jwt.sign(
      { id: user._id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '1d' }
    );

    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 24 * 60 * 60 * 1000,
    });

    return res.status(201).json({
      status: 'success',
      data: { user: serializeUser(user) },
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ status: 'fail', message: 'Email already registered' });
    }

    if (error.name === 'ValidationError') {
      return res.status(400).json({ status: 'fail', message: error.message });
    }

    return next(error);
  }
}

async function loginUser(req, res, next) {
  const { email: submittedEmail, password } = req.body || {};

  if (typeof submittedEmail !== 'string' || !submittedEmail.trim() || typeof password !== 'string' || !password) {
    return res.status(400).json({ status: 'fail', message: 'Email and password are required' });
  }

  try {
    const email = submittedEmail.trim().toLowerCase();
    const user = await User.findOne({ email }).select('+password loginAttempts lockUntil');

    if (user?.lockUntil && user.lockUntil > Date.now()) {
      return res.status(401).json({ status: 'fail', message: 'Account locked, try again later' });
    }

    if (!user || !(await user.comparePassword(password))) {
      if (user) {
        if (user.lockUntil && user.lockUntil <= Date.now()) {
          user.loginAttempts = 1;
          user.lockUntil = undefined;
        } else {
          user.loginAttempts += 1;
        }

        if (user.loginAttempts >= 5) {
          user.lockUntil = new Date(Date.now() + 15 * 60 * 1000);
        }

        await user.save();
      }

      return res.status(401).json({ status: 'fail', message: 'Invalid email or password' });
    }

    if (user.loginAttempts > 0 || user.lockUntil) {
      user.loginAttempts = 0;
      user.lockUntil = undefined;
      await user.save();
    }

    const token = jwt.sign(
      { id: user._id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '1d' }
    );

    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 24 * 60 * 60 * 1000,
    });

    return res.status(200).json({
      status: 'success',
      data: { user: serializeUser(user) },
    });
  } catch (error) {
    return next(error);
  }
}

module.exports = { registerUser, loginUser };