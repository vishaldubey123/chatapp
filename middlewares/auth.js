import jwt from "jsonwebtoken";
import { adminSecretKey } from "../app.js";
import { CHATKARO_TOKEN } from "../constants/config.js";
import { User } from "../models/user.js";
import { ErrorHandler } from "../utils/utility.js";

const isAuthenticated = async (req, res, next) => {
    try{
        const token = req.cookies[CHATKARO_TOKEN];
        if(!token){
            return next(new ErrorHandler("please login to access this route", 401));
        }
        
        const decodedData = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decodedData._id;
        next();
    }catch(err){
        return next(new ErrorHandler(err, 401));

    }

}

const adminOnly = async (req, res, next) => {
    try{
        const token = req.cookies["chatKaro-admin-token"];
        
        if(!token){
            return next(new ErrorHandler("Only admin can access this route", 401));
        }
        
        const secretKey = jwt.verify(token, process.env.JWT_SECRET);
        const isMatched = secretKey === adminSecretKey;

        if(!isMatched){
            return next(new ErrorHandler("Only admin can access this route", 401));
        }
        

        next();
    }catch(err){
        console.log(err);
    }

}


const socketAuthenticator = async (err, socket, next) => {
   try{
      if(err) return next(err);

      const authToken = socket.request.cookies[CHATKARO_TOKEN];

      if(!authToken) next(new ErrorHandler("Please login to access this route", 401));

      const decodedData = jwt.verify(authToken, process.env.JWT_SECRET);

      const user = await User.findById(decodedData._id);

      if(!user) next(new ErrorHandler("Please login to access this route", 401));

      socket.user = user;

      return next();

   }catch(error){
      return next(new ErrorHandler("Pleaee login to access this route", 401));
   }
};

export { adminOnly, isAuthenticated, socketAuthenticator };
