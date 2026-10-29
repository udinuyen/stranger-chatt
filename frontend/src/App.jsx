import { useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import { onAuthStateChanged } from "firebase/auth";
import { auth, loginGoogle, loginGuest, logout } from "./firebase";

const BACKEND = import.meta.env.VITE_BACKEND_URL || "http://localhost:10000";
const GENDER = { male: "♂ Nam", female: "♀ Nữ", other: "⚧ Khác" };
const REGION = { bac: "Miền Bắc", trung: "Miền Trung", nam: "Miền Nam", "nuoc-ngoai": "Nước ngoài" };
const THIS_YEAR = new Date().getFullYear();
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
  const [status, setStatus] = useState("idle"); // idle | waiting | chatting
  const [partner, setPartner] = useState(null);
  const [msgs, setMsgs] = useState([]);
  const [text, setText] = useState("");
  const [typing, setTyping] = useState(false);
  const [showStickers, setShowStickers] = useState(false);
  const [lightbox, setLightbox] = useState(null);
  const bottomRef = useRef(null);
  const fileRef = useRef(null);

  useEffect(() => onAuthStateChanged(auth, setUser), []);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs]);
  useEffect(() => {
    fetch("https://ipapi.co/json/").then(r => r.json())
      .then(d => setLocation([d.city, d.country_name].filter(Boolean).join(", "))).catch(() => {});
  }, []);

  useEffect(() => {
    if (!profile) return;
    socket = io(BACKEND, { transports: ["websocket"] });
    socket.on("matched", ({ partner }) => { setPartner(partner); setStatus("chatting"); setMsgs([]); });
    socket.on("receive_message", ({ text, from }) => setMsgs(m => [...m, { kind: "text", text, me: false, from }]));
    socket.on("receive_image", ({ data, from }) => setMsgs(m => [...m, { kind: "image", data, me: false, from }]));
    socket.on("receive_sticker", ({ sticker, from }) => setMsgs(m => [...m, { kind: "sticker", sticker, me: false, from }]));
    socket.on("partner_typing", ({ isTyping }) => setTyping(isTyping));
    socket.on("partner_left", () => { setStatus("idle"); setPartner(null); alert("Người lạ đã rời đi. Bấm Tìm để gặp người mới."); });
    socket.on("report_ok", () => alert("Đã ghi nhận báo cáo. Người này sẽ không được ghép lại với bạn."));
    socket.on("error_msg", (code) => {
      if (code === "underage") { alert("StrangerChat chỉ dành cho người từ 18 tuổi trở lên."); setProfile(null); setStatus("idle"); }
      if (code === "image_too_big") alert("Ảnh quá lớn, gửi không thành công. Chọn ảnh nhỏ hơn nhé.");
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

  const find = () => { setStatus("waiting"); socket.emit("join_queue", { profile, wantGender, wantRegion }); };
  const next = () => { setPartner(null); setMsgs([]); setStatus("waiting"); socket.emit("next"); };
  const stop = () => { socket.emit("leave_queue"); setStatus("idle"); setPartner(null); };
  const report = () => { if (confirm("Báo cáo người này? Cuộc trò chuyện sẽ kết thúc và bạn không bị ghép lại với họ.")) { socket.emit("report_partner"); stop(); } };
  const send = () => { if (!text.trim()) return; setMsgs(m => [...m, { kind: "text", text, me: true }]); socket.emit("send_message", { text }); setText(""); };
  const sendSticker = (s) => { setMsgs(m => [...m, { kind: "sticker", sticker: s, me: true }]); socket.emit("send_sticker", { sticker: s }); setShowStickers(false); };

  // Nen anh tren canvas: vua de nhe, vua tu dong xoa metadata (ke ca toa do GPS trong anh)
  const onPickImage = (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !file.type.startsWith("image/")) return;
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      let scale = Math.min(1, 1024 / Math.max(img.width, img.height));
      const render = (sc, q) => {
        const c = document.createElement("canvas");
        c.width = Math.round(img.width * sc); c.height = Math.round(img.height * sc);
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
        return c.toDataURL("image/jpeg", q);
      };
      let data = render(scale, 0.82);
      if (data.length > 2_200_000) data = render(scale * 0.7, 0.7);
      if (data.length > 2_300_000) return alert("Ảnh này quá lớn kể cả sau khi nén. Chọn ảnh khác nhé.");
      setMsgs(m => [...m, { kind: "image", data, me: true }]);
      socket.emit("send_image", { data });
    };
    img.onerror = () => { URL.revokeObjectURL(url); alert("Không đọc được file ảnh này."); };
    img.src = url;
  };

  // ---------- LANDING PAGE (chua dang nhap) ----------
  if (!user) return (
    <div className="landing">
      <div className="card">
        <h1>💬 StrangerChat</h1>
        <p className="hero">Một người lạ đang chờ nói chuyện với bạn</p>
        <p>Trò chuyện ẩn danh với người thật đang online: tâm sự, chém gió hay chỉ để bớt buồn. Tin nhắn không lưu trên máy chủ — rời đi là xoá dấu vết.</p>
        <button className="primary big" onClick={loginGoogle}>Đăng nhập bằng Google</button>
        <button className="big" onClick={loginGuest}>Vào nhanh với tư cách Khách</button>
        <small>Chỉ dành cho người từ 18 tuổi trở lên.</small>
      </div>
      <div className="card">
        <h3>Cách hoạt động</h3>
        <ol className="steps">
          <li>Đăng nhập Google hoặc vào Khách, chọn biệt danh, giới tính, năm sinh và khu vực.</li>
          <li>Bấm “Tìm người lạ” — hệ thống ghép bạn với một người đang online, không ghép lại người cũ.</li>
          <li>Trò chuyện thoải mái. Muốn dừng thì Kết thúc, gặp người xấu thì Báo cáo (2 chạm).</li>
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

  // ---------- TIM NGUOI + CHAT ----------
  return (
    <div className="card wide">
      <header>
        <div><b>{profile.name}</b> · {GENDER[profile.gender]} · {THIS_YEAR - profile.birthYear} tuổi · {REGION[profile.region]}{profile.location && ` · 📍 ${profile.location}`} {profile.isGuest && "(Khách)"}</div>
        <button onClick={logout}>Đăng xuất</button>
      </header>

      {status !== "chatting" ? (
        <div className="find">
          <label>Muốn gặp giới tính: <select value={wantGender} onChange={e => setWantGender(e.target.value)}>
            <option value="all">Tất cả</option><option value="male">Nam</option><option value="female">Nữ</option><option value="other">Khác</option>
          </select></label>
          <label>Ưu tiên khu vực: <select value={wantRegion} onChange={e => setWantRegion(e.target.value)}>
            <option value="all">Tất cả</option>
            {Object.entries(REGION).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select></label>
          {status === "waiting" ? <><p>⏳ Đang tìm người lạ...</p><button onClick={stop}>Huỷ</button></>
            : <button className="primary big" onClick={find}>🔍 Tìm người lạ</button>}
        </div>
      ) : (
        <>
          <div className="partner">Đang chat với: <b>{partner.name}</b> · {GENDER[partner.gender]}{partner.age && ` · ${partner.age} tuổi`} · {REGION[partner.region] || ""}{partner.location && ` · 📍 ${partner.location}`} {partner.isGuest && "(Khách)"}
            <img className="avatar sm" src={partner.avatar} alt="" /></div>
          <div className="msgs">
            {msgs.map((m, i) => m.kind === "image"
              ? <div key={i} className={m.me ? "msg me imgmsg" : "msg imgmsg"}><img src={m.data} alt="Ảnh" onClick={() => setLightbox(m.data)} /></div>
              : m.kind === "sticker"
                ? <div key={i} className={m.me ? "msg me sticker" : "msg sticker"}>{m.sticker}</div>
                : <div key={i} className={m.me ? "msg me" : "msg"}>{m.text}</div>)}
            {typing && <div className="msg">Đang gõ...</div>}<div ref={bottomRef} />
          </div>
          {showStickers && <div className="stickers">{STICKERS.map(s => <button key={s} onClick={() => sendSticker(s)}>{s}</button>)}</div>}
          <div className="row">
            <button title="Gửi ảnh" onClick={() => fileRef.current?.click()}>📷</button>
            <button title="Sticker" onClick={() => setShowStickers(v => !v)}>😀</button>
            <input value={text} onChange={e => { setText(e.target.value); socket.emit("typing", { isTyping: true }); }}
              onKeyDown={e => e.key === "Enter" && send()} placeholder="Nhập tin nhắn..." />
            <button className="primary" onClick={send}>Gửi</button>
            <input ref={fileRef} type="file" accept="image/*" hidden onChange={onPickImage} />
          </div>
          {lightbox && <div className="lightbox" onClick={() => setLightbox(null)}><img src={lightbox} alt="Ảnh phóng to" /></div>}
          <div className="row"><button onClick={next}>⏭ Người tiếp theo</button><button onClick={report}>🚩 Báo cáo</button><button onClick={stop}>Kết thúc</button></div>
        </>
      )}
      <small>⚠️ Không chia sẻ SĐT, địa chỉ nhà, mật khẩu. Tin nhắn không được lưu trên máy chủ.</small>
    </div>
  );
}
