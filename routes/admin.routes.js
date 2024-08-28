import express from "express";
import { adminLogin, adminLogout, allChats, allMessages, allStats, allUsers, getAdminData } from "../controllers/admin.controller.js";
import { adminLoginValidator, validateHandler } from "../lib/validators.js";
import { adminOnly } from "../middlewares/auth.js";

const app = express.Router();


app.post("/verify",adminLoginValidator(), validateHandler, adminLogin);

app.get("/logout", adminLogout);

//Only admin can Access these Routes
app.use(adminOnly);

app.get("/", getAdminData);

app.get("/users", allUsers);

app.get("/chats", allChats);

app.get("/messages", allMessages);

app.get("/stats", allStats);


export default app;