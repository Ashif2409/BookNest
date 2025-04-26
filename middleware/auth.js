const jwt = require('jsonwebtoken');
const User = require('../db/models/user.model');

const auth = async (req, res, next) => {
  try {
    const authHeader = req.header('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authentication failed. Token missing or invalid.' });
    }

    const token = authHeader.split(' ')[1];
    const decode = jwt.verify(token, process.env.JWT_SECRET || 'LibManSys'); // fallback if env missing

    const user = await User.findById(decode.userId);

    if (!user) {
      return res.status(401).json({ error: 'User not found.' });
    }

    req.token = token;
    req.user = user;
    next();
  } catch (error) {
    console.error('Authentication error:', error.message || error);
    res.status(401).send({ error: 'Please authenticate.' });
  }
};

const authorize = (roles = []) => {
  const normalizedRoles = roles.map(role => role.toLowerCase());

  return (req, res, next) => {
    const userRole = req.user?.role?.toLowerCase();
    console.log('User role:', userRole, 'Allowed roles:', normalizedRoles);

    if (!userRole || !normalizedRoles.includes(userRole)) {
      return res.status(403).json({ message: "Access denied" });
    }

    next();
  };
};

module.exports = { auth, authorize };
