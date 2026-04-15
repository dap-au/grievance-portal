const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const prisma = require('../config/prisma');

const roleDomains = {
  student: '@aurora.edu.in',
  faculty: '@faculty.aurora.edu.in',
  // Dean Student Affairs — campus-specific
  dean_uppal:        '@deansa.uppal.aurora.edu.in',
  dean_bhongir:      '@deansa.bhongir.aurora.edu.in',
  // Committee members created by dean (same campus prefix)
  committee_uppal:   '@deansa.uppal.aurora.edu.in',
  committee_bhongir: '@deansa.bhongir.aurora.edu.in',
  registrar: '@registrar.aurora.edu.in',
  vc: '@vc.aurora.edu.in',
};

// Resolve the effective domain key for a role (dean/committee needs campus)
const getRoleDomainKey = (role, campus) => {
  const r = normalizeRole(role);
  if (r === 'dean' || r === 'committee') {
    return campus ? `${r}_${campus}` : null;
  }
  return r;
};

const createToken = (user) =>
  jwt.sign({ id: user.id, email: user.email, role: user.role }, process.env.JWT_SECRET, {
    expiresIn: '7d',
  });

const normalizeRole = (role) => String(role || '').toLowerCase();

const isEmailValidForRole = (email, role, campus) => {
  const key = getRoleDomainKey(role, campus);
  const domain = key ? roleDomains[key] : null;
  return Boolean(domain) && String(email || '').toLowerCase().endsWith(domain);
};

const toClientUser = (user) => ({
  id: user.id,
  name: user.name,
  email: user.email,
  role: user.role,
  isVerified: user.isVerified,
  student_id: user.studentId || null,
  school: user.school || null,
  department: user.department || null,
  campus: user.campus || null,
  createdAt: user.createdAt,
});

const register = async (req, res) => {
  const { name, email, role, password, student_id, school, department, campus } = req.body;

  if (!name || !email || !role || !password) {
    return res.status(400).json({ message: 'Name, email, role and password are required' });
  }

  const normalizedRole = normalizeRole(role);
  if (normalizedRole !== 'student') {
    return res.status(403).json({ message: 'Public registration is allowed for students only' });
  }

  if (String(password).length < 8) {
    return res.status(400).json({ message: 'Password must be at least 8 characters long' });
  }

  if (!roleDomains[normalizedRole]) {
    return res.status(400).json({ message: 'Invalid role provided' });
  }

  // Students must select a campus
  const normalizedCampus = campus ? String(campus).toLowerCase() : null;
  if (!normalizedCampus || !['uppal', 'bhongir'].includes(normalizedCampus)) {
    return res.status(400).json({ message: 'Please select a campus (uppal or bhongir)' });
  }

  if (!isEmailValidForRole(email, normalizedRole, normalizedCampus)) {
    return res.status(400).json({
      message: `Email must end with ${roleDomains[normalizedRole]} for role ${normalizedRole}`,
    });
  }

  try {
    const existingUser = await prisma.user.findUnique({ where: { email: String(email).toLowerCase() } });
    if (existingUser) {
      return res.status(409).json({ message: 'Email already registered' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await prisma.user.create({
      data: {
        name,
        email: String(email).toLowerCase(),
        password: hashedPassword,
        role: normalizedRole,
        studentId: student_id || null,
        school: school || null,
        department: department || null,
        campus: normalizedCampus || null,
        isVerified: true,
        resetToken: null,
        resetTokenExpiry: null,
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isVerified: true,
        studentId: true,
        school: true,
        department: true,
        createdAt: true,
      },
    });

    return res.status(201).json({
      message: 'Registration successful. You can now log in with your password.',
      user: toClientUser(user),
    });
  } catch (error) {
    console.error('Register error:', error.message);
    return res.status(500).json({ message: 'Server error during registration' });
  }
};

const login = async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: 'Email and password are required' });
  }

  try {
    const user = await prisma.user.findUnique({ where: { email: String(email).toLowerCase() } });

    if (!user) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    const passwordMatch = await bcrypt.compare(password, user.password);
    if (!passwordMatch) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    const token = createToken(user);

    return res.json({
      token,
      role: user.role,
      user: toClientUser(user),
      requiresPasswordReset: !user.isVerified,
    });
  } catch (error) {
    console.error('Login error:', error.message);
    return res.status(500).json({ message: 'Server error during login' });
  }
};

const resetPassword = async (req, res) => {
  const { token } = req.params;
  const { newPassword } = req.body;

  if (!newPassword) {
    return res.status(400).json({ message: 'New password is required' });
  }

  try {
    const user = await prisma.user.findFirst({
      where: {
        resetToken: token,
        resetTokenExpiry: {
          gt: new Date(),
        },
      },
    });

    if (!user) {
      return res.status(400).json({ message: 'Reset token is invalid or has expired' });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    await prisma.user.update({
      where: { id: user.id },
      data: {
        password: hashedPassword,
        resetToken: null,
        resetTokenExpiry: null,
        isVerified: true,
      },
    });

    return res.json({ message: 'Password reset successful. You can now log in.' });
  } catch (error) {
    console.error('Reset password error:', error.message);
    return res.status(500).json({ message: 'Server error during password reset' });
  }
};

const getMe = async (req, res) => res.json(toClientUser(req.user));

// ── CREATE COMMITTEE MEMBER (dean only) ──────────────────────
// Dean adds a committee member for their campus.
// Committee member receives a temp password they must reset on first login.
const createCommitteeMember = async (req, res) => {
  const { name, email, school, department } = req.body;

  if (!name || !email) {
    return res.status(400).json({ message: 'Name and email are required' });
  }

  // Only deans can create committee members for their campus
  if (!req.user || req.user.role !== 'dean') {
    return res.status(403).json({ message: 'Only a Dean can add committee members' });
  }

  const campus = req.user.campus;
  if (!campus) {
    return res.status(400).json({ message: 'Dean account is not assigned to a campus' });
  }

  const tempPassword = 'Committee@123';

  try {
    const existing = await prisma.user.findUnique({ where: { email: String(email).toLowerCase() } });
    if (existing) {
      return res.status(409).json({ message: 'Email already registered' });
    }

    const hashedPassword = await bcrypt.hash(tempPassword, 10);

    const member = await prisma.user.create({
      data: {
        name,
        email: String(email).toLowerCase(),
        password: hashedPassword,
        role: 'committee',
        campus,
        school: school || req.user.school || null,
        department: department || req.user.department || null,
        isVerified: false,  // must reset on first login
      },
    });

    return res.status(201).json({
      message: `Committee member added for ${campus} campus. Temp password: ${tempPassword}`,
      user: toClientUser(member),
      tempPassword,
    });
  } catch (error) {
    console.error('Create committee error:', error.message);
    return res.status(500).json({ message: 'Server error' });
  }
};

// ── LIST COMMITTEE MEMBERS (dean only — their campus) ─────────
const listCommitteeMembers = async (req, res) => {
  if (!req.user || req.user.role !== 'dean') {
    return res.status(403).json({ message: 'Access denied' });
  }
  try {
    const members = await prisma.user.findMany({
      where: { role: 'committee', campus: req.user.campus },
      select: { id: true, name: true, email: true, role: true, campus: true, school: true, department: true, isVerified: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    });
    return res.json(members);
  } catch (error) {
    return res.status(500).json({ message: 'Server error' });
  }
};

// ── REMOVE COMMITTEE MEMBER (dean only — their campus) ────────
const removeCommitteeMember = async (req, res) => {
  if (!req.user || req.user.role !== 'dean') {
    return res.status(403).json({ message: 'Access denied' });
  }
  const { id } = req.params;
  try {
    const member = await prisma.user.findUnique({ where: { id: parseInt(id) } });
    if (!member || member.role !== 'committee' || member.campus !== req.user.campus) {
      return res.status(404).json({ message: 'Committee member not found on your campus' });
    }
    await prisma.user.delete({ where: { id: parseInt(id) } });
    return res.json({ message: 'Committee member removed' });
  } catch (error) {
    return res.status(500).json({ message: 'Server error' });
  }
};

module.exports = { register, login, resetPassword, getMe, createCommitteeMember, listCommitteeMembers, removeCommitteeMember };