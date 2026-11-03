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
app.get("/", (req, res) => res.json({ ok: true, name: "StrangerChat API", online: online.size, waiting: waiting.length, sessions: sessions.size, time: new Date().toISOString() }));
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
const online = new Map();   // socketId -> publicProfile (thong tin cong khai, KHONG co uid)
const blocked = new Map();  // uid -> Set<uid> da bi bao cao (chan ca xin chao lan ghep truc tiep)
const waveCooldown = new Map(); // "uid->uid" -> thoi diem xin chao gan nhat (chong spam)

const isBlocked = (a, b) => blocked.get(a)?.has(b) || blocked.get(b)?.has(a);
function addBlocked(a, b) {
  if (!blocked.has(a)) blocked.set(a, new Set());
  if (!blocked.has(b)) blocked.set(b, new Set());
  blocked.get(a).add(b); blocked.get(b).add(a);
}
function sanitizeProfile(profile) {
  const year = new Date().getFullYear();
  const birthYear = parseInt(profile.birthYear, 10);
  const age = birthYear >= 1950 && birthYear <= year ? year - birthYear : null;
  return {
    uid: String(profile.uid).slice(0, 60),
    name: String(profile.name).slice(0, 40),
    gender: ["male", "female", "other"].includes(profile.gender) ? profile.gender : "other",
    birthYear: age !== null ? birthYear : null, age,
    region: ["bac", "trung", "nam", "nuoc-ngoai"].includes(profile.region) ? profile.region : "bac",
    location: String(profile.location || "").slice(0, 60),
    avatar: String(profile.avatar || "").slice(0, 500),
    isGuest: !!profile.isGuest
  };
}
// Ban cong khai gui cho nguoi khac: bo uid, bo birthYear (chi gui tuoi)
const publicProfile = (p) => ({ name: p.name, gender: p.gender, age: p.age, region: p.region, location: p.location, avatar: p.avatar, isGuest: p.isGuest });
function broadcastOnline() {
  const users = [...online.entries()].map(([id, p]) => ({ id, ...p }));
  for (const [sid, sock] of io.sockets.sockets) {
    sock.emit("online_update", { count: online.size, users: users.filter(u => u.id !== sid) });
  }
}
const alreadyTogether = (sidA, sidB) => [...sessions.values()].some(s => (s.a === sidA && s.b === sidB) || (s.a === sidB && s.b === sidA));
function createSession(sockA, sockB) {
  waiting = waiting.filter(w => w.socketId !== sockA.id && w.socketId !== sockB.id);
  sockA.data.searching = false; sockB.data.searching = false;
  const sessionId = randomUUID();
  sessions.set(sessionId, { a: sockA.id, b: sockB.id });
  sockA.data.sessions.add(sessionId); sockB.data.sessions.add(sessionId);
  remember(sockA.data.uid, sockB.data.uid);
  sockA.emit("matched", { sessionId, partner: publicProfile(sockB.data.profile) });
  sockB.emit("matched", { sessionId, partner: publicProfile(sockA.data.profile) });
  console.log("Matched:", sockA.data.profile.name, "<->", sockB.data.profile.name, "| sessions:", sessions.size);
  return sessionId;
}

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
  createSession(socket, partnerSock);
}

io.on("connection", (socket) => {
  socket.data.sessions = new Set();
  socket.data.searching = false;

  socket.on("join_queue", ({ profile, wantGender, wantRegion }) => {
    if (!profile?.name || !profile?.gender || !profile?.uid) return socket.emit("error_msg", "Thiếu profile");
    const clean = sanitizeProfile(profile);
    if (clean.age !== null && clean.age < 18) return socket.emit("error_msg", "underage");
    socket.data.profile = clean;
    socket.data.uid = clean.uid;
    if (!online.has(socket.id)) { online.set(socket.id, publicProfile(clean)); broadcastOnline(); }
    socket.data.searchParams = {
      wantGender: ["all", "male", "female", "other"].includes(wantGender) ? wantGender : "all",
      wantRegion: ["all", "bac", "trung", "nam", "nuoc-ngoai"].includes(wantRegion) ? wantRegion : "all"
    };
    startSearch(socket);
  });

  // --- Nguoi online + Xin chao ---
  socket.on("go_online", (profile) => {
    if (!profile?.name || !profile?.gender || !profile?.uid) return;
    const clean = sanitizeProfile(profile);
    if (clean.age !== null && clean.age < 18) return socket.emit("error_msg", "underage");
    socket.data.profile = clean;
    socket.data.uid = clean.uid;
    online.set(socket.id, publicProfile(clean));
    broadcastOnline();
  });

  socket.on("wave", ({ toId } = {}) => {
    if (!socket.data.profile || !toId || toId === socket.id) return;
    const target = io.sockets.sockets.get(toId);
    if (!target?.data?.profile || !online.has(toId)) return socket.emit("wave_error", "Người đó vừa offline rồi.");
    if (isBlocked(socket.data.uid, target.data.uid)) return socket.emit("wave_error", "Không thể xin chào người này.");
    if (alreadyTogether(socket.id, toId)) return socket.emit("wave_error", "Bạn đang chat với người này rồi.");
    const key = `${socket.data.uid}->${target.data.uid}`;
    const last = waveCooldown.get(key) || 0;
    if (Date.now() - last < 60_000) return socket.emit("wave_error", "Bạn vừa xin chào người này rồi, chờ một chút nhé.");
    waveCooldown.set(key, Date.now());
    target.emit("wave_received", { fromId: socket.id, from: publicProfile(socket.data.profile) });
    socket.emit("wave_sent", { toId });
  });

  socket.on("wave_accept", ({ fromId } = {}) => {
    const waver = fromId && io.sockets.sockets.get(fromId);
    if (!waver?.data?.profile || !socket.data.profile) return socket.emit("wave_error", "Người xin chào vừa offline rồi.");
    if (isBlocked(socket.data.uid, waver.data.uid)) return socket.emit("wave_error", "Không thể chat với người này.");
    if (alreadyTogether(socket.id, waver.id)) return;
    if (sessionCount(socket) >= MAX_SESSIONS || sessionCount(waver) >= MAX_SESSIONS)
      return socket.emit("wave_error", "Một trong hai người đã đủ 5 cuộc chat cùng lúc.");
    createSession(socket, waver);
  });

  socket.on("wave_decline", ({ fromId } = {}) => {
    const waver = fromId && io.sockets.sockets.get(fromId);
    if (waver && socket.data.profile) waver.emit("wave_declined", { by: publicProfile(socket.data.profile) });
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
      addBlocked(socket.data.uid, partnerProfile.uid);
      console.log("REPORT:", socket.data.uid, "->", partnerProfile.uid, "| total:", reports.length);
    }
    if (sessionId && p) endSession(sessionId);
    socket.emit("report_ok", { sessionId });
  });

  socket.on("disconnect", () => {
    waiting = waiting.filter(w => w.socketId !== socket.id);
    if (online.delete(socket.id)) broadcastOnline();
    [...(socket.data.sessions || [])].forEach(sid => endSession(sid));
  });
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => console.log(`Server running on ${PORT}`));
