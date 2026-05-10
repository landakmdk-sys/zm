/**
 * SIPAS Donggala — Backend API
 * Sistem Informasi Pengelolaan Sampah Kabupaten Donggala
 * Dinas Lingkungan Hidup Kab. Donggala
 */

const express = require('express');
const cors = require('cors');
const path = require('path');
const Database = require('better-sqlite3');

// ─── App & Config ──────────────────────────────────────────────────────────────
const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'sipas-admin-2025';
const DB_PATH = path.join(__dirname, 'sipas.db');

// ─── Middleware ────────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname)); // Serves index.html, admin.html, assets

// ─── Database Init ─────────────────────────────────────────────────────────────
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Create all tables if they don't exist
db.prepare(`
CREATE TABLE IF NOT EXISTS neraca_bulanan (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  bulan TEXT NOT NULL,
  tahun INTEGER NOT NULL,
  masuk REAL DEFAULT 0,
  terangkut REAL DEFAULT 0,
  UNIQUE(bulan, tahun)
)
`).run();
db.exec(`
  CREATE TABLE IF NOT EXISTS hero_stats (
    id TEXT PRIMARY KEY,
    label TEXT NOT NULL,
    value TEXT NOT NULL,
    satuan TEXT DEFAULT '',
    icon TEXT DEFAULT ''
  );

  CREATE TABLE IF NOT EXISTS neraca (
    id TEXT PRIMARY KEY,
    label TEXT NOT NULL,
    volume REAL DEFAULT 0,
    satuan TEXT DEFAULT 'ton/hari'
  );

  CREATE TABLE IF NOT EXISTS armada (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    jenis TEXT NOT NULL,
    nomor_polisi TEXT NOT NULL,
    kapasitas TEXT DEFAULT '',
    status TEXT DEFAULT 'aktif',
    keterangan TEXT DEFAULT ''
  );

  CREATE TABLE IF NOT EXISTS tpa (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS jadwal (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    kelurahan TEXT NOT NULL,
    hari TEXT NOT NULL,
    waktu TEXT DEFAULT '07:00 - 10:00',
    zona TEXT DEFAULT '',
    keterangan TEXT DEFAULT ''
  );

  CREATE TABLE IF NOT EXISTS data_sampah (
    id TEXT PRIMARY KEY,
    label TEXT NOT NULL,
    nilai REAL DEFAULT 0,
    satuan TEXT DEFAULT 'ton',
    periode TEXT DEFAULT ''
  );

  CREATE TABLE IF NOT EXISTS kelurahan (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nama TEXT NOT NULL UNIQUE,
    kecamatan TEXT DEFAULT '',
    jumlah_penduduk INTEGER DEFAULT 0,
    zona TEXT DEFAULT ''
  );

  CREATE TABLE IF NOT EXISTS edukasi (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    judul TEXT NOT NULL,
    konten TEXT NOT NULL,
    kategori TEXT DEFAULT 'umum',
    gambar_url TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now', 'localtime'))
  );

  CREATE TABLE IF NOT EXISTS kontak (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS aduan (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tiket TEXT NOT NULL UNIQUE,
    nama TEXT NOT NULL,
    telepon TEXT DEFAULT '',
    email TEXT DEFAULT '',
    kelurahan TEXT NOT NULL,
    kategori TEXT DEFAULT 'umum',
    deskripsi TEXT NOT NULL,
    foto_url TEXT DEFAULT '',
    status TEXT DEFAULT 'masuk',
    catatan_admin TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now', 'localtime')),
    updated_at TEXT DEFAULT (datetime('now', 'localtime'))
  );

  /* NEW FEATURE: Bank Sampah */
  CREATE TABLE IF NOT EXISTS bank_sampah (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nama TEXT NOT NULL,
    alamat TEXT DEFAULT '',
    kelurahan TEXT DEFAULT '',
    kontak TEXT DEFAULT '',
    jadwal TEXT DEFAULT ''
  );

  /* NEW FEATURE: Neraca Bulanan */
  CREATE TABLE IF NOT EXISTS neraca_bulanan (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    bulan TEXT NOT NULL,
    tahun INTEGER NOT NULL,
    masuk REAL DEFAULT 0,
    terangkut REAL DEFAULT 0,
    UNIQUE(bulan, tahun)
  );
`);

// Seed default data if tables are empty
const seedIfEmpty = () => {
  const heroCount = db.prepare('SELECT COUNT(*) as c FROM hero_stats').get().c;
  if (heroCount === 0) {
    db.prepare(`INSERT INTO hero_stats (id, label, value, satuan, icon) VALUES
      ('penduduk_terlayani', 'Penduduk Terlayani', '85.000', 'jiwa', '👥'),
      ('timbulan_harian', 'Timbulan Harian', '42', 'ton/hari', '♻️'),
      ('armada_aktif', 'Armada Aktif', '18', 'unit', '🚛'),
      ('kelurahan_terlayani', 'Kelurahan Terlayani', '48', 'kelurahan', '🏘️')
    `).run();
  }

  const kontakCount = db.prepare('SELECT COUNT(*) as c FROM kontak').get().c;
  if (kontakCount === 0) {
    const insertKontak = db.prepare('INSERT OR IGNORE INTO kontak (key, value) VALUES (?, ?)');
    [
      ['nama_dinas', 'Dinas Lingkungan Hidup Kabupaten Donggala'],
      ['alamat', 'Jl. Utama No. 1, Donggala, Sulawesi Tengah'],
      ['telepon', '(0457) 71234'],
      ['email', 'dlh@donggalakab.go.id'],
      ['wa_upt', '6281234567890'],
      ['jam_kerja', 'Senin - Jumat: 08.00 - 16.00 WITA']
    ].forEach(([k, v]) => insertKontak.run(k, v));
  }

  const tpaCount = db.prepare('SELECT COUNT(*) as c FROM tpa').get().c;
  if (tpaCount === 0) {
    const insertTPA = db.prepare('INSERT OR IGNORE INTO tpa (key, value) VALUES (?, ?)');
    [
      ['nama', 'TPA Wuasa'],
      ['alamat', 'Kec. Banawa, Donggala'],
      ['luas', '5 Ha'],
      ['kapasitas', '60 ton/hari'],
      ['metode', 'Controlled Landfill'],
      ['koordinat', '-0.6721, 119.7407']
    ].forEach(([k, v]) => insertTPA.run(k, v));
  }
};

seedIfEmpty();

// ─── Auth Middleware ───────────────────────────────────────────────────────────
const requireAdmin = (req, res, next) => {
  const token = req.headers['x-admin-token'];
  if (!token || token !== ADMIN_TOKEN) {
    return res.status(401).json({ error: 'Unauthorized: Token admin tidak valid' });
  }
  next();
};

// ─── Helper ────────────────────────────────────────────────────────────────────
const genTiket = () => {
  const ts = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).substring(2, 5).toUpperCase();
  return `ADU-${ts}-${rand}`;
};

// ─── Root Route ───────────────────────────────────────────────────────────────
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'admin.html'));
});

// ═══════════════════════════════════════════════════════════════════════════════
// PUBLIC ENDPOINTS
// ═══════════════════════════════════════════════════════════════════════════════

// NEW FEATURE: GET /api/public/neraca-bulanan — data neraca bulanan untuk publik
app.get('/api/public/neraca-bulanan', (req, res) => {
  try {
    const data = db.prepare('SELECT * FROM neraca_bulanan ORDER BY tahun ASC, CASE bulan WHEN "Jan" THEN 1 WHEN "Feb" THEN 2 WHEN "Mar" THEN 3 WHEN "Apr" THEN 4 WHEN "Mei" THEN 5 WHEN "Jun" THEN 6 WHEN "Jul" THEN 7 WHEN "Agu" THEN 8 WHEN "Sep" THEN 9 WHEN "Okt" THEN 10 WHEN "Nov" THEN 11 WHEN "Des" THEN 12 ELSE 99 END ASC').all();
    res.json(data);
  } catch (err) {
  if (err.message.includes('UNIQUE')) {
    return res.status(400).json({
      error: 'Data bulan dan tahun sudah ada'
    });
  }

  res.status(500).json({ error: err.message });
}
});

// NEW FEATURE: GET /api/public/bank-sampah — daftar bank sampah untuk publik
app.get('/api/public/bank-sampah', (req, res) => {
  try {
    const data = db.prepare('SELECT * FROM bank_sampah ORDER BY nama').all();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/public/all — semua data untuk frontend publik
app.get('/api/public/all', (req, res) => {
  try {
    const heroStats = db.prepare('SELECT * FROM hero_stats').all();
    const neraca = db.prepare('SELECT * FROM neraca').all();
    const armada = db.prepare("SELECT * FROM armada WHERE status = 'aktif' ORDER BY jenis").all();
    const tpa = db.prepare('SELECT * FROM tpa').all();
    const jadwal = db.prepare('SELECT * FROM jadwal ORDER BY kelurahan, hari').all();
    const dataSampah = db.prepare('SELECT * FROM data_sampah').all();
    const kelurahan = db.prepare('SELECT * FROM kelurahan ORDER BY nama').all();
    const edukasi = db.prepare('SELECT * FROM edukasi ORDER BY created_at DESC LIMIT 20').all();
    const kontak = db.prepare('SELECT * FROM kontak').all();

    // Convert array to object for kontak and tpa
    const kontakObj = {};
    kontak.forEach(k => { kontakObj[k.key] = k.value; });
    const tpaObj = {};
    tpa.forEach(t => { tpaObj[t.key] = t.value; });

    res.json({
      heroStats,
      neraca,
      armada,
      tpa: tpaObj,
      jadwal,
      dataSampah,
      kelurahan,
      edukasi,
      kontak: kontakObj
    });
  } catch (err) {
    console.error('Error /api/public/all:', err.message);
    res.status(500).json({ error: 'Gagal memuat data publik' });
  }
});

// POST /api/aduan — submit aduan baru
app.post('/api/aduan', (req, res) => {
  try {
    const { nama, telepon, email, kelurahan, kategori, deskripsi, foto_url } = req.body;
    if (!nama || !kelurahan || !deskripsi) {
      return res.status(400).json({ error: 'Nama, kelurahan, dan deskripsi wajib diisi' });
    }
    const tiket = genTiket();
    db.prepare(`
      INSERT INTO aduan (tiket, nama, telepon, email, kelurahan, kategori, deskripsi, foto_url)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(tiket, nama, telepon || '', email || '', kelurahan, kategori || 'umum', deskripsi, foto_url || '');

    res.status(201).json({ success: true, tiket, message: 'Aduan berhasil dikirim' });
  } catch (err) {
    console.error('Error POST /api/aduan:', err.message);
    res.status(500).json({ error: 'Gagal menyimpan aduan' });
  }
});

// GET /api/aduan/:tiket — cek status aduan
app.get('/api/aduan/:tiket', (req, res) => {
  try {
    const aduan = db.prepare('SELECT * FROM aduan WHERE tiket = ?').get(req.params.tiket);
    if (!aduan) return res.status(404).json({ error: 'Nomor tiket tidak ditemukan' });
    // Remove sensitive fields from public response
    const { id, ...safe } = aduan;
    res.json(safe);
  } catch (err) {
    res.status(500).json({ error: 'Gagal memuat data aduan' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// ADMIN ENDPOINTS (protected by x-admin-token)
// ═══════════════════════════════════════════════════════════════════════════════

// POST /api/admin/login — verify token
app.post('/api/admin/login', requireAdmin, (req, res) => {
  res.json({ success: true, message: 'Token valid' });
});

// GET /api/admin/dashboard-stats — statistik ringkasan
app.get('/api/admin/dashboard-stats', requireAdmin, (req, res) => {
  try {
    const totalAduan = db.prepare('SELECT COUNT(*) as c FROM aduan').get().c;
    const aduanMasuk = db.prepare("SELECT COUNT(*) as c FROM aduan WHERE status = 'masuk'").get().c;
    const aduanProses = db.prepare("SELECT COUNT(*) as c FROM aduan WHERE status = 'proses'").get().c;
    const aduanSelesai = db.prepare("SELECT COUNT(*) as c FROM aduan WHERE status = 'selesai'").get().c;
    const totalArmada = db.prepare('SELECT COUNT(*) as c FROM armada').get().c;
    const armadaAktif = db.prepare("SELECT COUNT(*) as c FROM armada WHERE status = 'aktif'").get().c;
    const totalKelurahan = db.prepare('SELECT COUNT(*) as c FROM kelurahan').get().c;
    const totalEdukasi = db.prepare('SELECT COUNT(*) as c FROM edukasi').get().c;

    res.json({
      aduan: { total: totalAduan, masuk: aduanMasuk, proses: aduanProses, selesai: aduanSelesai },
      armada: { total: totalArmada, aktif: armadaAktif },
      kelurahan: totalKelurahan,
      edukasi: totalEdukasi
    });
  } catch (err) {
    res.status(500).json({ error: 'Gagal memuat statistik' });
  }
});

// ── Hero Stats ─────────────────────────────────────────────────────────────────
app.get('/api/admin/hero-stats', requireAdmin, (req, res) => {
  res.json(db.prepare('SELECT * FROM hero_stats').all());
});

app.get('/api/admin/hero-stats/:id', requireAdmin, (req, res) => {
  const row = db.prepare('SELECT * FROM hero_stats WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Data tidak ditemukan' });
  res.json(row);
});

app.put('/api/admin/hero-stats/:id', requireAdmin, (req, res) => {
  try {
    const { label, value, satuan, icon } = req.body;
    const info = db.prepare(`
      UPDATE hero_stats SET label=?, value=?, satuan=?, icon=? WHERE id=?
    `).run(label, value, satuan || '', icon || '', req.params.id);
    if (info.changes === 0) return res.status(404).json({ error: 'Data tidak ditemukan' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Neraca ─────────────────────────────────────────────────────────────────────
app.get('/api/admin/neraca', requireAdmin, (req, res) => {
  res.json(db.prepare('SELECT * FROM neraca').all());
});

app.put('/api/admin/neraca/:id', requireAdmin, (req, res) => {
  try {
    const { label, volume, satuan } = req.body;
    const info = db.prepare('UPDATE neraca SET label=?, volume=?, satuan=? WHERE id=?')
      .run(label, volume, satuan || 'ton/hari', req.params.id);
    if (info.changes === 0) return res.status(404).json({ error: 'Data tidak ditemukan' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Armada ─────────────────────────────────────────────────────────────────────
app.get('/api/admin/armada', requireAdmin, (req, res) => {
  res.json(db.prepare('SELECT * FROM armada ORDER BY jenis, nomor_polisi').all());
});

app.get('/api/admin/armada/:id', requireAdmin, (req, res) => {
  const row = db.prepare('SELECT * FROM armada WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Data tidak ditemukan' });
  res.json(row);
});

app.post('/api/admin/armada', requireAdmin, (req, res) => {
  try {
    const { jenis, nomor_polisi, kapasitas, status, keterangan } = req.body;
    if (!jenis || !nomor_polisi) return res.status(400).json({ error: 'Jenis dan nomor polisi wajib diisi' });
    const info = db.prepare(`
      INSERT INTO armada (jenis, nomor_polisi, kapasitas, status, keterangan)
      VALUES (?, ?, ?, ?, ?)
    `).run(jenis, nomor_polisi, kapasitas || '', status || 'aktif', keterangan || '');
    res.status(201).json({ success: true, id: info.lastInsertRowid });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/admin/armada/:id', requireAdmin, (req, res) => {
  try {
    const { jenis, nomor_polisi, kapasitas, status, keterangan } = req.body;
    const info = db.prepare(`
      UPDATE armada SET jenis=?, nomor_polisi=?, kapasitas=?, status=?, keterangan=? WHERE id=?
    `).run(jenis, nomor_polisi, kapasitas || '', status || 'aktif', keterangan || '', req.params.id);
    if (info.changes === 0) return res.status(404).json({ error: 'Data tidak ditemukan' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/admin/armada/:id', requireAdmin, (req, res) => {
  const info = db.prepare('DELETE FROM armada WHERE id = ?').run(req.params.id);
  if (info.changes === 0) return res.status(404).json({ error: 'Data tidak ditemukan' });
  res.json({ success: true });
});

// ── TPA ────────────────────────────────────────────────────────────────────────
app.get('/api/admin/tpa', requireAdmin, (req, res) => {
  const rows = db.prepare('SELECT * FROM tpa').all();
  const obj = {};
  rows.forEach(r => { obj[r.key] = r.value; });
  res.json(obj);
});

app.put('/api/admin/tpa/:key', requireAdmin, (req, res) => {
  try {
    const { value } = req.body;
    db.prepare('INSERT OR REPLACE INTO tpa (key, value) VALUES (?, ?)').run(req.params.key, value);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Jadwal ─────────────────────────────────────────────────────────────────────
app.get('/api/admin/jadwal', requireAdmin, (req, res) => {
  res.json(db.prepare('SELECT * FROM jadwal ORDER BY kelurahan, hari').all());
});

app.get('/api/admin/jadwal/:id', requireAdmin, (req, res) => {
  const row = db.prepare('SELECT * FROM jadwal WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Data tidak ditemukan' });
  res.json(row);
});

app.post('/api/admin/jadwal', requireAdmin, (req, res) => {
  try {
    const { kelurahan, hari, waktu, zona, keterangan } = req.body;

if (!kelurahan || !hari)
  return res.status(400).json({
    error: 'Kelurahan dan hari wajib diisi'
  });

const hariText = Array.isArray(hari)
  ? hari.join(', ')
  : hari;

const info = db.prepare(`
  INSERT INTO jadwal
  (kelurahan, hari, waktu, zona, keterangan)
  VALUES (?, ?, ?, ?, ?)
`).run(
  kelurahan,
  hariText,
  waktu || '07:00 - 10:00',
  zona || '',
  keterangan || ''
);

res.status(201).json({
  success: true,
  id: info.lastInsertRowid
});
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/admin/jadwal/:id', requireAdmin, (req, res) => {
  try {
   const { kelurahan, hari, waktu, zona, keterangan } = req.body;

const hariText = Array.isArray(hari)
  ? hari.join(', ')
  : hari;

const info = db.prepare(`
  UPDATE jadwal
  SET kelurahan=?, hari=?, waktu=?, zona=?, keterangan=?
  WHERE id=?
`).run(
  kelurahan,
  hariText,
  waktu || '07:00 - 10:00',
  zona || '',
  keterangan || '',
  req.params.id
);

if (info.changes === 0)
  return res.status(404).json({
    error: 'Data tidak ditemukan'
  });

res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/admin/jadwal/:id', requireAdmin, (req, res) => {
  const info = db.prepare('DELETE FROM jadwal WHERE id = ?').run(req.params.id);
  if (info.changes === 0) return res.status(404).json({ error: 'Data tidak ditemukan' });
  res.json({ success: true });
});

// ── Data Sampah ────────────────────────────────────────────────────────────────
app.get('/api/admin/data-sampah', requireAdmin, (req, res) => {
  res.json(db.prepare('SELECT * FROM data_sampah').all());
});

app.put('/api/admin/data-sampah/:id', requireAdmin, (req, res) => {
  try {
    const { label, nilai, satuan, periode } = req.body;
    const info = db.prepare(`
      UPDATE data_sampah SET label=?, nilai=?, satuan=?, periode=? WHERE id=?
    `).run(label, nilai, satuan || 'ton', periode || '', req.params.id);
    if (info.changes === 0) {
      db.prepare('INSERT INTO data_sampah (id, label, nilai, satuan, periode) VALUES (?, ?, ?, ?, ?)')
        .run(req.params.id, label, nilai, satuan || 'ton', periode || '');
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Kelurahan ──────────────────────────────────────────────────────────────────
app.get('/api/admin/kelurahan', requireAdmin, (req, res) => {
  res.json(db.prepare('SELECT * FROM kelurahan ORDER BY nama').all());
});

app.post('/api/admin/kelurahan', requireAdmin, (req, res) => {
  try {
    const { nama, kecamatan, jumlah_penduduk, zona } = req.body;
    if (!nama) return res.status(400).json({ error: 'Nama kelurahan wajib diisi' });
    const info = db.prepare(`
      INSERT INTO kelurahan (nama, kecamatan, jumlah_penduduk, zona) VALUES (?, ?, ?, ?)
    `).run(nama, kecamatan || '', jumlah_penduduk || 0, zona || '');
    res.status(201).json({ success: true, id: info.lastInsertRowid });
  } catch (err) {
    if (err.message.includes('UNIQUE')) return res.status(400).json({ error: 'Kelurahan sudah ada' });
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/admin/kelurahan/:id', requireAdmin, (req, res) => {
  try {
    const { nama, kecamatan, jumlah_penduduk, zona } = req.body;
    const info = db.prepare(`
      UPDATE kelurahan SET nama=?, kecamatan=?, jumlah_penduduk=?, zona=? WHERE id=?
    `).run(nama, kecamatan || '', jumlah_penduduk || 0, zona || '', req.params.id);
    if (info.changes === 0) return res.status(404).json({ error: 'Data tidak ditemukan' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/admin/kelurahan/:id', requireAdmin, (req, res) => {
  const info = db.prepare('DELETE FROM kelurahan WHERE id = ?').run(req.params.id);
  if (info.changes === 0) return res.status(404).json({ error: 'Data tidak ditemukan' });
  res.json({ success: true });
});

// ── Edukasi ────────────────────────────────────────────────────────────────────
app.get('/api/admin/edukasi', requireAdmin, (req, res) => {
  res.json(db.prepare('SELECT * FROM edukasi ORDER BY created_at DESC').all());
});

app.post('/api/admin/edukasi', requireAdmin, (req, res) => {
  try {
    const { judul, konten, kategori, gambar_url } = req.body;
    if (!judul || !konten) return res.status(400).json({ error: 'Judul dan konten wajib diisi' });
    const info = db.prepare(`
      INSERT INTO edukasi (judul, konten, kategori, gambar_url) VALUES (?, ?, ?, ?)
    `).run(judul, konten, kategori || 'umum', gambar_url || '');
    res.status(201).json({ success: true, id: info.lastInsertRowid });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/admin/edukasi/:id', requireAdmin, (req, res) => {
  try {
    const { judul, konten, kategori, gambar_url } = req.body;
    const info = db.prepare(`
      UPDATE edukasi SET judul=?, konten=?, kategori=?, gambar_url=? WHERE id=?
    `).run(judul, konten, kategori || 'umum', gambar_url || '', req.params.id);
    if (info.changes === 0) return res.status(404).json({ error: 'Data tidak ditemukan' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/admin/edukasi/:id', requireAdmin, (req, res) => {
  const info = db.prepare('DELETE FROM edukasi WHERE id = ?').run(req.params.id);
  if (info.changes === 0) return res.status(404).json({ error: 'Data tidak ditemukan' });
  res.json({ success: true });
});

// ── Kontak ─────────────────────────────────────────────────────────────────────
app.get('/api/admin/kontak', requireAdmin, (req, res) => {
  const rows = db.prepare('SELECT * FROM kontak').all();
  const obj = {};
  rows.forEach(r => { obj[r.key] = r.value; });
  res.json(obj);
});

app.put('/api/admin/kontak/:key', requireAdmin, (req, res) => {
  try {
    const { value } = req.body;
    db.prepare('INSERT OR REPLACE INTO kontak (key, value) VALUES (?, ?)').run(req.params.key, value);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Aduan (Admin) ──────────────────────────────────────────────────────────────
app.get('/api/admin/aduan', requireAdmin, (req, res) => {
  const { status, page = 1, limit = 20 } = req.query;
  let query = 'SELECT * FROM aduan';
  const params = [];
  if (status) {
    query += ' WHERE status = ?';
    params.push(status);
  }
  query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
  params.push(parseInt(limit), (parseInt(page) - 1) * parseInt(limit));
  res.json(db.prepare(query).all(...params));
});

app.get('/api/admin/aduan/:id', requireAdmin, (req, res) => {
  const row = db.prepare('SELECT * FROM aduan WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Data tidak ditemukan' });
  res.json(row);
});

app.put('/api/admin/aduan/:id', requireAdmin, (req, res) => {
  try {
    const { status, catatan_admin } = req.body;
    const info = db.prepare(`
      UPDATE aduan SET status=?, catatan_admin=?, updated_at=datetime('now','localtime') WHERE id=?
    `).run(status, catatan_admin || '', req.params.id);
    if (info.changes === 0) return res.status(404).json({ error: 'Data tidak ditemukan' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/admin/aduan/:id', requireAdmin, (req, res) => {
  const info = db.prepare('DELETE FROM aduan WHERE id = ?').run(req.params.id);
  if (info.changes === 0) return res.status(404).json({ error: 'Data tidak ditemukan' });
  res.json({ success: true });
});

// ── NEW FEATURE: Bank Sampah ────────────────────────────────────────────────────
app.get('/api/admin/bank-sampah', requireAdmin, (req, res) => {
  res.json(db.prepare('SELECT * FROM bank_sampah ORDER BY nama').all());
});

app.post('/api/admin/bank-sampah', requireAdmin, (req, res) => {
  try {
    const { nama, alamat, kelurahan, kontak, jadwal } = req.body;
    if (!nama) return res.status(400).json({ error: 'Nama bank sampah wajib diisi' });
    const info = db.prepare(`
      INSERT INTO bank_sampah (nama, alamat, kelurahan, kontak, jadwal) VALUES (?, ?, ?, ?, ?)
    `).run(nama, alamat || '', kelurahan || '', kontak || '', jadwal || '');
    res.status(201).json({ success: true, id: info.lastInsertRowid });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/admin/bank-sampah/:id', requireAdmin, (req, res) => {
  try {
    const { nama, alamat, kelurahan, kontak, jadwal } = req.body;
    const info = db.prepare(`
      UPDATE bank_sampah SET nama=?, alamat=?, kelurahan=?, kontak=?, jadwal=? WHERE id=?
    `).run(nama, alamat || '', kelurahan || '', kontak || '', jadwal || '', req.params.id);
    if (info.changes === 0) return res.status(404).json({ error: 'Data tidak ditemukan' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/admin/bank-sampah/:id', requireAdmin, (req, res) => {
  const info = db.prepare('DELETE FROM bank_sampah WHERE id = ?').run(req.params.id);
  if (info.changes === 0) return res.status(404).json({ error: 'Data tidak ditemukan' });
  res.json({ success: true });
});

// ──// ═══════════════════════════════════════════════
// NEW FEATURE: Neraca Bulanan
// ═══════════════════════════════════════════════

// GET ALL
app.get('/api/admin/neraca-bulanan', requireAdmin, (req, res) => {
  try {
    const data = db.prepare(`
      SELECT * FROM neraca_bulanan
      ORDER BY tahun ASC,
      CASE bulan
        WHEN "Jan" THEN 1 WHEN "Feb" THEN 2 WHEN "Mar" THEN 3
        WHEN "Apr" THEN 4 WHEN "Mei" THEN 5 WHEN "Jun" THEN 6
        WHEN "Jul" THEN 7 WHEN "Agu" THEN 8 WHEN "Sep" THEN 9
        WHEN "Okt" THEN 10 WHEN "Nov" THEN 11 WHEN "Des" THEN 12
        ELSE 99
      END ASC
    `).all();

    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// CREATE
app.post('/api/admin/neraca-bulanan', requireAdmin, (req, res) => {
  try {
    const { bulan, tahun, masuk, terangkut } = req.body;

    if (!bulan || !tahun)
      return res.status(400).json({ error: 'Bulan dan tahun wajib diisi' });

    const info = db.prepare(`
      INSERT INTO neraca_bulanan (bulan, tahun, masuk, terangkut)
      VALUES (?, ?, ?, ?)
    `).run(bulan, tahun, masuk || 0, terangkut || 0);

    res.status(201).json({ success: true, id: info.lastInsertRowid });
  } catch (err) {
    if (err.message.includes('UNIQUE')) {
      return res.status(400).json({ error: 'Data bulan dan tahun tersebut sudah ada' });
    }
    res.status(500).json({ error: err.message });
  }
});

// UPDATE
app.put('/api/admin/neraca-bulanan/:id', requireAdmin, (req, res) => {
  try {
    const { bulan, tahun, masuk, terangkut } = req.body;

    const info = db.prepare(`
      UPDATE neraca_bulanan
      SET bulan=?, tahun=?, masuk=?, terangkut=?
      WHERE id=?
    `).run(bulan, tahun, masuk || 0, terangkut || 0, req.params.id);

    if (info.changes === 0)
      return res.status(404).json({ error: 'Data tidak ditemukan' });

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE
app.delete('/api/admin/neraca-bulanan/:id', requireAdmin, (req, res) => {
  const info = db.prepare(`
    DELETE FROM neraca_bulanan WHERE id = ?
  `).run(req.params.id);

  if (info.changes === 0)
    return res.status(404).json({ error: 'Data tidak ditemukan' });

  res.json({ success: true });
});
// ─── 404 Fallback ──────────────────────────────────────────────────────────────
app.use((req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'Endpoint tidak ditemukan' });
  }
  res.sendFile(path.join(__dirname, 'index.html'));
});

// ─── Error Handler ─────────────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err.message);
  res.status(500).json({ error: 'Internal server error' });
});

// ─── Start Server ──────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`✅ SIPAS Donggala berjalan di port ${PORT}`);
  console.log(`📂 Database: ${DB_PATH}`);
  console.log(`🔐 Admin token: ${ADMIN_TOKEN === 'sipas-admin-2025' ? '(default — ubah via env ADMIN_TOKEN)' : '(custom)'}`);
});
