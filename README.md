# 👶 API Ema Baby Spa

Backend REST API untuk sistem manajemen reservasi dan operasional **Ema Baby Spa**.  
Aplikasi ini dibangun menggunakan **Node.js**, **Express**, dan **Prisma ORM** dengan database **PostgreSQL**.

Sistem ini menangani autentikasi pengguna (**Pelanggan, Staff, Owner**), manajemen jadwal, reservasi layanan, pembayaran (**Tripay**), dan notifikasi real-time.

---

## 🚀 Fitur Utama

- **Multi-Role Authentication**: Sistem login aman untuk Owner, Customer, dan Staff menggunakan JWT.
- **Manajemen Layanan (Service)**: CRUD layanan dengan fitur **Price Tiers** berdasarkan kategori umur bayi.
- **Sistem Reservasi Cerdas**: Booking slot waktu dan sesi berdasarkan ketersediaan staff dan jadwal operasional.
- **Pembayaran Terintegrasi**: Integrasi dengan Tripay untuk pembayaran otomatis (QRIS, VA, E-Wallet) dan dukungan pembayaran manual.
- **Manajemen Jadwal & Staff**: Mengatur jam operasional, hari libur, dan shift staff.
- **Real-time Notifications**: Notifikasi menggunakan Socket.io dan OneSignal.
- **Email Notifications**: Pengiriman OTP, konfirmasi reservasi, dan reset password via Email (Nodemailer).
- **Rating & Review**: Sistem penilaian layanan oleh pelanggan.
- **Media Storage**: Upload gambar (profil, bukti bayar) menggunakan Cloudinary.

---

## 🛠️ Tech Stack

- **Runtime**: Node.js  
- **Framework**: Express.js  
- **Database**: PostgreSQL  
- **ORM**: Prisma  
- **Real-time**: Socket.io  
- **Payment Gateway**: Tripay  
- **Cloud Storage**: Cloudinary  
- **Push Notifications**: OneSignal  
- **Task Scheduling**: Node-cron  

---

## 📂 Struktur Folder

```txt
src/
├── config/         # Konfigurasi DB, Scheduler, OneSignal, dll
├── controller/     # Logika bisnis (Customer, Reservation, Payment, dll)
├── middlewares/    # Auth check, Upload handling, Error handling
├── repository/     # Layer akses database (Prisma queries)
├── routes/         # Definisi endpoint API
├── services/       # External services (Notification logic)
├── templates/      # Template Email (HTML)
├── utils/          # Helper functions (Email, Tripay, Cloudinary)
└── app.js          # Entry point aplikasi
```

---

## ⚙️ Persiapan & Instalasi

### Prasyarat
- Node.js (v18+)
- PostgreSQL

### Langkah Instalasi

```bash
git clone https://github.com/username/repo-anda.git
cd spa-api
npm install
```

Buat file `.env`:

```env
PORT=5000
FRONTEND_URL=http://localhost:5173
DATABASE_URL="postgresql://user:password@localhost:5432/dbname?schema=public"
JWT_SECRET=rahasia_anda_disini
```

Migrasi database:

```bash
npx prisma migrate dev --name init
```

Jalankan server:

```bash
npm run dev
```

---

## 📡 Endpoint API

Base URL: `http://localhost:5000/api`

| Prefix         | Deskripsi                |
| -------------- | ------------------------ |
| /customer      | Auth & profile pelanggan |
| /owner         | Dashboard owner          |
| /staff         | Manajemen staff          |
| /service       | Layanan spa              |
| /reservations  | Reservasi                |
| /payments      | Pembayaran               |
| /notifications | Notifikasi               |
| /analytics     | Statistik                |

---

## 🤝 Kontribusi

Pull Request sangat diterima ❤️
