import express from "express";
import http from "http";
import cors from "cors";
import { randomUUID } from "crypto";
import { Server } from "socket.io";

const app = express();
const server = http.createServer(app);
const CLIENT_URL = process.env.CLIENT_URL || "*";
const MAX_SESSIONS = 5;

app.use(cors({ origin: CLIENT_URL === "*" ? true : CLIENT_URL.split(",") }));
app.get("/", (req, res) => res.json({ ok: true, name: "StrangerChat API", waiting: waiting.length, sessions: sessions.size, time: new Date().toISOString() }));
app.get("/health", (req, res) => res.json({ ok: true }));

const io = new Server(server, {
  cors: { origin: CLIENT_URL === "*" ? "*" : CLIENT_URL.split(","), methods: ["GET", "POST"] },
  maxHttpBufferSize: 3e6 // 3MB cho anh da nen
});

// --- v2 Step 3: MULTI-CHAT ---
// Moi cuoc tro chuyen la 1 "session" doc lap. 1 nguoi co toi da MAX_SESSIONS session cung luc.
// waiting: [{ socketId, uid, profile, wantGender, wantRegion }] - moi socket chi co 1 entry (dang tim them 1 nguoi)
let waiting = [];
const sessions = new Map(); // sessionId -> { a, b } (socketId)
const history = new Map();  // uid -> Set<uid> da tung ghep (khong ghep lai)
const reports = [];

const seen = (a, b) => history.get(a)?.has(b) || history.get(b)?.has(a);
function remember(a, b) {
  if (!history.has(a)) history.set(a, new Set());
  if (!history.has(b)) history.set(b, new Set());
  history.get(a).add(b); history.get(b).add(a);
}
const sessionCount = (socket) => socket.data.sessions?.size || 0;
function partnerSocketId(socket, sessionId) {
  const s = sessions.get(sessionId);
  if (!s) return null;
  return s.a === socket.id ? s.b : s.b === socket.id ? s.a : null;
}
function endSession(sessionId, exceptSocketId = null) {
  const s = sessions.get(sessionId);
  if (!s) return;
  sessions.delete(sessionId);
  for (const sid of [s.a, s.b]) {
    const sock = io.sockets.sockets.get(sid);
    sock?.data.sessions?.delete(sessionId);
    if (sid !== exceptSocketId && sock) sock.emit("partner_left", { sessionId });
  }
}
function startSearch(socket) {
  if (!socket.data.profile || socket.data.searching) return;
  if (sessionCount(socket) >= MAX_SESSIONS) return socket.emit("error_msg", "max_sessions");
  socket.data.searching = true;
  const entry = { socketId: socket.id, uid: socket.data.uid, profile: socket.data.profile, ...socket.data.searchParams };
  const find = (strictRegion) => waiting.findIndex(w =>
    w.socketId !== socket.id && !seen(entry.uid, w.uid) &&
    (entry.wantGender === "all" || w.profile.gender === entry.wantGender) &&
    (w.wantGender === "all" || w.profile.gender === entry.profile.gender) &&
    (!strictRegion || entry.wantRegion === "all" || w.profile.region === entry.wantRegion)
  );
  let idx = find(true);
  if (idx === -1) idx = find(false);
  if (idx === -1) { waiting.push(entry); socket.emit("waiting"); return; }
  const [partner] = waiting.splice(idx, 1);
  const partnerSock = io.sockets.sockets.get(partner.socketId);
  if (!partnerSock) { waiting.push(entry); socket.emit("waiting"); return; }
  partnerSock.data.searching = false; socket.data.searching = false;
  const sessionId = randomUUID();
  sessions.set(sessionId, { a: socket.id, b: partner.socketId });
  socket.data.sessions.add(sessionId); partnerSock.data.sessions.add(sessionId);
  remember(entry.uid, partner.uid);
  socket.emit("matched", { sessionId, partner: partner.profile });
  partnerSock.emit("matched", { sessionId, partner: entry.profile });
  console.log("Matched:", entry.profile.name, "<->", partner.profile.name, "| sessions:", sessions.size);
}

io.on("connection", (socket) => {
  socket.data.sessions = new Set();
  socket.data.searching = false;

  socket.on("join_queue", ({ profile, wantGender, wantRegion }) => {
    if (!profile?.name || !profile?.gender || !profile?.uid) return socket.emit("error_msg", "Thiếu profile");
    const year = new Date().getFullYear();
    const birthYear = parseInt(profile.birthYear, 10);
    const age = birthYear >= 1950 && birthYear <= year ? year - birthYear : null;
    if (age !== null && age < 18) return socket.emit("error_msg", "underage");
    socket.data.profile = {
      uid: String(profile.uid).slice(0, 60),
      name: String(profile.name).slice(0, 40),
      gender: ["male", "female", "other"].includes(profile.gender) ? profile.gender : "other",
      birthYear: age !== null ? birthYear : null, age,
      region: ["bac", "trung", "nam", "nuoc-ngoai"].includes(profile.region) ? profile.region : "bac",
      location: String(profile.location || "").slice(0, 60),
      avatar: String(profile.avatar || "").slice(0, 500),
      isGuest: !!profile.isGuest
    };
    socket.data.uid = socket.data.profile.uid;
    socket.data.searchParams = {
      wantGender: ["all", "male", "female", "other"].includes(wantGender) ? wantGender : "all",
      wantRegion: ["all", "bac", "trung", "nam", "nuoc-ngoai"].includes(wantRegion) ? wantRegion : "all"
    };
    startSearch(socket);
  });

  socket.on("cancel_search", () => {
    socket.data.searching = false;
    waiting = waiting.filter(w => w.socketId !== socket.id);
  });

  socket.on("send_message", ({ sessionId, text }) => {
    const p = sessionId && partnerSocketId(socket, sessionId);
    if (p && text?.trim()) io.to(p).emit("receive_message", { sessionId, text: String(text).slice(0, 1000), at: Date.now() });
  });
  socket.on("send_image", ({ sessionId, data }) => {
    const p = sessionId && partnerSocketId(socket, sessionId);
    if (!p || typeof data !== "string") return;
    if (data.length > 2_300_000) return socket.emit("error_msg", "image_too_big");
    if (!/^data:image\/(jpeg|png|webp);base64,/.test(data)) return;
    io.to(p).emit("receive_image", { sessionId, data, at: Date.now() });
  });
  socket.on("send_sticker", ({ sessionId, sticker }) => {
    const p = sessionId && partnerSocketId(socket, sessionId);
    if (p && typeof sticker === "string" && sticker && sticker.length <= 8)
      io.to(p).emit("receive_sticker", { sessionId, sticker, at: Date.now() });
  });
  socket.on("typing", ({ sessionId, isTyping }) => {
    const p = sessionId && partnerSocketId(socket, sessionId);
    if (p) io.to(p).emit("partner_typing", { sessionId, isTyping: !!isTyping });
  });

  socket.on("leave_session", ({ sessionId }) => { if (sessionId && partnerSocketId(socket, sessionId)) endSession(sessionId); });
  socket.on("next", ({ sessionId }) => { if (sessionId && partnerSocketId(socket, sessionId)) endSession(sessionId, socket.id); startSearch(socket); });
  socket.on("report_partner", ({ sessionId }) => {
    const p = sessionId && partnerSocketId(socket, sessionId);
    const partnerProfile = p ? io.sockets.sockets.get(p)?.data?.profile : null;
    if (partnerProfile && socket.data.uid) {
      reports.push({ reporter: socket.data.uid, reported: partnerProfile.uid, at: new Date().toISOString() });
      remember(socket.data.uid, partnerProfile.uid);
      console.log("REPORT:", socket.data.uid, "->", partnerProfile.uid, "| total:", reports.length);
    }
    if (sessionId && p) endSession(sessionId);
    socket.emit("report_ok", { sessionId });
  });

  socket.on("disconnect", () => {
    waiting = waiting.filter(w => w.socketId !== socket.id);
    [...(socket.data.sessions || [])].forEach(sid => endSession(sid));
  });
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => console.log(`Server running on ${PORT}`));
