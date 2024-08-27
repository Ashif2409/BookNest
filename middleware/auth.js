const jwt=require('jsonwebtoken');
const User = require('../db/models/user.model');

const auth=async(req,res,next)=>{
try {
    const token=req.header('Authorization').replace('Bearer','').trim();
    const decode=await jwt.verify(token,'LibManSys');
    const user=await User.findOne({_id:decode.userId,'tokens.token':token})

    if(!user){
        throw new Error();
    }

    req.token=token;
    req.user=user;
    next();
} catch (error) {
    res.status(401).send({ error: 'Please authenticate.' })
}
}

const authorize=(roles)=>{
    return (req,res,next)=>{
        if(!roles.includes(req.user.role)){
            return res.status(403).send({ error: 'Access denied.' });
        }
        next();
    }
}

module.exports={auth,authorize}