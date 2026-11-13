# NyxBerg

NyxBerg adalah aplikasi Next.js, PostgreSQL, S3-compatible object storage, dan CLI Go untuk menjelajahi serta berkontribusi pada repository Git milik satu owner. Dokumen [PRD.md](PRD.md) adalah spesifikasi target; **implementasi ini belum memenuhi seluruh Definition of Done 1.0-Beta**. Gunakan deployment sementara dan data uji, bukan data sensitif, sampai batasan di bawah diselesaikan dan diaudit.

## Menjalankan website

Persyaratan: Node.js 22 disarankan, npm, PostgreSQL (mis. Neon), bucket S3-compatible privat, dan SMTP untuk registrasi. Salin konfigurasi contoh dan isi nilainya:

```bash
npm ci
cp .env.example apps/web/.env.local
# Isi apps/web/.env.local dengan kredensial layanan pengujian Anda.
node --env-file=apps/web/.env.local scripts/migrate.mjs
npm run dev
```

Website berjalan di `http://localhost:3000`. Pembuatan admin tunggal dijalankan **sekali** setelah migrasi. Sediakan `NYXBERG_ADMIN_USERNAME`, `NYXBERG_ADMIN_EMAIL`, dan `NYXBERG_ADMIN_PASSWORD` (minimal 12 karakter) sebagai environment variables secara aman, lalu jalankan:

```bash
node --env-file=apps/web/.env.local scripts/bootstrap-admin.mjs
```

Bootstrap menandai email admin sebagai terverifikasi. Jangan simpan password bootstrap dalam Git atau log CI; hapus dari environment setelah dipakai. Login, buka `/admin`, dan buat repository. Repository baru berstatus private secara default dan memakai alias `mainyaww:3`.

Lihat [panduan Vercel dan Neon](docs/deployment.md) untuk environment variables, migrasi, bucket, CORS, SMTP, dan langkah pengujian. Tidak ada kredensial atau resource cloud yang dibuat otomatis.

## CLI

CLI memerlukan Go 1.23+ untuk build dan Git terpasang pada perangkat pengguna. Token dibuat di `/settings` pada website, disimpan sekali saat ditampilkan, dan dipasok lewat environment variable `NYXBERG_TOKEN`. CLI tidak menyimpan token ke konfigurasi repository. Environment variable dapat terbaca oleh proses lain pada beberapa sistem; token store OS dan device login belum tersedia.

```bash
cd cli
go test ./...
go build -buildvcs=false -o nyxberg ./cmd/nyxberg
./nyxberg
```

Di dalam repository lokal, pilih **Smart Sync / push / pull → Configure connection** dan masukkan URL aplikasi, ID repository (ada di halaman detail), serta alias branch. Set `NYXBERG_TOKEN` pada shell untuk push atau untuk membaca repo privat. Push memindahkan Git objects, bukan snapshot ZIP; server memvalidasi object ID, checksum, DAG, fast-forward, dan melakukan compare-and-swap pada branch. Push yang terputus dapat dilanjutkan dengan menjalankan push kembali selama transfer masih berlaku. Clone publik dapat dilakukan tanpa token melalui menu awal.

Untuk membuat paket platform dan menjalankan launcher npm lokal:

```bash
npm run build:cli
npm install --prefix /tmp/nyxberg-local ./npm --omit=optional
/tmp/nyxberg-local/node_modules/.bin/nyxberg --version
```

Di Windows gunakan prefix/direktori yang sesuai. Hasil `npm/platforms/` memuat binary lintas platform dan `SHA256SUMS`; launcher memverifikasi checksum sebelum menjalankan binary. Paket belum dipublikasikan dan nama npm belum diverifikasi: **`npm install -g nyxberg` dan `npx nyxberg` dari registry belum dijamin bekerja**. Jangan mempublikasikan nama tersebut sebelum memverifikasi kepemilikan dan menguji setiap platform.

## Fitur yang tersedia untuk diuji

- Katalog publik, metadata dan visibility repository, branch alias, file tree, file teks dengan Shiki, raw download, riwayat commit, perbandingan file, ZIP/TAR.GZ, serta rilis dan aset terverifikasi SHA-256.
- Registrasi/verifikasi email, login/logout melalui API, reset password, profil sederhana, token CLI dengan masa berlaku/revokasi, dan satu admin bootstrap.
- Bug/feature/docs/security report, komentar, status, notifikasi, proposal perubahan teks multi-file di Monaco dengan diff, review, revisi, dan merge yang membuat commit Git baru. Merge menolak basis yang sudah berubah.
- SourceMap grafik berbasis pemindaian statis terbatas, TimeMachine berupa riwayat dan penjelajahan commit, indikator RepoHealth sederhana, DevCard, dan RepoPassport SVG publik.
- CLI: inisialisasi/stage/commit, clone, push, pull fast-forward, Smart Sync dasar, branch lokal, dan pengulangan upload objek yang terputus.

## Batasan dan pekerjaan yang belum selesai

- Protokol Git **khusus NyxBerg CLI**, hanya Git SHA-1; bukan Smart HTTP/SSH. Setiap push mengirim seluruh objek reachable, dibatasi **256 objek**, **4 MiB per objek**, **32 MiB terkompresi**, dan **64 MiB hasil dekompresi**. Tidak ada negosiasi delta/pack, dukungan SHA-256 Git, atau pembuktian kapasitas 5 GB. Transfer berlangsung maksimum satu jam. Arsip dibatasi 32 MiB dan menolak symlink/submodule.
- Bucket/provider harus mendukung presigned PUT/GET, `x-amz-checksum-sha256`, CopyObject, dan DeleteObjects. Kompatibilitas Neon Object Storage nyata, CORS, kuota, egress, dan biaya **belum diuji** di akun Anda. Signed download berlaku 60 detik; perubahan visibility tidak mencabut URL yang sudah terbit seketika.
- Dashboard storage hanya menghitung objek Git yang diketahui database. Cron membersihkan staging transfer lama, sesi, dan token verifikasi kedaluwarsa; garbage collection untuk objek verified/orphan, release, proposal, dan arsip belum lengkap. Pantau bucket agar biaya tidak tumbuh tanpa batas.
- Login menggunakan implementasi session/scrypt sendiri, belum Better Auth. Device/PKCE dan OS keychain belum tersedia. Rate limit dasar bukan pengganti proteksi abuse, audit keamanan, atau kebijakan backup/restore. Penggunaan file privat dan laporan keamanan belum melalui audit independen.
- SourceMap belum memakai parser lengkap/cache job; import dinamis dan eksternal bisa tidak terpetakan. RepoHealth belum memakai advisory feed atau scanner dan tidak menyatakan kode aman. TimeMachine belum menyediakan restore; RepoPassport belum memiliki QR; profile/avatar, analytics, moderation, release asset resume, dan banyak detail UI/operasional dalam PRD masih parsial.
- CLI masih menu bernomor, bukan Bubble Tea penuh; pemilihan perubahan/branch dan workflow kontribusi, release, graph, dan credential store belum lengkap. Binary hasil cross-compile belum melalui smoke test pada setiap OS target.
- Belum ada uji E2E browser, audit aksesibilitas menyeluruh, fault-injection lengkap, capacity test, atau deploy sebenarnya. **Jangan menyatakan beta selesai** sebelum seluruh gate PRD terpenuhi.

## Pemeriksaan

```bash
npm test
npm run build
cd cli && go test ./...
```

Lihat [catatan cakupan](docs/coverage.md) dan [PRD.md](PRD.md) untuk status dan acceptance criteria yang tersisa.

## Pengujian lokal otomatis

Jalankan satu perintah berikut untuk membuat PostgreSQL sementara, emulator S3 dan SMTP pada `127.0.0.1`, lalu menguji alur website dan CLI. Persyaratan: Linux/macOS, Node.js 20.9+, Git, Go 1.23+, dan **server PostgreSQL lokal** yang menyediakan `initdb`, `postgres`, serta `pg_ctl`. Jalankan sebagai pengguna biasa, bukan root. PostgreSQL yang sudah berjalan tidak digunakan atau diubah.

```bash
npm ci
npm run test:local
```

Jika binary PostgreSQL tidak ada di `PATH` dan tidak ditemukan melalui `pg_config`, tentukan direktorinya:

```bash
NYXBERG_TEST_PG_BIN=/path/ke/postgresql/bin npm run test:local
```

Opsional: gunakan `NYXBERG_TEST_GO` jika binary Go tidak berada di `PATH`. Untuk instalasi PostgreSQL nonstandar, `NYXBERG_TEST_PG_SHARE` dapat menunjuk direktori file share PostgreSQL. Jalankan `npm run test:local -- --help` untuk melihat pilihan yang tersedia.

Untuk membuka hasilnya di browser setelah tes lulus dan mencoba secara manual, jalankan:

```bash
npm run test:local -- --serve
```

Terminal menampilkan URL, akun admin sementara, ID repository, dan lokasi binary CLI. Email **tidak dikirim keluar**; tautan verifikasi/reset dicetak di terminal. Tekan `Ctrl+C` untuk menghentikan layanan dan menghapus data uji. Skrip menggunakan direktori temporer terpisah, port acak, dan database uji baru; tidak memerlukan atau memakai kredensial Vercel/Neon dari `.env.local`.

Cakupan meliputi migrasi, autentikasi, push/clone/pull, merge proposal, konflik paralel, resume upload, isolasi privat, rilis dan arsip. Emulator S3 lokal tidak memvalidasi signature AWS dan tidak membuktikan kompatibilitas Neon. Untuk pemeriksaan TypeScript dan build terpisah, tetap jalankan `npm run build`.
