const jwt=require('jsonwebtoken');
const User = require('../db/models/user.model');

const auth = async (req, res, next) => {
    try {
      const token = req.header('Authorization')?.replace('Bearer', '').trim();
      const decode = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findById(decode.userId);
  
      if (!user) {
        throw new Error();
      }
  
      req.token = token;
      req.user = user;
      next();
    } catch (error) {
      res.status(401).send({ error: 'Please authenticate.' });
    }
  };
  

 const authorize = (roles = []) => {
  const normalizedRoles = roles.map(role => role.toLowerCase());

  return (req, res, next) => {
    const userRole = req.user?.role?.toLowerCase();
    console.log(userRole,normalizedRoles)
    if (!userRole || !normalizedRoles.includes(userRole)) {
      return res.status(403).json({ message: "Access denied" });
    }

    next();
  };
};


module.exports={auth,authorize}