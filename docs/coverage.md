# Status terhadap PRD 1.0-Beta

Ini adalah status implementasi, bukan persetujuan rilis. Acceptance test dan DoD PRD tetap berlaku.

| Area | Status | Kesenjangan utama |
| --- | --- | --- |
| Repository, branches dan explorer | Sebagian | metadata utama, branch alias, tree, raw, README, history dan compare file tersedia; pagination, multi-branch CLI lengkap dan beberapa status/error belum lengkap. |
| Git transport | Sebagian | SHA-1 loose objects, server verification, fast-forward, CAS, retry upload, clone/pull berfungsi pada fixture lokal; pack/delta, skala 5 GB, SHA-256 Git, serta interoperabilitas native belum ada. |
| Account dan auth | Sebagian | email, sesi, reset, profil dan token tersedia; Better Auth, device flow, credential store, avatar, dan security audit belum ada. |
| Contribute | Sebagian | reports, security privacy, comments, notifications, Monaco multi-file proposal, review/revision dan commit merge dasar tersedia; attachments/labels, per-file comments, moderation, three-way merge dan banyak state belum lengkap. |
| Rilis dan arsip | Sebagian | lightweight Git tag, rilis, asset SHA-256 dan ZIP/TAR.GZ terbatas; asset multipart/resume dan beberapa format/metadata belum lengkap. |
| SourceMap, TimeMachine, RepoHealth | Sebagian | graph static terbatas, history/compare dan evidence sederhana tersedia; parser komprehensif, cache/jobs, restore, advisory feed dan security scanner belum ada. |
| DevCard dan RepoPassport | Sebagian | profil/stats publik dan SVG card tersedia; avatar, featured settings, QR, semua data release/asset serta image cache belum lengkap. |
| CLI/npm | Sebagian | menu lokal, Git sync dan cross-compile script tersedia; Bubble Tea, semua fitur TUI, keychain, update checks, publikasi dan smoke matrix belum lengkap. |
| Operasi dan keamanan | Sebagian | RBAC dasar, token hashing, cleanup staging dan audit entries dasar tersedia; GC menyeluruh, backup/restore drill, reliable quota enforcement, request limits komprehensif, observability dan security/chaos/E2E tests belum lengkap. |

Tes lokal yang telah dilakukan: migrasi PostgreSQL; push/clone/pull dua repository dan `git fsck`; proposal → approve → merge → pull; stale-base dan dua push bersamaan; resume upload yang diputus; isolasi repo/report privat; registrasi/verifikasi/reset lewat SMTP lokal; release asset checksum dan ZIP/TAR.GZ melalui emulator S3. Provider Neon/Vercel nyata dan browser visual belum diuji.
