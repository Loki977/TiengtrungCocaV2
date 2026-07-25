# Deploy CMS Admin backend

CMS Admin sử dụng Vercel Serverless Function `/api/admin` làm backend chính.
Firebase Admin SDK và service-account credentials chỉ tồn tại trong biến môi
trường Vercel; frontend không chứa secret hoặc quyền Admin SDK.

## 1. Biến môi trường Vercel bắt buộc

Project Vercel phải có các biến đã dùng chung với HSK Placement:

```text
FIREBASE_PROJECT_ID
FIREBASE_CLIENT_EMAIL
FIREBASE_PRIVATE_KEY
SUPER_ADMIN_EMAILS=nqthanhforwork@gmail.com
```

`FIREBASE_PRIVATE_KEY` phải giữ chuỗi xuống dòng dạng `\n`. Không commit file
`.env` hoặc service-account JSON.

## 2. Kiểm tra local

```powershell
npm run test:admin
npm run build
npx firebase-tools deploy --only firestore:rules --project tiengtrungcoca --dry-run
```

Khi mở website bằng Live Server, CMS gọi backend production tại
`https://tiengtrungcoca.vercel.app/api/admin`. Vì vậy backend mới chỉ hoạt động
đầy đủ sau khi commit được Vercel deploy.

## 3. Deploy website và Admin API

```powershell
git add --all
git commit -m "Restore secure CMS admin backend"
git push origin main
```

Chờ Vercel báo `Ready`, sau đó kiểm tra:

```powershell
curl.exe -sS -i -X OPTIONS "https://tiengtrungcoca.vercel.app/api/admin" -H "Origin: http://127.0.0.1:5500" -H "Access-Control-Request-Method: POST" -H "Access-Control-Request-Headers: authorization,content-type"
curl.exe -sS -i -X POST "https://tiengtrungcoca.vercel.app/api/admin" -H "Content-Type: application/json" --data-raw "{\"action\":\"adminGetSession\",\"data\":{}}"
```

Kết quả mong đợi: OPTIONS trả `204`; POST không có token trả `401`.

## 4. Deploy Firestore Rules

Sau khi Vercel Admin API đã `Ready`:

```powershell
npx firebase-tools deploy --only firestore:rules --project tiengtrungcoca
```

## 5. Hợp nhất và dọn dữ liệu lượt truy cập

Trong CMS Admin > Thống kê, Super Admin bấm **Hợp nhất dữ liệu cũ** một lần.
Backend lấy số lớn hơn giữa `accessLogs` và `visits` để tránh cộng trùng dữ liệu
của hai logger cũ.

Bật TTL cho tài liệu chống đếm lặp:

```powershell
gcloud firestore fields ttls update expiresAt --collection-group=dedupe --enable-ttl --project=tiengtrungcoca
```

## 6. Checklist production

1. `user` không vào được CMS và không sửa được `role`, `isVip`, `vipUntil`.
2. `editor` chỉ quản lý nội dung.
3. `admin` xem Người dùng/Thống kê nhưng không cấp quyền, khóa hoặc xóa.
4. `super_admin` quản lý tài khoản khác nhưng không thao tác trên chính mình.
5. Không thể xóa, khóa hoặc hạ quyền Super Admin cuối cùng.
6. Xóa account phải nhập đúng UID; xóa Auth và `users/{uid}`, giữ audit/dữ liệu dùng chung.
7. Reload cùng trang trong 30 phút không tăng counter; khách hoặc trang khác vẫn tăng và tổng vượt 200.

Thư mục `functions/` vẫn được giữ như phương án Cloud Functions tương thích,
nhưng frontend CMS hiện không phụ thuộc vào nó nên project không cần nâng Blaze
chỉ để vận hành Admin.
