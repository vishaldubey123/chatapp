import { compare } from "bcrypt";
import {User} from "../models/user.js"
import { Chat } from "../models/chat.js";
import {Request} from "../models/request.js"
import { emitEvent, sendToken, uploadFilesToCloudinary } from "../utils/features.js";
import { ErrorHandler } from "../utils/utility.js";
import { cookieOptions } from "../utils/features.js";
import { NEW_REQUEST, REFETCH_CHATS } from "../constants/events.js";
import {getOtherMember} from "../lib/helper.js"


const newUser = async(req, res, next) =>{
    try{
        const {name, username, password, bio} = req.body;
        const file = req.file;
    
        if(!file) return next(new ErrorHandler("Please upload avatar"))

        const result = await uploadFilesToCloudinary([file]);
    
       const avatar = {
        public_id: result[0].public_id,
        url: result[0].url,
       };
    
       const user = await User.create({
        name,
        bio,
        username,
        password,
        avatar,
       })
    
       sendToken(res, user, 201, "User created");
    }catch(err){
       console.log(err);
    }

}


const login =async (req, res, next) =>{
  
        const {username, password} = req.body;

        //used select because in model it is defined as select=false
        const user = await User.findOne({username}).select("+password");
    
        if(!user) return next(new ErrorHandler("Invalid Username", 404));
    
        const isMatch = await compare(password, user.password);
    
        if(!isMatch) return next(new ErrorHandler("Invalid Password", 404));
    
        sendToken(res, user, 200, `Welcome Back ${user.name}`);

}


const getMyProfile = async (req, res,next) => {
    try{
        const user = await User.findById(req.user);
        if(!user) return next(new ErrorHandler("User not found", 404));
        res.status(200).json({
            success: true,
            user,
        })
    }catch(err){
       console.log(err);
    }

}

const logout = async (req, res) => {
    try{
        return res.status(200)
        .cookie("chatkaro-token", "", {...cookieOptions, maxAge:0})
        .json({
            success: true,
            message: "Logged Out successfully"
        })
    }catch(err){
       console.log(err);
    }

}


const searchUser = async (req, res) => {
    try{
        const {name = ""} = req.query;

        //Finding All my chats
        const myChats = await Chat.find({groupChat: false, members: req.user});

        //All Users from my chats means friends or people I have chatted with
        const allUsersFromMyChats = myChats.flatMap((chat) => chat.members);

        //Finding all users except me and my friends
        const allUsersExceptMeAndFriends = await User.find({
            _id: {$nin: allUsersFromMyChats},
            name: {$regex: name, $options: "i"}
        });

        //modifying
        const users = allUsersExceptMeAndFriends.map(({_id, name, avatar}) =>({
            _id, 
            name,
           avatar:avatar.url,
        }))
        res.status(200).json({
            success: true,
            users,
        })
    }catch(err){
       console.log(err);
    }

}

const sendFriendRequest = async (req, res, next) => {
    try{

        const {userId} = req.body;

        const request = await Request.findOne({
            $or: [
                {sender: req.user, receiver: userId},
                {sender: userId, receiver: req.user},
            ]
        });

        if(request) return next(new ErrorHandler("Request already sent", 400));

        await Request.create({
            sender: req.user,
            receiver: userId,
        })
        emitEvent(req, NEW_REQUEST, [userId]);

        return res.status(200).json({
            success: true,
            message: "Friend request sent"
        })
    }catch(err){
       console.log(err);
    }

}

const acceptFriendRequest = async (req, res, next) => {
    try{

        const {requestId, accept} = req.body;

        const request = await Request.findById(requestId)
        .populate("sender", "name")
        .populate("receiver", "name")
        console.log(request)

        if(!request) return next(new ErrorHandler("Request not found", 404));

        if(request.receiver._id.toString() !== req.user.toString()){
            return next(new ErrorHandler("You are not authorized to accept this request", 401));

        }

        if(!accept){
            await request.deleteOne();

            return res.status(200).json({
                success: true,
                message: "Request rejected"
            })
        }

        const members = [request.sender._id, request.receiver._id];

        await Promise.all([
            Chat.create({
                members,
                name: `${request.sender.name}-${request.receiver.name}`
            }),
            request.deleteOne(),
        ])

        emitEvent(req, REFETCH_CHATS, members)


        return res.status(200).json({
            success: true,
            message: "Friend request accepted",
            senderId: request.sender_id,
        })
    }catch(err){
       console.log(err);
    }

}

const getMyNotification = async (req, res) =>{
    const requests = await Request.find({receiver: req.user}).populate(
        "sender",
        "name avatar"
    )

    const allRequests = requests.map(({_id, sender}) =>({
        _id,
        sender:{
            _id: sender._id,
            name: sender.name,
            avatar: sender.avatar.url,
        }
    }));

    return res.status(200).json({
        success: true,
        allRequests
    })
}

const getMyFriends = async (req, res, next) => {
    try{
       const chatId = req.query.chatId;
       const chats = await Chat.find({
        members: req.user,
        groupChat: false,
       }).populate("members", "name avatar");

       const friends = chats.map(({members}) => {
        const otherUser = getOtherMember(members, req.user);
        return {
            _id: otherUser._id,
            name: otherUser.name,
            avatar: otherUser.avatar.url,
        }
       })

        if(chatId){
           const chat = await Chat.findById(chatId);
           const availableFriends = friends.filter(
            (friend) => !chat.members.includes(friend._id)
           )

           return res.status(200).json({
            success: true,
            friends: availableFriends
           })
        }else{
            return res.status(200).json({
                success: true,
                friends,
               })
        }
    }catch(err){
        console.log(err)
    }
}
export {
    login, 
    newUser, 
    getMyProfile, 
    logout, 
    searchUser, 
    sendFriendRequest, 
    acceptFriendRequest,
    getMyNotification,
    getMyFriends
}