import express from "express";
import http from "http";
import cors from "cors";
import { Server } from "socket.io";

const app = express();
const server = http.createServer(app);
const CLIENT_URL = process.env.CLIENT_URL || "*"; // vd: https://stranger-chat.vercel.app

app.use(cors({ origin: CLIENT_URL === "*" ? true : CLIENT_URL.split(",") }));
app.get("/", (req, res) => res.json({ ok: true, name: "StrangerChat API", online: waiting.length, time: new Date().toISOString() }));
app.get("/health", (req, res) => res.json({ ok: true }));

const io = new Server(server, { cors: { origin: CLIENT_URL === "*" ? "*" : CLIENT_URL.split(","), methods: ["GET","POST"] } });

// --- Matching logic ---
// waiting: [{ socketId, profile:{name,gender,location,avatar,isGuest}, wantGender }]
let waiting = [];
const partnerOf = new Map(); // socketId -> socketId

function tryMatch(user) {
  // Tìm người phù hợp 2 chiều: giới tính mình muốn & họ muốn
  const idx = waiting.findIndex(w =>
    w.socketId !== user.socketId &&
    (user.wantGender === "all" || w.profile.gender === user.wantGender) &&
    (w.wantGender === "all" || w.profile.gender === user.profile.gender)
  );
  if (idx === -1) { waiting.push(user); return; }
  const [partner] = waiting.splice(idx, 1);
  partnerOf.set(user.socketId, partner.socketId);
  partnerOf.set(partner.socketId, user.socketId);
  const room = `room-${user.socketId}-${partner.socketId}`;
  io.sockets.sockets.get(user.socketId)?.join(room);
  io.sockets.sockets.get(partner.socketId)?.join(room);
  io.to(user.socketId).emit("matched", { room, partner: partner.profile });
  io.to(partner.socketId).emit("matched", { room, partner: user.profile });
  console.log("Matched:", user.profile.name, "<->", partner.profile.name);
}

io.on("connection", (socket) => {
  console.log("Connected:", socket.id);

  socket.on("join_queue", ({ profile, wantGender }) => {
    if (!profile?.name || !profile?.gender) return socket.emit("error_msg", "Thiếu profile");
    // sanitize cơ bản
    const clean = {
      name: String(profile.name).slice(0, 40),
      gender: ["male","female","other"].includes(profile.gender) ? profile.gender : "other",
      location: String(profile.location || "Không rõ").slice(0, 60),
      avatar: String(profile.avatar || "").slice(0, 500),
      isGuest: !!profile.isGuest
    };
    socket.data.profile = clean;
    tryMatch({ socketId: socket.id, profile: clean, wantGender: ["all","male","female","other"].includes(wantGender) ? wantGender : "all" });
    socket.emit("waiting");
  });

  socket.on("send_message", ({ text }) => {
    const partnerId = partnerOf.get(socket.id);
    if (!partnerId || !text?.trim()) return;
    io.to(partnerId).emit("receive_message", { text: String(text).slice(0, 1000), from: socket.data.profile, at: Date.now() });
  });

  socket.on("typing", ({ isTyping }) => {
    const partnerId = partnerOf.get(socket.id);
    if (partnerId) io.to(partnerId).emit("partner_typing", { isTyping: !!isTyping });
  });

  const endChat = (notify = true) => {
    const partnerId = partnerOf.get(socket.id);
    waiting = waiting.filter(w => w.socketId !== socket.id);
    if (partnerId) {
      partnerOf.delete(partnerId); partnerOf.delete(socket.id);
      if (notify) io.to(partnerId).emit("partner_left");
    }
  };
  socket.on("next", () => { endChat(true); if (socket.data.profile) tryMatch({ socketId: socket.id, profile: socket.data.profile, wantGender: "all" }); });
  socket.on("leave_queue", () => endChat(false));
  socket.on("disconnect", () => endChat(true));
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => console.log(`Server running on ${PORT}`));
