import { ErrorHandler } from "../utils/utility.js";
import {Chat} from "../models/chat.js"
import {User} from "../models/user.js"
import {Message} from "../models/message.js"
import { deleteFilesFromCloudinary, emitEvent, uploadFilesToCloudinary } from "../utils/features.js";
import { ALERT, NEW_ATTACHMENT, NEW_MESSAGE, NEW_MESSAGE_ALERT, REFETCH_CHATS } from "../constants/events.js";
import { getOtherMember } from "../lib/helper.js";


const newGroupChat = async (req, res, next) =>{
    try{
        const {name, members} = req.body;

        // if(members.length < 2){
        //     return next(
        //         new ErrorHandler("Group chat must have at least 3 members", 400)
        //     )
        // }
        const allMembers = [...members, req.user];
        await Chat.create({
            name, 
            groupChat: true,
            creator:req.user,
            members: allMembers
        })

        emitEvent(req, ALERT, allMembers, `Welcome to  ${name} group`)
        emitEvent(req, REFETCH_CHATS, members)

        return res.status(201).json({
            success: true,
            message: "Group created successfully"
        })

    }catch(err){
        console.log(err)
    }
};


const getMyChat = async (req, res, next) =>{
    try{
        const chats = await Chat.find({members: req.user}).populate(
            "members",
            "name avatar"
        )

        
        const transformedChats = chats.map(({_id, name, members, groupChat}) =>{
            const otherMember = getOtherMember(members, req.user);
              return{
                _id,
                groupChat,
                avatar:groupChat?members.slice(0, 3).map(({avatar}) =>avatar.url):[otherMember.avatar.url],
                name: groupChat ?name : otherMember.name,
                members: members.reduce((prev, curr)=>{
                    if(curr._id.toString() !== req.user.toString()){
                        prev.push(curr._id);
                    }
                    return prev;
                }, [])
              }
        })

        return res.status(200).json({
            success: true,
            chats: transformedChats
        })

    }catch(err){
        console.log(err)
    }
};

const getMyGroups = async(req, res, next)=>{
    const chats = await Chat.find({
        members:req.user,
        groupChat:true,
        creator:req.user,
    }).populate("members", "name avatar");

    const groups = chats.map(({members, _id, groupChat, name}) => (
        {
            _id,
            groupChat,
            name, 
            avatar: members.slice(0, 3).map(({ avatar }) => avatar.url)
        }
    ));
    return res.status(200).json({
        success:true,
        groups,
    })
}


const addMembers = async(req, res, next)=>{
    
    try{
        const { chatId, members} = req.body;

        // if(!members || members.length < 1){
        //     return next(new ErrorHandler("Please provide members", 400))
        // }
    
        const chat = await Chat.findById(chatId);
    
        if(!chat) return next(new ErrorHandler("Chat not found", 404));
    
        if(!chat.groupChat) return next(new ErrorHandler("This is not a group chat", 400));
    
        if(chat.creator.toString() !== req.user.toString()) return next(new ErrorHandler("You are not allowed to add members", 403));
    
        const allNewMembersPromise = members.map((i) => User.findById(i, "name"));
         
        const allNewMembers = await Promise.all(allNewMembersPromise);
    
        const uniqueMembers = allNewMembers
        .filter((i) => !chat.members.includes(i._id.toString()))
        .map((i) => i._id);
    
        chat.members.push(...uniqueMembers);
    
        if(chat.members.length > 100){
            return next(new ErrorHandler("Group members limit reached", 404))
        }
    
        await chat.save();
    
        const allUsersName = allNewMembers.map((i) => i.name).join(",");
    
        emitEvent(
            req,
            ALERT,
            chat.members,
            `${allUsersName} has been added in the group`
        );
    
        emitEvent(req, REFETCH_CHATS, chat.members);
    
    
        return res.status(200).json({
            success:true,
            message:"Members added successfully",
        })
    }catch(err){
        console.log(err);
    }
}

const removeMember = async(req, res, next) =>{
    try{
       const {userId, chatId} = req.body;

       const [chat, userThatWillBeRemoved] = await Promise.all([
        Chat.findById(chatId),
        User.findById(userId, "name")
       ])

       if(!chat) return next(new ErrorHandler("Chat not found", 404));
    
       if(!chat.groupChat) return next(new ErrorHandler("This is not a group chat", 400));
   
       if(chat.creator.toString() !== req.user.toString()) return next(new ErrorHandler("You are not allowed to add members", 403));

       if(chat.members.length <=  3) return next(new ErrorHandler("Groups must have atleast 3 members", 400))

        const allChatMembers = chat.members.map((i) => i.toString());

       chat.members = chat.members.filter(
        (member) =>  member.toString() !== userId.toString()
       );

       await chat.save();

       emitEvent(
        req, 
        ALERT,
        chat.members,
        {message:`${userThatWillBeRemoved.name} has been removed from the group`, chatId}
        
       );

       emitEvent(req, REFETCH_CHATS, allChatMembers);

       return res.status(200).json({
        success:true,
        message: "Member removed successfully",
       })
      
   
    }catch(err){
        console.log(err);
    }
}

const leaveGroup = async(req, res, next) =>{
    try{
      const chatId = req.params.id;

      const chat = await Chat.findById(chatId);
      
      if(!chat) return next(new ErrorHandler("Chat not found", 404));
    
      if(!chat.groupChat) return next(new ErrorHandler("This is not a group chat", 400));

      if(chat.members.length <=  3) return next(new ErrorHandler("Groups must have atleast 3 members", 400))

      
 

      const remainingMembers = chat.members.filter(
        (member) => member.toString() !== req.user.toString()
      )
      if(chat.creator.toString() == req.user.toString()){
        const randomElement = Math.floor(Math.random()*remainingMembers.length);
        
        const newCreator = remainingMembers[randomElement];
        chat.creator = newCreator;
      }


      chat.members = remainingMembers;

      const [user] = await Promise.all([
        User.findById(req.user, "name"),
        chat.save(),
      ]);
      emitEvent(req, 
        ALERT,
        chat.members, 
        {
            chatId,
            message: `User ${user.name} has left the group`
        }
        
       );
      emitEvent(req, REFETCH_CHATS,chat.members);

      return res.status(200).json({
        success: true,
        message:"Left Group successfully"
      })

    }catch(err){
        console.log(err)
    }
}


const sendAttachments = async(req, res, next) =>{
    const {chatId} = req.body;
    

    const files = req.files || [];

    if(files.length < 1)
        return next(new ErrorHandler("Please upload attachments", 400))

    if(files.length > 5)
        return next(new ErrorHandler("Files can't be more then 5", 400))

    const [chat, me] = await Promise.all([
        Chat.findById(chatId),
        User.findById(req.user, "name")
    ])

    if(!chat) return next(new ErrorHandler("Chat not found", 404));


    if(files.length <1) return next(new ErrorHandler("Please provide attachments", 404));

    //upload files here
    const attachments = await uploadFilesToCloudinary(files);

    const messageForDb = {
        content:"",
        attachments, 
        sender: me._id, 
        chat:chatId
    };


    const messageForRealTime = {
        ...messageForDb,

        sender: {
            _id: me._id,
            name: me.name,
        }, 
       
    };


    const message = await Message.create(messageForDb)

    emitEvent(req, NEW_MESSAGE, chat.members, {
        message: messageForRealTime,
        chatId,
    })

    emitEvent(req, NEW_MESSAGE_ALERT,chat.members, {chatId});

    return res.status(200).json({
        success: true,
        message
    })
}

const getChatDetails = async(req, res, next) =>{
    try{
        if(req.query.populate === "true"){
            const chat = await Chat.findById(req.params.id)
            .populate("members", "name avatar")
            .lean()
            
            if(!chat) return next(new ErrorHandler("Chat not found", 404));

            chat.members = chat.members.map(({_id, name, avatar})=>({
                    _id,
                    name, 
                    avatar: avatar.url,
                }))

            return res.status(200).json({
                success: true,
                chat,
            })

        }else{
            const chat = await Chat.findById(req.params.id)

            if(!chat) return next(new ErrorHandler("Chat not found", 404));

            return res.status(200).json({
                success: true,
                chat,
            })
        }
    }catch(err){

    }
}

const renameGroup = async(req, res, next) =>{
    try{
        const chatId = req.params.id;
        const {name} = req.body;

        const chat = await Chat.findById(chatId);
        if(!chat) return next(new ErrorHandler("Chat not found", 404));

        if(!chat.groupChat) return next(new ErrorHandler("This is not a group chat", 400));
   
        if(chat.creator.toString() !== req.user.toString()) return next(new ErrorHandler("You are not allowed to add members", 403));

        chat.name = name;
        await chat.save();
        emitEvent(req, REFETCH_CHATS, chat.members);
        return res.status(200).json({
            success: true,
            message:"Group name changed"
          })
    }catch(err){
        console.log(err)
    }
}

const deleteChat = async(req, res, next) =>{
    try{
        const chatId = req.params.id;

        const chat = await Chat.findById(chatId);
        if(!chat) return next(new ErrorHandler("Chat not found", 404));
        const members = chat.members;
        if(chat.groupChat && chat.creator.toString() !== req.user.toString()) return next(new ErrorHandler("You are not allowed to add members", 403));

        if(!chat.groupChat && !chat.members.includes(req.user.toString())) return next(new ErrorHandler("You are not allowed to add members", 403));

        //here we have to delete all messaages as well as attachments or files from cloudinary

        const messageWithAttachments = await Message.find({
            chat: chatId,
            attachments: { $exists: true, $ne: []},
        });

        const public_ids = [];

        messageWithAttachments.forEach(({attachments}) =>
          attachments.forEach(({public_id}) => public_ids.push(public_id))
        );

        await Promise.all([
            deleteFilesFromCloudinary(public_ids),
            chat.deleteOne(),
            Message.deleteMany({chat: chatId})
        ]);

        emitEvent(req, REFETCH_CHATS, members);

        return res.status(200).json({
            success: true,
            message: "Chat deleted successful"
        })

    }catch(err){
       console.log(err);
    }
}

const getMessages = async (req, res, next) =>{
    try{
       const chatId = req.params.id;
       const {page = 1} = req.query;

       const resultPerPage = 20;
       const skip = (page - 1) * resultPerPage;

       const chat = await Chat.findById(chatId);
       if(!chat) return next(new ErrorHandler("Chat not found", 404));

       if(!chat.members.includes(req.user.toString()))
        return next(
            new ErrorHandler("You are not allowed to access this chat", 403)
        )

       const [messages, totalMessagesCount] = await Promise.all([
        Message.find({chat: chatId})
        .sort({createdAt: -1})
        .skip(skip)
        .limit(resultPerPage)
        .populate("sender", "name avatar")
        .lean(),
        Message.countDocuments({chat: chatId}),
       ]);
       const totalPages = Math.ceil(totalMessagesCount/resultPerPage) || 0;
       
       return res.status(200).json({
        success: true,
        messages: messages.reverse(),
        totalPages,
       })
    }catch(err){
        console.log(err);
    }
}
export {
    newGroupChat, 
    getMyChat, 
    getMyGroups, 
    addMembers, 
    removeMember, 
    leaveGroup, 
    sendAttachments, 
    getChatDetails, 
    renameGroup,
    deleteChat,
    getMessages
};