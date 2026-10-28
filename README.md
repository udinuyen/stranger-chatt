# StrangerChat - Web chat với người lạ

Tính năng: Đăng nhập Google / Khách (Firebase) • Chọn giới tính của mình • Tự đoán vị trí theo IP (sửa được) • Lọc muốn gặp Nam/Nữ/Tất cả • Ghép cặp ngẫu nhiên realtime (Socket.IO) • Hiển thị tên, avatar, giới tính, vị trí của người lạ • Typing indicator • Nút Người tiếp theo / Kết thúc.

## Kiến trúc
```
Frontend React (Vercel) --Socket.IO--> Backend Node.js (Render)
        |
   Firebase Auth (Google + Anonymous/Khách)
```

## BƯỚC 1 - Firebase (5 phút, bắt buộc cho Login)
1. Vào https://console.firebase.google.com > Add project > đặt tên > Create.
2. Authentication > Get started > Sign-in method > bật **Google** và bật **Anonymous**.
3. Project settings (bánh răng) > Your apps > icon Web `</>` > Register app > copy `apiKey, authDomain, projectId, appId`.
4. Dán vào `frontend/.env` (copy từ `.env.example`).
5. Sau khi có domain Vercel: Authentication > Settings > Authorized domains > Add domain Vercel của bạn (nếu chưa có).

## BƯỚC 2 - Chạy thử ở máy
```bash
# Terminal 1 - Backend
cd backend && npm install && npm start        # http://localhost:10000
# Terminal 2 - Frontend
cd frontend && npm install && npm run dev      # http://localhost:5173
```
Mở 2 tab ẩn danh, đăng nhập 2 tài khoản khác nhau, cùng bấm "Tìm người lạ" để test ghép cặp.

## BƯỚC 3 - Deploy Backend lên RENDER
1. Đẩy code này lên GitHub (1 repo).
2. https://render.com > New > Web Service > chọn repo.
3. Root Directory: `backend` | Build Command: `npm install` | Start Command: `npm start`
4. Environment Variables: `CLIENT_URL` = `https://ten-app-cua-ban.vercel.app` (cập nhật sau bước 4, rồi Manual Deploy lại)
5. Deploy > copy URL dạng `https://xxx.onrender.com`
> Lưu ý: gói Free của Render ngủ sau 15 phút không dùng, lần mở đầu chờ ~30-50 giây.

## BƯỚC 4 - Deploy Frontend lên VERCEL
1. https://vercel.com > Add New Project > chọn repo.
2. Root Directory: `frontend` | Framework: Vite (tự nhận)
3. Environment Variables: `VITE_BACKEND_URL` = URL Render ở bước 3 + 4 biến `VITE_FIREBASE_*`
4. Deploy > copy URL Vercel > quay lại Render sửa `CLIENT_URL` + quay lại Firebase thêm Authorized domain.

## BƯỚC 5 - Tạo APK bằng ANDROID STUDIO (2 cách)

### Cách A - WebView native (có sẵn code trong thư mục `android-webview/`, nhẹ, dễ nhất)
1. Mở Android Studio > New Project > Empty Views Activity > Name: StrangerChat, Package: `com.example.strangerchat`, Language: Java > Finish.
2. Thay `MainActivity.java`, `activity_main.xml`, `AndroidManifest.xml` bằng 3 file trong thư mục `android-webview/` của project này.
3. Trong `MainActivity.java` đổi `APP_URL` thành domain Vercel của bạn.
4. Chạy thử: bấm ▶ Run (chọn máy ảo hoặc cắm điện thoại bật USB Debugging).
5. **Xuất APK để tải/cài/share:** Menu `Build > Build App Bundle(s) / APK(s) > Build APK(s)` 
   > File APK ở: `app/build/outputs/apk/debug/app-debug.apk` - gửi file này cho người khác cài.
6. Muốn đăng Google Play: `Build > Generate Signed App Bundle` > chọn Android App Bundle (.aab) + tạo keystore.

> Hạn chế WebView: Đăng nhập Google trong WebView đôi khi bị Google chặn (lỗi disallowed_useragent). Nếu gặp, dùng Cách B, hoặc cho phép người dùng dùng chế độ Khách trong APK.

### Cách B - Capacitor (khuyên dùng nếu muốn app xịn hơn, vẫn mở bằng Android Studio)
```bash
cd frontend && npm install @capacitor/core @capacitor/cli @capacitor/android
npx cap init StrangerChat com.example.strangerchat --web-dir=dist
npm run build && npx cap add android && npx cap sync
npx cap open android   # tự mở Android Studio
```
Trong Android Studio: `Build > Build APK(s)` như Cách A bước 5.

## An toàn / mở rộng sau này
- Thêm nút Báo cáo + lưu report vào Firebase Firestore.
- Thêm lọc theo quốc gia/ngôn ngữ, chat video (WebRTC), kiểm duyệt từ ngữ (bad-words list ở backend `send_message`).
- Không thu GPS chính xác - app chỉ đoán thành phố theo IP và cho người dùng tự sửa, đúng chuẩn riêng tư.
