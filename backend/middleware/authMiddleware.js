const jwt = require('jsonwebtoken');
const prisma = require('../config/prisma');

const protect = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Not authorized, no token' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await prisma.user.findUnique({
      where: { id: decoded.id },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isVerified: true,
        studentId: true,
        school: true,
        department: true,
        campus: true,
        createdAt: true,
      },
    });

    if (!user) {
      return res.status(401).json({ message: 'User not found or token invalid' });
    }

    if (!user.isVerified) {
      return res.status(403).json({
        message: 'Please verify your account by resetting the temporary password first.',
      });
    }

    req.user = {
      ...user,
      student_id: user.studentId || null,
      campus: user.campus || null,
    };
    next();
  } catch (error) {
    return res.status(401).json({ message: 'Token invalid or expired. Please log in again.' });
  }
};

const authorize = (roles = []) => {
  const allowedRoles = Array.isArray(roles) ? roles : [roles];

  return (req, res, next) => {
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        message: `Access denied. This action requires one of: ${allowedRoles.join(', ')}`,
      });
    }

    next();
  };
};

const blockViceChancellor = (req, res, next) => {
  if (req.user?.role === 'vc') {
    return res.status(403).json({ message: 'Vice Chancellor has view-only access.' });
  }

  next();
};

module.exports = { protect, authorize, blockViceChancellor };