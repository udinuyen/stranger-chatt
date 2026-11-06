import { useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import { onAuthStateChanged } from "firebase/auth";
import { auth, loginGoogle, loginGuest, logout } from "./firebase";

const BACKEND = import.meta.env.VITE_BACKEND_URL || "http://localhost:10000";
const GENDER = { male: "♂ Nam", female: "♀ Nữ", other: "⚧ Khác" };
const REGION = { bac: "Miền Bắc", trung: "Miền Trung", nam: "Miền Nam", "nuoc-ngoai": "Nước ngoài" };
const THIS_YEAR = new Date().getFullYear();
const MAX_CHATS = 5;
const STICKERS = ["😀","😂","🥰","😍","😎","🤩","😜","🤗","😴","🤔","😱","🥺","😭","😡","👍","👏","🙏","💪","🔥","❤️","💔","🎉","🌹","🍀","🐱","🐶","🦄","🍕","☕","⚽"];
let socket;

export default function App() {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [nickname, setNickname] = useState("");
  const [gender, setGender] = useState("other");
  const [birthYear, setBirthYear] = useState(2000);
  const [region, setRegion] = useState("bac");
  const [wantGender, setWantGender] = useState("all");
  const [wantRegion, setWantRegion] = useState("all");
  const [location, setLocation] = useState("");
  const [editOpen, setEditOpen] = useState(false);

  // Nguoi online + xin chao
  const [onlineCount, setOnlineCount] = useState(0);
  const [onlineUsers, setOnlineUsers] = useState([]); // [{id, name, gender, age, region, location, avatar, isGuest}]
  const [onlineOpen, setOnlineOpen] = useState(false);
  const [waves, setWaves] = useState([]); // [{fromId, from}]
  const [waved, setWaved] = useState({}); // id -> true (da xin chao, khoa 60s)
  const [waveNote, setWaveNote] = useState("");

  // Multi-chat state
  const [chats, setChats] = useState([]); // {id, partner, msgs:[], typing, unread, ended}
  const [activeId, setActiveId] = useState(null);
  const [searching, setSearching] = useState(false);
  const [text, setText] = useState("");
  const [showStickers, setShowStickers] = useState(false);
  const [showQr, setShowQr] = useState(false);
  const [lightbox, setLightbox] = useState(null);
  const bottomRef = useRef(null);
  const fileRef = useRef(null);
  const noteTimerRef = useRef(null);
  const showNote = (msg) => {
    setWaveNote(msg);
    if (noteTimerRef.current) clearTimeout(noteTimerRef.current);
    noteTimerRef.current = setTimeout(() => setWaveNote(""), 4000);
  };
  const activeIdRef = useRef(null);
  activeIdRef.current = activeId;

  const active = chats.find(c => c.id === activeId) || null;

  useEffect(() => onAuthStateChanged(auth, setUser), []);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [active?.msgs, activeId]);
  useEffect(() => {
    fetch("https://ipapi.co/json/").then(r => r.json())
      .then(d => setLocation([d.city, d.country_name].filter(Boolean).join(", "))).catch(() => {});
  }, []);

  useEffect(() => {
    if (!profile) return;
    socket = io(BACKEND, { transports: ["websocket"] });
    socket.on("connect", () => socket.emit("go_online", profile));
    socket.on("online_update", ({ count, users }) => { setOnlineCount(count); setOnlineUsers(users || []); });
    socket.on("wave_received", ({ fromId, from }) =>
      setWaves(prev => prev.some(w => w.fromId === fromId) ? prev : [...prev, { fromId, from }]));
    socket.on("wave_sent", ({ toId }) => {
      setWaved(prev => ({ ...prev, [toId]: true }));
      showNote("Đã gửi lời xin chào 👋 Chờ bạn ấy trả lời nhé.");
      setTimeout(() => setWaved(prev => { const n = { ...prev }; delete n[toId]; return n; }), 60_000);
    });
    socket.on("wave_error", (msg) => showNote(msg));
    socket.on("wave_declined", ({ by }) => showNote(`${by?.name || "Bạn ấy"} đã bỏ qua lời xin chào lần này.`));
    const addMsg = (sessionId, msg) => setChats(prev => prev.map(c => c.id === sessionId
      ? { ...c, msgs: [...c.msgs, msg], unread: sessionId === activeIdRef.current ? 0 : c.unread + (msg.me ? 0 : 1) } : c));
    socket.on("waiting", () => setSearching(true));
    socket.on("matched", ({ sessionId, partner, partnerId }) => {
      setSearching(false);
      setChats(prev => [...prev, { id: sessionId, partner, partnerId, msgs: [], typing: false, unread: 0, ended: false }]);
      setActiveId(sessionId);
    });
    socket.on("receive_message", ({ sessionId, text }) => addMsg(sessionId, { kind: "text", text, me: false }));
    socket.on("receive_image", ({ sessionId, data }) => addMsg(sessionId, { kind: "image", data, me: false }));
    socket.on("receive_sticker", ({ sessionId, sticker }) => addMsg(sessionId, { kind: "sticker", sticker, me: false }));
    socket.on("partner_typing", ({ sessionId, isTyping }) =>
      setChats(prev => prev.map(c => c.id === sessionId ? { ...c, typing: isTyping } : c)));
    socket.on("partner_left", ({ sessionId }) =>
      setChats(prev => prev.map(c => c.id === sessionId ? { ...c, ended: true, typing: false } : c)));
    socket.on("report_ok", () => alert("Đã ghi nhận báo cáo. Người này sẽ không được ghép lại với bạn."));
    socket.on("error_msg", (code) => {
      if (code === "underage") { alert("StrangerChat chỉ dành cho người từ 18 tuổi trở lên."); setProfile(null); }
      if (code === "image_too_big") alert("Ảnh quá lớn, gửi không thành công. Chọn ảnh nhỏ hơn nhé.");
      if (code === "max_sessions") { setSearching(false); alert(`Bạn đang có tối đa ${MAX_CHATS} cuộc trò chuyện cùng lúc rồi.`); }
    });
    return () => socket.disconnect();
  }, [profile]);

  const myAge = THIS_YEAR - birthYear;
  const saveProfile = () => {
    if (myAge < 18) return alert("Bạn phải từ 18 tuổi trở lên để dùng StrangerChat.");
    setProfile({
      uid: user.uid,
      name: nickname.trim() || (user.isAnonymous ? `Khách-${user.uid.slice(0, 5)}` : (user.displayName || "Người dùng")),
      avatar: user.photoURL || `https://api.dicebear.com/9.x/thumbs/svg?seed=${user.uid}`,
      isGuest: user.isAnonymous, gender, birthYear, region, location: location || ""
    });
  };

  const find = () => socket.emit("join_queue", { profile, wantGender, wantRegion });
  const cancelSearch = () => { socket.emit("cancel_search"); setSearching(false); };
  const wave = (u) => { setWaveNote(""); socket.emit("wave", { toId: u.id }); };
  const acceptWave = (w) => { setWaves(prev => prev.filter(x => x.fromId !== w.fromId)); socket.emit("wave_accept", { fromId: w.fromId }); };
  const declineWave = (w) => { setWaves(prev => prev.filter(x => x.fromId !== w.fromId)); socket.emit("wave_decline", { fromId: w.fromId }); };
  const openChat = (id) => { setActiveId(id); setChats(prev => prev.map(c => c.id === id ? { ...c, unread: 0 } : c)); };
  const closeChat = (id) => {
    socket.emit("leave_session", { sessionId: id });
    setChats(prev => prev.filter(c => c.id !== id));
    if (activeIdRef.current === id) setActiveId(null);
  };
  const nextChat = (id) => { setChats(prev => prev.filter(c => c.id !== id)); if (activeIdRef.current === id) setActiveId(null); socket.emit("next", { sessionId: id }); };
  const report = (id) => { if (confirm("Báo cáo người này? Cuộc trò chuyện sẽ kết thúc và bạn không bị ghép lại với họ.")) { setChats(prev => prev.filter(c => c.id !== id)); if (activeIdRef.current === id) setActiveId(null); socket.emit("report_partner", { sessionId: id }); } };

  const send = () => { if (!text.trim() || !active) return; setChats(prev => prev.map(c => c.id === active.id ? { ...c, msgs: [...c.msgs, { kind: "text", text, me: true }] } : c)); socket.emit("send_message", { sessionId: active.id, text }); setText(""); };
  const sendSticker = (s) => { if (!active) return; const id = active.id; setChats(prev => prev.map(c => c.id === id ? { ...c, msgs: [...c.msgs, { kind: "sticker", sticker: s, me: true }] } : c)); socket.emit("send_sticker", { sessionId: id, sticker: s }); setShowStickers(false); };

  const onPickImage = (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !file.type.startsWith("image/") || !active) return;
    const chatId = active.id;
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      let scale = Math.min(1, 1024 / Math.max(img.width, img.height));
      const render = (sc, q) => { const c = document.createElement("canvas"); c.width = Math.round(img.width * sc); c.height = Math.round(img.height * sc); c.getContext("2d").drawImage(img, 0, 0, c.width, c.height); return c.toDataURL("image/jpeg", q); };
      let data = render(scale, 0.82);
      if (data.length > 2_200_000) data = render(scale * 0.7, 0.7);
      if (data.length > 2_300_000) return alert("Ảnh này quá lớn kể cả sau khi nén. Chọn ảnh khác nhé.");
      setChats(prev => prev.map(c => c.id === chatId ? { ...c, msgs: [...c.msgs, { kind: "image", data, me: true }] } : c));
      socket.emit("send_image", { sessionId: chatId, data });
    };
    img.onerror = () => { URL.revokeObjectURL(url); alert("Không đọc được file ảnh này."); };
    img.src = url;
  };

  // ---------- LANDING PAGE ----------
  if (!user) return (
    <div className="landing">
      <div className="card">
        <h1>💬 StrangerChat</h1>
        <p className="hero">Một người lạ đang chờ nói chuyện với bạn</p>
        <p>Trò chuyện ẩn danh với người thật đang online: tâm sự, chém gió hay chỉ để bớt buồn. Tin nhắn không lưu trên máy chủ — rời đi là xoá dấu vết. Chat được tối đa {MAX_CHATS} người cùng lúc.</p>
        <button className="primary big" onClick={loginGoogle}>Đăng nhập bằng Google</button>
        <button className="big" onClick={loginGuest}>Vào nhanh với tư cách Khách</button>
        <button className="dlbtn" onClick={() => setShowQr(true)}>📱 Tải app Android (APK)</button>
        <small>Bấm nút tải app sẽ hiện mã QR — quét bằng điện thoại để mở StrangerChat ngay trên điện thoại. iPhone cứ dùng bản web này là chat chung được với mọi người.</small>
        <small>Chỉ dành cho người từ 18 tuổi trở lên.</small>
      </div>
      <div className="card">
        <h3>Cách hoạt động</h3>
        <ol className="steps">
          <li>Đăng nhập Google hoặc vào Khách, chọn biệt danh, giới tính, năm sinh và khu vực.</li>
          <li>Bấm “Tìm người lạ” — hệ thống ghép bạn với một người đang online, không ghép lại người cũ.</li>
          <li>Trò chuyện thoải mái, gửi ảnh và sticker. Muốn dừng thì Kết thúc, gặp người xấu thì Báo cáo (2 chạm).</li>
        </ol>
        <h3>An toàn là trên hết</h3>
        <ul className="steps">
          <li>Không cần số điện thoại hay tên thật, chỉ hiện những gì bạn chọn.</li>
          <li>Không chia sẻ địa chỉ nhà, SĐT, mật khẩu cho người lạ.</li>
          <li>Rời đi bất cứ lúc nào — người đó không được ghép lại với bạn.</li>
        </ul>
      </div>
      {showQr && (
        <div className="lightbox" onClick={() => setShowQr(false)}>
          <div className="qrcard" onClick={e => e.stopPropagation()}>
            <img src="/qr-poster.png" alt="Mã QR StrangerChat — quét để mở trên điện thoại" />
            <button className="primary" onClick={() => setShowQr(false)}>Đóng</button>
          </div>
        </div>
      )}
    </div>
  );

  // ---------- HO SO ----------
  // Gon: mac dinh form thu lai thanh 1 dong tom tat, chi thay 2 nut
  // Tiep tuc / Dang xuat. Ai can sua thi bam vao tom tat de mo form ra.
  const displayName = nickname.trim() || (user.isAnonymous ? `Khách-${user.uid.slice(0, 5)}` : (user.displayName || "Người dùng"));
  if (!profile) return (
    <div className="card">
      <h2>Hồ sơ của bạn</h2>
      <img className="avatar" src={user.photoURL || `https://api.dicebear.com/9.x/thumbs/svg?seed=${user.uid}`} alt="" />

      <div className="profile-summary" onClick={() => setEditOpen(v => !v)} role="button" aria-expanded={editOpen} title="Bấm để chỉnh sửa hồ sơ">
        <div className="summary-text">
          <b>{displayName}</b>
          <span>{GENDER[gender]} · {myAge} tuổi · {REGION[region]}{location ? ` · 📍 ${location}` : ""}</span>
          {myAge < 18 && <span className="warn">Chưa đủ 18 tuổi — bấm vào đây để sửa năm sinh</span>}
          <small>Chạm để {editOpen ? "thu gọn" : "chỉnh sửa hồ sơ"}</small>
        </div>
        <span className="chevron">{editOpen ? "▴" : "▾"}</span>
      </div>

      {editOpen && (
        <div className="profile-form">
          <label>Biệt danh (người lạ sẽ thấy tên này)
            <input value={nickname} onChange={e => setNickname(e.target.value)} placeholder="Để trống = dùng tên tài khoản" maxLength={40} /></label>
          <label>Giới tính của bạn
            <select value={gender} onChange={e => setGender(e.target.value)}>
              <option value="male">Nam</option><option value="female">Nữ</option><option value="other">Khác</option>
            </select></label>
          <label>Năm sinh (chỉ hiện tuổi, không hiện năm sinh)
            <input type="number" value={birthYear} onChange={e => setBirthYear(parseInt(e.target.value) || THIS_YEAR)} min="1950" max={THIS_YEAR} />
            {birthYear > 1900 && <small className={myAge < 18 ? "warn" : ""}>Tuổi của bạn: {myAge}{myAge < 18 ? " — chưa đủ 18 tuổi" : ""}</small>}</label>
          <label>Khu vực của bạn
            <select value={region} onChange={e => setRegion(e.target.value)}>
              {Object.entries(REGION).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select></label>
          <label>Thành phố (tự đoán theo mạng, sửa được — để trống nếu muốn giấu)
            <input value={location} onChange={e => setLocation(e.target.value)} placeholder="VD: Hà Nội, Vietnam" /></label>
        </div>
      )}

      <button className="primary" onClick={saveProfile}>Tiếp tục</button>
      <button onClick={logout}>Đăng xuất</button>
    </div>
  );

  // ---------- MULTI-CHAT (bo cuc kieu nguoila: chat o giua + cot menu ben phai) ----------
  const chattingIds = new Set(chats.filter(c => !c.ended).map(c => c.partnerId).filter(Boolean));
  return (
    <div className="shell">
      <main className="maincol">
        {waves.map(w => (
          <div key={w.fromId} className="wavebanner">
            <img className="avatar sm" src={w.from.avatar} alt="" />
            <span><b>{w.from.name}</b> 👋 xin chào bạn! · {GENDER[w.from.gender]}{w.from.age ? ` · ${w.from.age} tuổi` : ""} · {REGION[w.from.region] || ""}</span>
            <button className="primary" onClick={() => acceptWave(w)}>💬 Chat ngay</button>
            <button onClick={() => declineWave(w)}>Bỏ qua</button>
          </div>
        ))}
        {waveNote && <div className="wavenote" onClick={() => setWaveNote("")}>{waveNote}</div>}

        <div className="tabsbar">
          <button className="addtab" title={searching ? "Huỷ tìm" : "Tìm người lạ"} onClick={searching ? cancelSearch : (chats.length < MAX_CHATS ? find : undefined)}>
            <span className="plus">{searching ? "…" : "+"}</span>
            <small>{searching ? "Đang tìm" : chats.length > 0 ? "Tìm thêm" : "Tìm người"}</small>
          </button>
          {chats.map(c => (
            <button key={c.id} className={c.id === activeId ? "tab on" : "tab"} onClick={() => openChat(c.id)} title={c.partner.name}>
              <span className="tabimg">
                <img src={c.partner.avatar} alt={c.partner.name} />
                {c.unread > 0 && <span className="badge">{c.unread}</span>}
                {c.ended && <span className="off">●</span>}
              </span>
              <small>{c.partner.name}</small>
            </button>
          ))}
          <span className="tabcount">{chats.length}/{MAX_CHATS} cuộc</span>
        </div>

        {active ? (
          <>
            <div className="partnercenter">
              <span>Bạn đang chat với</span>
              <img className="avatar xs" src={active.partner.avatar} alt="" />
              <b>{active.partner.name}{active.partner.isGuest && !active.partner.name.startsWith("Khách") ? " (Khách)" : ""}</b>
              {active.partner.age ? <span>{active.partner.age} tuổi · {REGION[active.partner.region] || ""}</span> : <span>{REGION[active.partner.region] || ""}</span>}
              <span className={active.ended ? "pstatus off" : "pstatus on"}>{active.ended ? "Đã rời đi" : "Đang chat"}</span>
            </div>
            {active.ended && <div className="ended">Người lạ đã rời cuộc trò chuyện này. Bạn có thể đóng tab này và chat tiếp ở các tab khác.</div>}
            <div className="msgs">
              <div className="sysnote">Tin nhắn không được lưu trên máy chủ và sẽ biến mất khi bạn rời cuộc trò chuyện. Đừng chia sẻ SĐT, địa chỉ hay mật khẩu — yên tâm chém gió nhé!</div>
              {active.msgs.map((m, i) => m.kind === "image"
                ? <div key={i} className={m.me ? "msg me imgmsg" : "msg imgmsg"}><img src={m.data} alt="Ảnh" onClick={() => setLightbox(m.data)} /></div>
                : m.kind === "sticker"
                  ? <div key={i} className={m.me ? "msg me sticker" : "msg sticker"}>{m.sticker}</div>
                  : <div key={i} className={m.me ? "msg me" : "msg"}>{m.text}</div>)}
              {active.typing && <div className="msg">Đang gõ...</div>}<div ref={bottomRef} />
            </div>
            {showStickers && <div className="stickers">{STICKERS.map(s => <button key={s} onClick={() => sendSticker(s)}>{s}</button>)}</div>}
            <div className="composer2">
              <button className="iconbtn" title="Gửi ảnh" disabled={active.ended} onClick={() => fileRef.current?.click()}>📷</button>
              <button className="iconbtn" title="Sticker" disabled={active.ended} onClick={() => setShowStickers(v => !v)}>😀</button>
              <input className="flatinput" value={text} disabled={active.ended} onChange={e => { setText(e.target.value); socket.emit("typing", { sessionId: active.id, isTyping: true }); }}
                onKeyDown={e => e.key === "Enter" && send()} placeholder="Hãy nói gì đó đi nào..." />
              <button className="sendbtn" title="Gửi" disabled={active.ended} onClick={send}>➤</button>
              <input ref={fileRef} type="file" accept="image/*" hidden onChange={onPickImage} />
            </div>
          </>
        ) : (
          <div className="find">
            <label>Muốn gặp giới tính: <select value={wantGender} onChange={e => setWantGender(e.target.value)}>
              <option value="all">Tất cả</option><option value="male">Nam</option><option value="female">Nữ</option><option value="other">Khác</option>
            </select></label>
            <label>Ưu tiên khu vực: <select value={wantRegion} onChange={e => setWantRegion(e.target.value)}>
              <option value="all">Tất cả</option>
              {Object.entries(REGION).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select></label>
            {searching ? <><p>⏳ Đang tìm người lạ...</p><button onClick={cancelSearch}>Huỷ</button></>
              : <button className="primary big" onClick={find}>🔍 Tìm người lạ</button>}
            {chats.length > 0 && <p>Bạn còn {chats.length} cuộc đã kết thúc ở trên — bấm avatar để xem lại hoặc đóng.</p>}
          </div>
        )}
      </main>

      <aside className="sidecol">
        <div className="sideprofile">
          <img className="avatar lg" src={profile.avatar} alt="" />
          <b>{profile.name}{profile.isGuest && !profile.name.startsWith("Khách") ? " (Khách)" : ""}</b>
          <span>{GENDER[profile.gender]} · {THIS_YEAR - profile.birthYear} tuổi · {REGION[profile.region]}{profile.location ? ` · 📍 ${profile.location}` : ""}</span>
        </div>

        <div>
          <div className="onlinebar" onClick={() => setOnlineOpen(v => !v)} role="button" aria-expanded={onlineOpen} title="Bấm để xem ai đang online">
            <span>🟢 <b>{onlineCount}</b> người đang online{onlineUsers.length > 0 ? ` — còn ${onlineUsers.length} người` : ""}</span>
            <span className="chevron">{onlineOpen ? "▴" : "▾"}</span>
          </div>
          {onlineOpen && (
            <div className="onlinelist">
              {onlineUsers.length === 0
                ? <small>Chưa có ai khác online lúc này. Chờ một lát hoặc bấm Tìm người lạ nhé.</small>
                : onlineUsers.map(u => (
                  <div key={u.id} className="onlineuser">
                    <img className="avatar sm" src={u.avatar} alt="" />
                    <span className="onlineinfo"><b>{u.name}</b>{u.isGuest && !u.name.startsWith("Khách") ? " (Khách)" : ""} · {GENDER[u.gender]}{u.age ? ` · ${u.age} tuổi` : ""} · {REGION[u.region] || ""}{u.location ? ` · 📍 ${u.location}` : ""}</span>
                    {chattingIds.has(u.id)
                      ? <span className="chattingtag">Đang chat</span>
                      : <button className="wavebtn" disabled={!!waved[u.id]} onClick={() => wave(u)}>{waved[u.id] ? "Đã chào ✓" : "👋 Xin chào"}</button>}
                  </div>
                ))}
            </div>
          )}
        </div>

        <nav className="sidemenu">
          <button onClick={() => setProfile(null)}>✏️ Chỉnh sửa hồ sơ</button>
          <button disabled={!active || active.ended} onClick={() => active && nextChat(active.id)}>⏭ Người tiếp theo</button>
          <button disabled={!active} onClick={() => active && report(active.id)}>🚩 Báo xấu</button>
          <button disabled={!active} onClick={() => active && closeChat(active.id)}>✖ Thoát trò chuyện</button>
          <button onClick={logout}>🚪 Đăng xuất</button>
        </nav>

        <div className="sidefoot">
          <a href="/privacy.html" target="_blank" rel="noreferrer">Chính sách riêng tư</a> · Chỉ dành cho người 18+<br />
          Tin nhắn không được lưu trên máy chủ.
        </div>
      </aside>

      {lightbox && <div className="lightbox" onClick={() => setLightbox(null)}><img src={lightbox} alt="Ảnh phóng to" /></div>}
    </div>
  );
}
