import { useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import { onAuthStateChanged } from "firebase/auth";
import { auth, loginGoogle, loginGuest, logout } from "./firebase";

const BACKEND = import.meta.env.VITE_BACKEND_URL || "http://localhost:10000";
const GENDER = { male: "♂ Nam", female: "♀ Nữ", other: "⚧ Khác" };
let socket;

export default function App() {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null); // {name,gender,location,avatar,isGuest}
  const [gender, setGender] = useState("other");
  const [wantGender, setWantGender] = useState("all");
  const [location, setLocation] = useState("");
  const [status, setStatus] = useState("idle"); // idle | waiting | chatting
  const [partner, setPartner] = useState(null);
  const [msgs, setMsgs] = useState([]);
  const [text, setText] = useState("");
  const [typing, setTyping] = useState(false);
  const bottomRef = useRef(null);

  useEffect(() => onAuthStateChanged(auth, setUser), []);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs]);

  // Tự đoán vị trí theo IP (người dùng sửa được) - không dùng GPS để tôn trọng riêng tư
  useEffect(() => {
    fetch("https://ipapi.co/json/").then(r => r.json())
      .then(d => setLocation([d.city, d.country_name].filter(Boolean).join(", "))).catch(() => {});
  }, []);

  useEffect(() => {
    if (!profile) return;
    socket = io(BACKEND, { transports: ["websocket"] });
    socket.on("matched", ({ partner }) => { setPartner(partner); setStatus("chatting"); setMsgs([]); });
    socket.on("receive_message", ({ text, from }) => setMsgs(m => [...m, { text, me: false, from }]));
    socket.on("partner_typing", ({ isTyping }) => setTyping(isTyping));
    socket.on("partner_left", () => { setStatus("idle"); setPartner(null); alert("Người lạ đã rời đi. Bấm Tìm để gặp người mới."); });
    return () => socket.disconnect();
  }, [profile]);

  const saveProfile = () => setProfile({
    name: user.isAnonymous ? `Khách-${user.uid.slice(0, 5)}` : (user.displayName || "Người dùng"),
    avatar: user.photoURL || `https://api.dicebear.com/9.x/thumbs/svg?seed=${user.uid}`,
    isGuest: user.isAnonymous, gender, location: location || "Không rõ"
  });

  const find = () => { setStatus("waiting"); socket.emit("join_queue", { profile, wantGender }); };
  const next = () => { setPartner(null); setMsgs([]); setStatus("waiting"); socket.emit("next"); };
  const stop = () => { socket.emit("leave_queue"); setStatus("idle"); setPartner(null); };
  const send = () => { if (!text.trim()) return; setMsgs(m => [...m, { text, me: true }]); socket.emit("send_message", { text }); setText(""); };

  if (!user) return (
    <div className="card">
      <h1>💬 StrangerChat</h1><p>Chat ẩn danh với người lạ khắp nơi</p>
      <button className="primary" onClick={loginGoogle}>Đăng nhập bằng Google</button>
      <button onClick={loginGuest}>Vào với tư cách Khách</button>
      <small>Khách: không cần mật khẩu, tên sẽ là Khách-xxxxx</small>
    </div>
  );

  if (!profile) return (
    <div className="card">
      <h2>Hồ sơ của bạn</h2>
      <img className="avatar" src={user.photoURL || `https://api.dicebear.com/9.x/thumbs/svg?seed=${user.uid}`} alt="" />
      <label>Giới tính của bạn
        <select value={gender} onChange={e => setGender(e.target.value)}>
          <option value="male">Nam</option><option value="female">Nữ</option><option value="other">Khác</option>
        </select></label>
      <label>Vị trí (tự đoán theo mạng, sửa được)
        <input value={location} onChange={e => setLocation(e.target.value)} placeholder="VD: Hà Nội, Vietnam" /></label>
      <button className="primary" onClick={saveProfile}>Tiếp tục</button>
      <button onClick={logout}>Đăng xuất</button>
    </div>
  );

  return (
    <div className="card wide">
      <header>
        <div><b>{profile.name}</b> · {GENDER[profile.gender]} · 📍 {profile.location} {profile.isGuest && "(Khách)"}</div>
        <button onClick={logout}>Đăng xuất</button>
      </header>

      {status !== "chatting" ? (
        <div className="find">
          <label>Muốn gặp: <select value={wantGender} onChange={e => setWantGender(e.target.value)}>
            <option value="all">Tất cả</option><option value="male">Nam</option><option value="female">Nữ</option><option value="other">Khác</option>
          </select></label>
          {status === "waiting" ? <><p>⏳ Đang tìm người lạ...</p><button onClick={stop}>Huỷ</button></>
            : <button className="primary big" onClick={find}>🔍 Tìm người lạ</button>}
        </div>
      ) : (
        <>
          <div className="partner">Đang chat với: <b>{partner.name}</b> · {GENDER[partner.gender]} · 📍 {partner.location} {partner.isGuest && "(Khách)"}
            <img className="avatar sm" src={partner.avatar} alt="" /></div>
          <div className="msgs">
            {msgs.map((m, i) => <div key={i} className={m.me ? "msg me" : "msg"}>{m.text}</div>)}
            {typing && <div className="msg">Đang gõ...</div>}<div ref={bottomRef} />
          </div>
          <div className="row">
            <input value={text} onChange={e => { setText(e.target.value); socket.emit("typing", { isTyping: true }); }}
              onKeyDown={e => e.key === "Enter" && send()} placeholder="Nhập tin nhắn..." />
            <button className="primary" onClick={send}>Gửi</button>
          </div>
          <div className="row"><button onClick={next}>⏭ Người tiếp theo</button><button onClick={stop}>Kết thúc</button></div>
        </>
      )}
      <small>⚠️ Không chia sẻ SĐT, địa chỉ nhà, mật khẩu. Gặp người xấu hãy bấm Người tiếp theo.</small>
    </div>
  );
}
