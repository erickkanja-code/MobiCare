const express = require("express");
const cors = require("cors");
const { Pool } = require("pg");
const admin = require("firebase-admin");
const multer = require("multer");

const app = express();
app.use(cors({ origin: process.env.FRONTEND_URL || "*" }));
app.use(express.json({ limit: "10mb" }));

// ── PostgreSQL ─────────────────────────────────────────────
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

// ── Firebase Admin ─────────────────────────────────────────
admin.initializeApp({
  credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT || "{}")),
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
});
const bucket = admin.storage().bucket();

// ── Auth Middleware ────────────────────────────────────────
async function authMiddleware(req, res, next) {
  const token = req.headers.authorization?.replace("Bearer ", "");
  if (!token) return res.status(401).json({ error: "Unauthorized" });
  try {
    const decoded = await admin.auth().verifyIdToken(token);
    req.uid = decoded.uid;
    req.chwId = decoded.chwId || decoded.uid;
    next();
  } catch {
    res.status(401).json({ error: "Invalid token" });
  }
}

// ── DB Init ────────────────────────────────────────────────
async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS patients (
      id TEXT PRIMARY KEY,
      chw_id TEXT NOT NULL,
      patient_id TEXT UNIQUE,
      name TEXT NOT NULL,
      age INTEGER,
      phone TEXT,
      location TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS visits (
      id TEXT PRIMARY KEY,
      patient_id TEXT REFERENCES patients(id) ON DELETE CASCADE,
      chw_id TEXT NOT NULL,
      visit_type TEXT NOT NULL,
      scheduled_date TIMESTAMPTZ,
      completed_date TIMESTAMPTZ,
      status TEXT DEFAULT 'scheduled',
      notes TEXT DEFAULT '',
      photo_urls TEXT[] DEFAULT '{}',
      vital_signs JSONB DEFAULT '{}',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_patients_chw ON patients(chw_id);
    CREATE INDEX IF NOT EXISTS idx_visits_chw ON visits(chw_id);
    CREATE INDEX IF NOT EXISTS idx_visits_patient ON visits(patient_id);
    CREATE INDEX IF NOT EXISTS idx_visits_date ON visits(scheduled_date);
  `);
  console.log("✅ Database initialized");
}

// ── PATIENTS ───────────────────────────────────────────────
app.get("/api/patients", authMiddleware, async (req, res) => {
  try {
    const { rows } = await pool.query(
      "SELECT * FROM patients WHERE chw_id = $1 ORDER BY name",
      [req.uid]
    );
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/api/patients", authMiddleware, async (req, res) => {
  const { id, patient_id, name, age, phone, location, created_at, updated_at } = req.body;
  try {
    const { rows } = await pool.query(
      `INSERT INTO patients (id, chw_id, patient_id, name, age, phone, location, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT (id) DO UPDATE SET name=$4, age=$5, phone=$6, location=$7, updated_at=$9
       RETURNING *`,
      [id, req.uid, patient_id, name, age, phone || "", location, created_at, updated_at]
    );
    res.json(rows[0]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.put("/api/patients/:id", authMiddleware, async (req, res) => {
  const { name, age, phone, location, updated_at } = req.body;
  try {
    const { rows } = await pool.query(
      `UPDATE patients SET name=$1, age=$2, phone=$3, location=$4, updated_at=$5
       WHERE id=$6 AND chw_id=$7 RETURNING *`,
      [name, age, phone || "", location, updated_at, req.params.id, req.uid]
    );
    if (!rows.length) return res.status(404).json({ error: "Not found" });
    res.json(rows[0]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete("/api/patients/:id", authMiddleware, async (req, res) => {
  try {
    await pool.query("DELETE FROM patients WHERE id=$1 AND chw_id=$2", [req.params.id, req.uid]);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── VISITS ────────────────────────────────────────────────
app.get("/api/visits", authMiddleware, async (req, res) => {
  try {
    const { rows } = await pool.query(
      "SELECT * FROM visits WHERE chw_id = $1 ORDER BY scheduled_date DESC",
      [req.uid]
    );
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/api/visits", authMiddleware, async (req, res) => {
  const { id, patient_id, visit_type, scheduled_date, completed_date, status, notes, photo_urls, vital_signs, created_at, updated_at } = req.body;
  try {
    const { rows } = await pool.query(
      `INSERT INTO visits (id, patient_id, chw_id, visit_type, scheduled_date, completed_date, status, notes, photo_urls, vital_signs, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       ON CONFLICT (id) DO UPDATE SET status=$7, notes=$8, photo_urls=$9, vital_signs=$10, completed_date=$6, updated_at=$12
       RETURNING *`,
      [id, patient_id, req.uid, visit_type, scheduled_date, completed_date || null, status, notes || "", photo_urls || [], JSON.stringify(vital_signs || {}), created_at, updated_at]
    );
    res.json(rows[0]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.put("/api/visits/:id", authMiddleware, async (req, res) => {
  const { status, notes, completed_date, vital_signs, photo_urls, updated_at } = req.body;
  try {
    const { rows } = await pool.query(
      `UPDATE visits SET status=$1, notes=$2, completed_date=$3, vital_signs=$4, photo_urls=$5, updated_at=$6
       WHERE id=$7 AND chw_id=$8 RETURNING *`,
      [status, notes, completed_date || null, JSON.stringify(vital_signs || {}), photo_urls || [], updated_at, req.params.id, req.uid]
    );
    if (!rows.length) return res.status(404).json({ error: "Not found" });
    res.json(rows[0]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── DASHBOARD STATS ───────────────────────────────────────
app.get("/api/dashboard/stats", authMiddleware, async (req, res) => {
  try {
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).toISOString();
    const weekAgo = new Date(now - 7 * 86400000).toISOString();

    const [today, overdue, weekCompleted] = await Promise.all([
      pool.query("SELECT COUNT(*) FROM visits WHERE chw_id=$1 AND scheduled_date>=$2 AND scheduled_date<$3 AND status='scheduled'", [req.uid, startOfDay, endOfDay]),
      pool.query("SELECT COUNT(*) FROM visits WHERE chw_id=$1 AND scheduled_date<$2 AND status='scheduled'", [req.uid, startOfDay]),
      pool.query("SELECT COUNT(*) FROM visits WHERE chw_id=$1 AND completed_date>=$2 AND status='completed'", [req.uid, weekAgo]),
    ]);

    res.json({
      todayVisits: parseInt(today.rows[0].count),
      overdueVisits: parseInt(overdue.rows[0].count),
      weekCompleted: parseInt(weekCompleted.rows[0].count),
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── PHOTO UPLOAD ──────────────────────────────────────────
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024 } });

app.post("/api/photos", authMiddleware, upload.single("photo"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file" });
  const filename = `visits/${req.uid}/${Date.now()}_${req.file.originalname}`;
  const file = bucket.file(filename);
  await file.save(req.file.buffer, { metadata: { contentType: req.file.mimetype } });
  await file.makePublic();
  const url = `https://storage.googleapis.com/${bucket.name}/${filename}`;
  res.json({ url });
});

// ── START ─────────────────────────────────────────────────
const PORT = process.env.PORT || 3001;
initDB().then(() => {
  app.listen(PORT, () => console.log(`🚀 MobiCare API running on port ${PORT}`));
});
