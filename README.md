# Kasir & Keuangan

Aplikasi web kecil untuk mencatat order, memantau antrian (centang selesai), dan mencatat pemasukan serta pengeluaran usaha. Data disimpan di Google Sheet.

- **Frontend:** `index.html`, `style.css`, `script.js` (di-host di GitHub Pages)
- **Backend:** `apps-script/Code.gs` (Google Apps Script sebagai API JSON, menulis ke Google Sheet)

```
kasir-keuangan/
├── index.html
├── style.css
├── script.js
├── README.md
└── apps-script/
    ├── Code.gs        <- backend API
    └── Migrasi.gs     <- opsional, pindahkan data lama dari Google Form
```

## 1. Pasang backend (Apps Script)

1. Buka Google Sheet yang sudah terisi, lalu **Extensions > Apps Script**.
2. Paste isi `apps-script/Code.gs` ke file `Code.gs`.
3. Jalankan fungsi **`setup`** sekali dan izinkan akses. Ini membuat tab `Menu`, `Orders`, dan `Transaksi`.
4. Buka tab `Menu` di Sheet dan ganti harga contoh sesuai harga sebenarnya.
5. (Opsional) Ubah angka di fungsi `aturPin`, lalu jalankan untuk mengunci API dengan PIN.
6. **Deploy > New deployment > Web app**, isi:
   - Execute as: **Me**
   - Who has access: **Anyone**
7. Salin URL web app (berakhiran `/exec`).

Setiap kali `Code.gs` diubah, buat versi baru: **Deploy > Manage deployments > Edit > New version > Deploy**.

## 2. Pasang frontend (GitHub Pages)

1. Buka `script.js`, tempel URL web app ke `API_URL` di bagian atas file.
2. Buat repo GitHub, lalu upload `index.html`, `style.css`, dan `script.js` ke root repo.
3. Buka **Settings > Pages**, pilih **Deploy from a branch**, branch `main`, folder `/ (root)`, lalu **Save**.
4. Tunggu 1-2 menit. Alamat aplikasi: `https://USERNAME.github.io/NAMA-REPO/`.
5. Buka di HP, lalu **Add to Home Screen**.

## Catatan

- Repo GitHub bersifat publik, jadi **jangan menaruh PIN di dalam kode**. PIN diketik di layar aplikasi dan hanya dicek oleh Apps Script.
- Daftar kategori ada di bagian atas `Code.gs` (`KAT_MASUK`, `KAT_KELUAR`). Ubah sesuai kebutuhan lalu deploy versi baru.
- Nilai order yang selesai tidak otomatis masuk ke pemasukan. Pemasukan dicatat di tab Keuangan.
- Data lama dari Google Form bisa dipindah dengan `apps-script/Migrasi.gs` (jalankan `migrasiDariForm`).
