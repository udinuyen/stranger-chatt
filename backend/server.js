import express from "express";
import http from "http";
import cors from "cors";
import { Server } from "socket.io";

const app = express();
const server = http.createServer(app);
const CLIENT_URL = process.env.CLIENT_URL || "*"; // vd: https://stranger-chatt.vercel.app

app.use(cors({ origin: CLIENT_URL === "*" ? true : CLIENT_URL.split(",") }));
app.get("/", (req, res) => res.json({ ok: true, name: "StrangerChat API", online: waiting.length, time: new Date().toISOString() }));
app.get("/health", (req, res) => res.json({ ok: true }));

const io = new Server(server, { cors: { origin: CLIENT_URL === "*" ? "*" : CLIENT_URL.split(","), methods: ["GET", "POST"] } });

// --- Matching logic v2 ---
// waiting: [{ socketId, uid, profile, wantGender, wantRegion }]
let waiting = [];
const partnerOf = new Map(); // socketId -> socketId
const history = new Map();   // uid -> Set<uid> da tung ghep (khong ghep lai)
const reports = [];          // { reporterUid, reportedUid, at } - xem trong log Render

function seen(a, b) {
  return history.get(a)?.has(b) || history.get(b)?.has(a);
}
function remember(a, b) {
  if (!history.has(a)) history.set(a, new Set());
  if (!history.has(b)) history.set(b, new Set());
  history.get(a).add(b); history.get(b).add(a);
}

function tryMatch(user) {
  // Uu tien 1: dung ca gioi tinh + khu vuc. Uu tien 2: chi gioi tinh (bo khu vuc).
  const find = (strictRegion) => waiting.findIndex(w =>
    w.socketId !== user.socketId &&
    !seen(user.uid, w.uid) &&
    (user.wantGender === "all" || w.profile.gender === user.wantGender) &&
    (w.wantGender === "all" || w.profile.gender === user.profile.gender) &&
    (!strictRegion || user.wantRegion === "all" || w.profile.region === user.wantRegion)
  );
  let idx = find(true);
  if (idx === -1) idx = find(false);
  if (idx === -1) { waiting.push(user); return; }
  const [partner] = waiting.splice(idx, 1);
  partnerOf.set(user.socketId, partner.socketId);
  partnerOf.set(partner.socketId, user.socketId);
  remember(user.uid, partner.uid);
  io.to(user.socketId).emit("matched", { partner: partner.profile });
  io.to(partner.socketId).emit("matched", { partner: user.profile });
  console.log("Matched:", user.profile.name, "<->", partner.profile.name);
}

io.on("connection", (socket) => {
  socket.on("join_queue", ({ profile, wantGender, wantRegion }) => {
    if (!profile?.name || !profile?.gender || !profile?.uid) return socket.emit("error_msg", "Thiếu profile");
    const year = new Date().getFullYear();
    const birthYear = parseInt(profile.birthYear, 10);
    const age = birthYear >= 1950 && birthYear <= year ? year - birthYear : null;
    if (age !== null && age < 18) return socket.emit("error_msg", "underage"); // chi 18+
    const clean = {
      uid: String(profile.uid).slice(0, 60),
      name: String(profile.name).slice(0, 40),
      gender: ["male", "female", "other"].includes(profile.gender) ? profile.gender : "other",
      birthYear: age !== null ? birthYear : null,
      age,
      region: ["bac", "trung", "nam", "nuoc-ngoai"].includes(profile.region) ? profile.region : "bac",
      location: String(profile.location || "").slice(0, 60),
      avatar: String(profile.avatar || "").slice(0, 500),
      isGuest: !!profile.isGuest
    };
    socket.data.profile = clean;
    socket.data.uid = clean.uid;
    tryMatch({
      socketId: socket.id, uid: clean.uid, profile: clean,
      wantGender: ["all", "male", "female", "other"].includes(wantGender) ? wantGender : "all",
      wantRegion: ["all", "bac", "trung", "nam", "nuoc-ngoai"].includes(wantRegion) ? wantRegion : "all"
    });
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

  socket.on("report_partner", () => {
    const partnerId = partnerOf.get(socket.id);
    const partner = partnerId ? io.sockets.sockets.get(partnerId)?.data?.profile : null;
    if (partner && socket.data.uid) {
      reports.push({ reporter: socket.data.uid, reported: partner.uid, at: new Date().toISOString() });
      remember(socket.data.uid, partner.uid); // chan ghep lai
      console.log("REPORT:", socket.data.uid, "->", partner.uid, "| total:", reports.length);
    }
    socket.emit("report_ok");
  });

  const endChat = (notify = true) => {
    const partnerId = partnerOf.get(socket.id);
    waiting = waiting.filter(w => w.socketId !== socket.id);
    if (partnerId) {
      partnerOf.delete(partnerId); partnerOf.delete(socket.id);
      if (notify) io.to(partnerId).emit("partner_left");
    }
  };
  socket.on("next", () => { endChat(true); if (socket.data.profile) tryMatch({ socketId: socket.id, uid: socket.data.uid, profile: socket.data.profile, wantGender: "all", wantRegion: "all" }); });
  socket.on("leave_queue", () => endChat(false));
  socket.on("disconnect", () => endChat(true));
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => console.log(`Server running on ${PORT}`));
