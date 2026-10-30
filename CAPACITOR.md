# StrangerChat — Capacitor (Giai đoạn 2: Android + iPhone)

Frontend giờ đã gắn Capacitor 6:
- appId: `com.example.strangerchat` (giữ nguyên như bản APK cũ)
- appName: StrangerChat
- Cấu hình `frontend/capacitor.config.json`: app mở thẳng web
  `https://stranger-chatt.vercel.app` → sửa web là app tự cập nhật,
  đăng nhập Firebase chạy y như trình duyệt.

Project native đã sinh sẵn:
- Android: `frontend/android/` (mở bằng Android Studio được ngay)
- iOS: `frontend/ios/` (project Xcode, build trên macOS)

## Cách lấy bản build KHÔNG cần máy mạnh — GitHub Actions

Repo có 2 workflow trong `.github/workflows/`:

1. **Android Build (APK)**: tab Actions trên GitHub → chọn workflow →
   Run workflow → chạy xong tải artifact `strangerchat-apk-debug`
   (chính là file app-debug.apk, cài trực tiếp lên điện thoại Android).
   Workflow cũng tự chạy mỗi khi code ở `frontend/` thay đổi.
2. **iOS Build**: tương tự, chạy trên máy Mac ảo của GitHub → artifact
   `strangerchat-ios-simulator`. Bản này để chứng minh iOS build thành công
   (chưa ký nên chưa cài lên iPhone thật được).

## Build trên máy nhà bằng Android Studio (cách truyền thống)

```bash
cd frontend
npm install
npm run build
npx cap sync android
npx cap open android   # mở Android Studio, Build > Build APK(s)
```

## Giai đoạn 3 — lên kho (chưa làm)

- CH Play: cần file .aab (Generate Signed App Bundle trong Android Studio)
  + tài khoản Google Play Developer 25$.
- App Store: tài khoản Apple Developer 99$/năm + ký bản build iOS.
  Khi lên kho, cân nhắc bỏ `server.url` trong capacitor.config.json để app
  chạy bản web đóng gói trong máy (tránh Apple soi "app chỉ là vỏ web")
  và xử lý thêm đăng nhập Google dạng native.
