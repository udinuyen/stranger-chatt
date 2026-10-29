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

  // Multi-chat state
  const [chats, setChats] = useState([]); // {id, partner, msgs:[], typing, unread, ended}
  const [activeId, setActiveId] = useState(null);
  const [searching, setSearching] = useState(false);
  const [text, setText] = useState("");
  const [showStickers, setShowStickers] = useState(false);
  const [lightbox, setLightbox] = useState(null);
  const bottomRef = useRef(null);
  const fileRef = useRef(null);
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
    const addMsg = (sessionId, msg) => setChats(prev => prev.map(c => c.id === sessionId
      ? { ...c, msgs: [...c.msgs, msg], unread: sessionId === activeIdRef.current ? 0 : c.unread + (msg.me ? 0 : 1) } : c));
    socket.on("waiting", () => setSearching(true));
    socket.on("matched", ({ sessionId, partner }) => {
      setSearching(false);
      setChats(prev => [...prev, { id: sessionId, partner, msgs: [], typing: false, unread: 0, ended: false }]);
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
    </div>
  );

  // ---------- HO SO ----------
  if (!profile) return (
    <div className="card">
      <h2>Hồ sơ của bạn</h2>
      <img className="avatar" src={user.photoURL || `https://api.dicebear.com/9.x/thumbs/svg?seed=${user.uid}`} alt="" />
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
      <button className="primary" onClick={saveProfile}>Tiếp tục</button>
      <button onClick={logout}>Đăng xuất</button>
    </div>
  );

  // ---------- MULTI-CHAT ----------
  return (
    <div className="card wide">
      <header>
        <div><b>{profile.name}</b> · {GENDER[profile.gender]} · {THIS_YEAR - profile.birthYear} tuổi · {REGION[profile.region]}{profile.location && ` · 📍 ${profile.location}`} {profile.isGuest && "(Khách)"}</div>
        <button onClick={logout}>Đăng xuất</button>
      </header>

      {chats.length > 0 && (
        <div className="tabs">
          {chats.map(c => (
            <button key={c.id} className={c.id === activeId ? "tab on" : "tab"} onClick={() => openChat(c.id)} title={c.partner.name}>
              <img src={c.partner.avatar} alt={c.partner.name} />
              {c.unread > 0 && <span className="badge">{c.unread}</span>}
              {c.ended && <span className="off">●</span>}
            </button>
          ))}
          <span className="tabcount">{chats.length}/{MAX_CHATS} cuộc</span>
        </div>
      )}

      {active ? (
        <>
          <div className="partner">Đang chat với: <b>{active.partner.name}</b> · {GENDER[active.partner.gender]}{active.partner.age && ` · ${active.partner.age} tuổi`} · {REGION[active.partner.region] || ""}{active.partner.location && ` · 📍 ${active.partner.location}`} {active.partner.isGuest && "(Khách)"}
            <img className="avatar sm" src={active.partner.avatar} alt="" /></div>
          {active.ended && <div className="ended">Người lạ đã rời cuộc trò chuyện này. Bạn có thể đóng tab này và chat tiếp ở các tab khác.</div>}
          <div className="msgs">
            {active.msgs.map((m, i) => m.kind === "image"
              ? <div key={i} className={m.me ? "msg me imgmsg" : "msg imgmsg"}><img src={m.data} alt="Ảnh" onClick={() => setLightbox(m.data)} /></div>
              : m.kind === "sticker"
                ? <div key={i} className={m.me ? "msg me sticker" : "msg sticker"}>{m.sticker}</div>
                : <div key={i} className={m.me ? "msg me" : "msg"}>{m.text}</div>)}
            {active.typing && <div className="msg">Đang gõ...</div>}<div ref={bottomRef} />
          </div>
          {showStickers && <div className="stickers">{STICKERS.map(s => <button key={s} onClick={() => sendSticker(s)}>{s}</button>)}</div>}
          <div className="row">
            <button title="Gửi ảnh" disabled={active.ended} onClick={() => fileRef.current?.click()}>📷</button>
            <button title="Sticker" disabled={active.ended} onClick={() => setShowStickers(v => !v)}>😀</button>
            <input value={text} disabled={active.ended} onChange={e => { setText(e.target.value); socket.emit("typing", { sessionId: active.id, isTyping: true }); }}
              onKeyDown={e => e.key === "Enter" && send()} placeholder="Nhập tin nhắn..." />
            <button className="primary" disabled={active.ended} onClick={send}>Gửi</button>
            <input ref={fileRef} type="file" accept="image/*" hidden onChange={onPickImage} />
          </div>
          <div className="row"><button onClick={() => nextChat(active.id)}>⏭ Người tiếp theo</button><button onClick={() => report(active.id)}>🚩 Báo cáo</button><button onClick={() => closeChat(active.id)}>✖ Đóng cuộc này</button></div>
          <div className="row findmore">
            {searching ? <><span>⏳ Đang tìm thêm người...</span><button onClick={cancelSearch}>Huỷ tìm</button></>
              : chats.length < MAX_CHATS ? <button className="primary" onClick={find}>➕ Tìm thêm người lạ</button>
              : <span>Đã đạt tối đa {MAX_CHATS} cuộc cùng lúc</span>}
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
      {lightbox && <div className="lightbox" onClick={() => setLightbox(null)}><img src={lightbox} alt="Ảnh phóng to" /></div>}
      <small>⚠️ Không chia sẻ SĐT, địa chỉ nhà, mật khẩu. Tin nhắn không được lưu trên máy chủ.</small>
    </div>
  );
}
