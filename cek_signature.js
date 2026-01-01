// Simpan file ini sebagai: cek_signature.js
import crypto from "crypto";

console.log("=== THE TRUTH TEST ===");

// 1. DATA DARI LOG ERROR ANDA (JANGAN DIUBAH, INI FAKTA DARI LOG)
// String ini diambil dari log: "Data String: BABYSPA-...PAID"
const dataString =
  "BABYSPA-0d3a8ad7-56d2-45f6-ae6f-8000d47e45b8DEV-T39012325140DIKMXPAID";

// 2. SIGNATURE YANG DIKIRIM TRIPAY (JANGAN DIUBAH)
// Ini diambil dari header: X-Callback-Signature
const signatureDariTripay =
  "e9778cf05025fc9b2e4089e9e5ab394eb1c219bd3c916d67f82fad8e2e0d56ad";

// 3. PRIVATE KEY ANDA
// TUGAS ANDA: Copy Paste Private Key dari Dashboard Tripay Sandbox ke sini.
// Pastikan tidak ada spasi di awal/akhir.
const privateKeyDashboard = "WNAjh-n7sxa-Re9ix-D9u50-i40kK";

// HITUNG MANUAL
const hitunganSaya = crypto
  .createHmac("sha256", privateKeyDashboard.trim())
  .update(dataString)
  .digest("hex");

console.log("Data String       :", dataString);
console.log("\n1. Tripay Mengirim :", signatureDariTripay);
console.log("2. Hasil Hitungan  :", hitunganSaya);

console.log("\nKESIMPULAN:");
if (signatureDariTripay === hitunganSaya) {
  console.log("✅ MATCH! Key Dashboard BENAR.");
  console.log(
    "MASALAHNYA ADA DI VERCEL: Server Vercel belum memuat Key terbaru."
  );
  console.log(
    "SOLUSI: Masuk Vercel > Deployments > Redeploy (atau push commit kosong)."
  );
} else {
  console.log("❌ TIDAK COCOK! Key yang Anda masukkan SALAH.");
  console.log(
    "Artinya Key yang Anda pegang SEKARANG berbeda dengan Key yang dipakai Tripay saat mengirim request ini."
  );
  console.log(
    "SOLUSI: Cek apakah Anda salah Sandbox/Prod, atau Key baru saja di-regenerate."
  );
}
