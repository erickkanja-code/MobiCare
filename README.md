# 🏥 MobiCare — Community Health Worker PWA

Offline-first Progressive Web App for Community Health Workers in Rwanda to track patients and visits.

---

## ✨ Features

- **Offline-First**: All patient data, visits, and forms work without internet using IndexedDB
- **Auth**: Email/password login (Firebase Auth), remember-me 7-day sessions, password reset
- **Patient Management**: Add/edit/search patients, auto-generated patient IDs (CHW_ID-P####)
- **Visit Scheduling**: Schedule with type (Routine/Follow-up/Emergency), prevent past dates
- **Visit Logging**: Complete visits with required notes (10–500 chars), vital signs, up to 3 photos
- **Dashboard**: Today's visits, overdue count, weekly completions, color-coded status
- **Sync**: IndexedDB sync queue, auto-syncs on reconnect, conflict resolution (last-write-wins)
- **PWA**: Installable, service worker caching, works on mobile Chrome offline

---

## 🛠 Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, React Router, IndexedDB (native), Service Worker |
| Backend | Node.js, Express.js |
| Database | PostgreSQL 14+ |
| Auth & Storage | Firebase Authentication, Firebase Storage |
| Deployment | Railway (backend), Vercel/Netlify (frontend) |

---

## 🚀 Quick Start

### Prerequisites
- Node.js 18+
- PostgreSQL 14+
- Firebase project (Auth + Storage enabled)

### 1. Firebase Setup
1. Create a Firebase project at https://console.firebase.google.com
2. Enable **Authentication → Email/Password**
3. Enable **Storage**
4. Generate a **Service Account** key (Project Settings → Service Accounts)
5. Copy your Firebase config (Project Settings → General)

### 2. Backend Setup

```bash
cd backend
npm install

# Create .env file:
cat > .env << EOF
DATABASE_URL=postgresql://user:pass@localhost:5432/mobicare
FIREBASE_SERVICE_ACCOUNT={"type":"service_account",...}   # paste JSON as single line
FIREBASE_STORAGE_BUCKET=your-project.appspot.com
FRONTEND_URL=http://localhost:3000
PORT=3001
EOF

npm start
```

### 3. Frontend Setup

```bash
cd ..  # root directory
npm install

# Create .env file:
cat > .env << EOF
REACT_APP_FIREBASE_API_KEY=your_api_key
REACT_APP_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
REACT_APP_FIREBASE_PROJECT_ID=your-project-id
REACT_APP_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
REACT_APP_FIREBASE_MESSAGING_SENDER_ID=123456789
REACT_APP_FIREBASE_APP_ID=1:123:web:abc
REACT_APP_API_URL=http://localhost:3001
EOF

npm start
```

### 4. Test Offline (Demo Mode)

The app includes a **demo mode** with mock authentication — no Firebase needed to test locally:
- Email: `alice@mobicare.rw`
- Password: `password123`

---

## 🔌 Connecting Firebase Auth

Replace the mock auth in `src/App.jsx` with real Firebase:

```javascript
import { initializeApp } from "firebase/app";
import { getAuth, signInWithEmailAndPassword, sendPasswordResetEmail } from "firebase/auth";

const firebaseConfig = {
  apiKey: process.env.REACT_APP_FIREBASE_API_KEY,
  // ... other config
};
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

// In handleLogin:
const credential = await signInWithEmailAndPassword(auth, email, password);
const token = await credential.user.getIdToken();
// Store token and use as: Authorization: Bearer <token>
```

---

## 🏗 Database Schema

```sql
CREATE TABLE patients (
  id TEXT PRIMARY KEY,
  chw_id TEXT NOT NULL,
  patient_id TEXT UNIQUE,       -- e.g. CHW001-P0001
  name TEXT NOT NULL,
  age INTEGER,
  phone TEXT,
  location TEXT NOT NULL,       -- "Sector, Cell"
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
);

CREATE TABLE visits (
  id TEXT PRIMARY KEY,
  patient_id TEXT REFERENCES patients(id),
  chw_id TEXT NOT NULL,
  visit_type TEXT NOT NULL,     -- Routine Checkup | Follow-up Visit | Emergency
  scheduled_date TIMESTAMPTZ,
  completed_date TIMESTAMPTZ,
  status TEXT,                  -- scheduled | completed | cancelled
  notes TEXT,
  photo_urls TEXT[],
  vital_signs JSONB,            -- {temperature, systolic, diastolic}
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
);
```

---

## 📡 API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/patients` | List CHW's patients |
| POST | `/api/patients` | Create/upsert patient |
| PUT | `/api/patients/:id` | Update patient |
| DELETE | `/api/patients/:id` | Delete patient |
| GET | `/api/visits` | List CHW's visits |
| POST | `/api/visits` | Create/upsert visit |
| PUT | `/api/visits/:id` | Update visit |
| GET | `/api/dashboard/stats` | Dashboard statistics |
| POST | `/api/photos` | Upload photo to Firebase Storage |

All endpoints require `Authorization: Bearer <firebase_token>` header.

---

## 📱 Offline Architecture

```
User Action → Update IndexedDB → Add to sync_queue → UI updates immediately

On reconnect:
  sync_queue FIFO → POST/PUT to API → Remove from queue on success
  Failed: retry with exponential backoff (3 attempts: 1s, 2s, 4s)
  If all retries fail: mark as permanently failed, alert user
```

### IndexedDB Tables
- `patients` — Local patient records
- `visits` — Local visit records  
- `sync_queue` — Pending changes: `{action, data, timestamp, retries}`

---

## 🚢 Deployment

### Backend → Railway
1. Connect GitHub repo to Railway
2. Set environment variables (DATABASE_URL, FIREBASE_SERVICE_ACCOUNT, etc.)
3. Railway auto-deploys on push

### Frontend → Vercel
```bash
npm run build
vercel --prod
```

---

## ✅ Validation Rules

| Field | Rule |
|-------|------|
| Patient name | Required, 2–100 chars |
| Location | Required, "Sector, Cell" format |
| Phone | Optional, +250 7XX XXX XXX |
| Visit notes | Required (on completion), 10–500 chars |
| Temperature | 30–45°C |
| BP Systolic | 60–250 mmHg |
| BP Diastolic | 40–150 mmHg |
| Photos | Max 3, compress to <2MB, JPEG |

---

## 🧪 Testing Offline

1. Open Chrome DevTools → Network → set to "Offline"
2. Add/edit patients and schedule visits
3. All changes saved locally
4. Turn offline off → auto-sync triggers
5. Check sync indicator in header (✓ green = synced, ↻ yellow = syncing, ⚠ red = offline)

---

## 📁 Project Structure

```
MobiCare/
├── public/
│   ├── index.html          # PWA shell
│   ├── manifest.json       # PWA manifest
│   └── sw.js               # Service worker
├── src/
│   └── App.jsx             # Full React application (single-file)
├── backend/
│   ├── server.js           # Express API
│   └── package.json
├── package.json
└── README.md
```
