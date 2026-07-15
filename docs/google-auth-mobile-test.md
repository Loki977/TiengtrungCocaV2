# Google Auth mobile: cấu hình và ma trận kiểm thử

## Cấu hình bắt buộc trước khi kiểm thử production

### Firebase Console

Vào **Authentication → Settings → Authorized domains** và bảo đảm có đúng các hostname đang dùng:

- `tiengtrungcoca.firebaseapp.com`
- `tiengtrungcoca.vercel.app`
- `localhost` (chỉ cho phát triển local)
- `127.0.0.1` (chỉ khi kiểm thử local bằng hostname này)

Vào **Authentication → Sign-in method → Google** và xác nhận Google vẫn được bật. Không đổi Firebase project hoặc Web App config.

### Google Cloud Console

Trong OAuth 2.0 Client ID mà Firebase Google provider đang dùng, thêm Authorized redirect URI:

- `https://tiengtrungcoca.vercel.app/__/auth/handler`

Không thêm wildcard, query string hoặc dấu `/` khác. Nếu production dùng domain riêng khác, phải thêm URI `https://<domain-rieng>/__/auth/handler` và cập nhật danh sách proxy host trong `assets/js/firebase-auth.js` trước khi dùng domain đó.

### Vercel

Deploy phiên bản có `vercel.json` mới. Rewrite `/__/auth/:path*` phải proxy trong suốt tới Firebase Hosting, không được trả 302/307.

Sau deploy, kiểm tra:

- `https://tiengtrungcoca.vercel.app/__/auth/iframe` trả HTTP 200.
- URL hiển thị trong trình duyệt vẫn thuộc `tiengtrungcoca.vercel.app`.
- `https://tiengtrungcoca.vercel.app/profile.html?authDebug=1` hiển thị `same-origin` production flow qua trạng thái debug, không hiển thị token.

## Ma trận kiểm thử

Ghi ngày, trình duyệt/phiên bản và kết quả cho từng mục. Không dùng chung tài khoản thử giữa hai người.

1. **Windows Chrome desktop**
   - Popup mở, không redirect toàn trang.
   - Chọn tài khoản; UI hiện “Đang tải dữ liệu tài khoản”.
   - Chỉ mở Profile sau khi hàm hoàn tất user chạy xong.
   - Profile tải đúng XP, xu, streak và bài đã hoàn thành; refresh vẫn đăng nhập.

2. **Windows Edge desktop**
   - Lặp lại toàn bộ mục Chrome.
   - Đóng popup chủ động phải hiện thông báo, không tự fallback redirect.

3. **Android Chrome**
   - Nút Google redirect toàn trang, không mở popup.
   - Chọn tài khoản và quay lại đúng origin production.
   - Không quay về màn hình login; Profile tải đúng dữ liệu; refresh vẫn đăng nhập.

4. **Android Cốc Cốc**
   - Lặp lại Android Chrome.
   - Ghi nhận rõ nếu browser chặn storage hoặc đang chạy trong webview.

5. **iPhone Safari**
   - Dùng redirect; quay lại website; Firebase user tồn tại.
   - Profile có dữ liệu, refresh vẫn đăng nhập và không có vòng lặp redirect.

6. **Mobile private/incognito**
   - Nếu storage/persistence bị hạn chế, form phải hiện lỗi tiếng Việt rõ ràng.
   - Không được báo thành công giả hoặc lặp redirect.

7. **Mạng chậm**
   - UI hiện “Đang tải dữ liệu tài khoản”.
   - Không hiển thị signed-out hoặc xóa `cc_user` khi còn đang kiểm tra redirect.

8. **Firestore tạm thời lỗi**
   - Firebase Auth user vẫn giữ nguyên.
   - UI báo không tải được dữ liệu và có thể dùng cache đúng UID.
   - Không tự logout.

9. **Logout**
   - Chờ `signOut()` xong mới xóa cache user/pending OAuth.
   - Counters logged-out về 0; refresh vẫn signed-out.

10. **Đăng nhập lại**
    - XP, xu, streak, `completedLessons` và tiến trình cũ không bị reset.
    - Không tạo bộ dữ liệu thứ hai và không trộn dữ liệu UID khác.

## Dấu hiệu kỹ thuật cần quan sát

- Desktop: `flow: popup`.
- Mobile: `flow: redirect`; pending state tồn tại tối đa 10 phút rồi được xóa.
- Sau callback: chỉ một lần tải `users/{uid}` và `users/{uid}/private/stats` về mặt logic hoàn tất.
- `cc-auth-state-changed` phát khi Auth đổi; `cc-user-data-ready` chỉ phát sau khi Firestore tải xong; `cc-auth-error` phát khi có lỗi.
- Với `?authDebug=1`, kiểm tra `authStatus`, `redirectPending`, `redirectResult` và UID; không chụp/chia sẻ token hoặc credential.
