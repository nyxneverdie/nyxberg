# Uji deploy Vercel + Neon

Gunakan proyek dan bucket uji terlebih dahulu. Ini adalah panduan konfigurasi, bukan klaim bahwa seluruh DoD beta telah lulus.

1. Buat database PostgreSQL/Neon baru. Ambil pooled connection string dan simpan sebagai `DATABASE_URL`; aktifkan TLS sesuai connection string provider.
2. Buat bucket **privat** S3-compatible. Siapkan endpoint, region, bucket, access key dan secret dengan hak minimum. Bucket harus mendukung presigned PUT/GET, SHA-256 checksum header, CopyObject, dan DeleteObjects. Verifikasi langsung pada provider, terutama bila memakai Neon Object Storage.
3. Konfigurasikan CORS bucket dengan origin website yang tepat; contoh ada di [infra/s3-cors.example.json](../infra/s3-cors.example.json). Izinkan `PUT` dan `x-amz-checksum-sha256`. Jangan gunakan public-read pada bucket.
4. Siapkan SMTP transaksi dan alamat pengirim. Registration dan password reset membutuhkan SMTP; akun admin bootstrap tidak memerlukan email keluar untuk login awal.
5. Jalankan `npm ci`, isi `apps/web/.env.local` sesuai `.env.example`, lalu `node --env-file=apps/web/.env.local scripts/migrate.mjs`. Migrasi aman dijalankan ulang; jalankan terhadap database baru atau database NyxBerg yang sudah menggunakan skema ini.
6. Sediakan `NYXBERG_ADMIN_USERNAME`, `NYXBERG_ADMIN_EMAIL`, `NYXBERG_ADMIN_PASSWORD` sebagai environment variables lokal secara aman. Jalankan `node --env-file=apps/web/.env.local scripts/bootstrap-admin.mjs` sekali, lalu hapus variabel bootstrap. Jangan set password bootstrap sebagai environment variable Vercel.
7. Impor repository ke Vercel, pilih Next.js, set **Root Directory `apps/web`**, dan aktifkan akses source di luar Root Directory bila diperlukan oleh pengaturan monorepo. Pakai Node.js 22. Perintah build workspace adalah `npm run build`; script `prebuild` menyalin Monaco dari dependency lokal. Pastikan `package-lock.json` dan direktori `scripts/` ikut di-upload.
8. Tambahkan `DATABASE_URL`, `APP_URL`, `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `SMTP_URL`, `MAIL_FROM`, `RATE_LIMIT_SALT`, dan `CRON_SECRET` di environment Vercel. Untuk production, set `APP_URL=https://nyxberg.vercel.app`. `APP_URL` harus sama persis dengan origin HTTPS yang dipakai browser, tanpa slash/path; siapkan origin terpisah untuk preview jika diperlukan. Gunakan nilai acak panjang untuk salt dan cron secret.
9. Deploy dan login sebagai admin. Buat repo, salin repository ID, buat token CLI di `/settings`, lalu jalankan clone/push/pull menggunakan CLI lokal. Registrasi akun kedua, verifikasi email, usulkan perubahan dan merge. Uji private repo dan security report dari sesi lain tanpa login.

`apps/web/vercel.json` menjadwalkan cleanup harian; `CRON_SECRET` dibutuhkan dan cron ini hanya menghapus staging yang telah melewati grace period serta metadata auth yang kedaluwarsa. Ia belum menghapus semua orphan storage. Monitor actual storage, egress dan kuota di dashboard provider; angka dashboard aplikasi bukan total tagihan. Atur backup database dan bucket sebelum menggunakan data penting.

Batas proof-of-concept, kompatibilitas S3, URL signed yang masih berlaku hingga 60 detik setelah perubahan akses, dan area yang belum diaudit ada di [README](../README.md) dan [coverage](coverage.md).
