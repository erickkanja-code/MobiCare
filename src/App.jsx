import { useState, useEffect, useCallback, useRef } from "react";

const DB_NAME = "MobiCareDB";
const DB_VERSION = 1;

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains("patients")) {
        const ps = db.createObjectStore("patients", { keyPath: "id" });
        ps.createIndex("chw_id", "chw_id");
        ps.createIndex("name", "name");
      }
      if (!db.objectStoreNames.contains("visits")) {
        const vs = db.createObjectStore("visits", { keyPath: "id" });
        vs.createIndex("patient_id", "patient_id");
        vs.createIndex("chw_id", "chw_id");
        vs.createIndex("scheduled_date", "scheduled_date");
      }
      if (!db.objectStoreNames.contains("sync_queue")) {
        db.createObjectStore("sync_queue", { keyPath: "id", autoIncrement: true });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function dbGetAll(storeName) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readonly");
    const req = tx.objectStore(storeName).getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function dbPut(storeName, record) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite");
    const req = tx.objectStore(storeName).put(record);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function dbGet(storeName, key) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readonly");
    const req = tx.objectStore(storeName).get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function genId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
}

function genPatientId(chwId, count) {
  const seq = String(count + 1).padStart(4, "0");
  return chwId + "-P" + seq;
}

function formatDate(iso) {
  if (!iso) return "-";
  const d = new Date(iso);
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function formatTime(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

function isToday(iso) {
  if (!iso) return false;
  return new Date(iso).toDateString() === new Date().toDateString();
}

function isOverdue(iso, status) {
  if (!iso || status === "completed" || status === "cancelled") return false;
  return new Date(iso) < new Date() && !isToday(iso);
}

function daysOverdue(iso) {
  return Math.floor((new Date() - new Date(iso)) / 86400000);
}

const MOCK_USERS = [
  { uid: "chw001", email: "alice@mobicare.rw", password: "password123", name: "Alice Uwimana", chwId: "CHW001" },
  { uid: "chw002", email: "bob@mobicare.rw", password: "password123", name: "Bob Nkurunziza", chwId: "CHW002" },
];

function mockSignIn(email, password) {
  const user = MOCK_USERS.find(u => u.email === email && u.password === password);
  if (!user) throw new Error("Invalid email or password");
  return user;
}

async function seedData(chwId) {
  const existing = await dbGetAll("patients");
  if (existing.length > 0) return;
  const patients = [
    { id: genId(), chw_id: chwId, patient_id: chwId + "-P0001", name: "Marie Mutesi", age: 34, phone: "+250 781 234 567", location: "Kimironko, Bibare", created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
    { id: genId(), chw_id: chwId, patient_id: chwId + "-P0002", name: "Jean Habimana", age: 52, phone: "+250 722 345 678", location: "Nyarugenge, Gitega", created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
    { id: genId(), chw_id: chwId, patient_id: chwId + "-P0003", name: "Claudette Ingabire", age: 28, phone: "", location: "Gasabo, Kacyiru", created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
    { id: genId(), chw_id: chwId, patient_id: chwId + "-P0004", name: "Emmanuel Nzeyimana", age: 45, phone: "+250 788 456 789", location: "Kicukiro, Niboye", created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
  ];
  const now = new Date();
  const visits = [
    { id: genId(), chw_id: chwId, patient_id: patients[0].id, visit_type: "Routine Checkup", scheduled_date: now.toISOString(), status: "scheduled", notes: "", vital_signs: {}, created_at: now.toISOString(), updated_at: now.toISOString() },
    { id: genId(), chw_id: chwId, patient_id: patients[1].id, visit_type: "Follow-up Visit", scheduled_date: new Date(now - 86400000).toISOString(), status: "scheduled", notes: "", vital_signs: {}, created_at: now.toISOString(), updated_at: now.toISOString() },
    { id: genId(), chw_id: chwId, patient_id: patients[2].id, visit_type: "Emergency", scheduled_date: new Date(now - 2 * 86400000).toISOString(), status: "scheduled", notes: "", vital_signs: {}, created_at: now.toISOString(), updated_at: now.toISOString() },
    { id: genId(), chw_id: chwId, patient_id: patients[3].id, visit_type: "Routine Checkup", scheduled_date: new Date(now.getTime() + 86400000).toISOString(), status: "scheduled", notes: "", vital_signs: {}, created_at: now.toISOString(), updated_at: now.toISOString() },
  ];
  for (const p of patients) await dbPut("patients", p);
  for (const v of visits) await dbPut("visits", v);
}

function ToastContainer({ toasts, onDismiss }) {
  return (
    <div style={{ position: "fixed", top: 16, left: "50%", transform: "translateX(-50%)", zIndex: 9999, display: "flex", flexDirection: "column", gap: 8, width: "calc(100% - 32px)", maxWidth: 500 }}>
      {toasts.map(t => (
        <div key={t.id} onClick={() => onDismiss(t.id)} style={{ background: t.type === "error" ? "#c62828" : t.type === "warning" ? "#e65100" : "#1b5e20", color: "#fff", padding: "12px 16px", borderRadius: 10, fontSize: 14, fontFamily: "inherit", boxShadow: "0 4px 20px rgba(0,0,0,0.3)", cursor: "pointer", display: "flex", alignItems: "center", gap: 10, animation: "slideDown 0.3s ease" }}>
          <span>{t.type === "error" ? "x" : "!"}</span>
          <span>{t.message}</span>
        </div>
      ))}
    </div>
  );
}

function useToast() {
  const [toasts, setToasts] = useState([]);
  const show = useCallback((message, type = "success") => {
    const id = genId();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3000);
  }, []);
  const dismiss = useCallback((id) => setToasts(prev => prev.filter(t => t.id !== id)), []);
  return { toasts, show, dismiss };
}

function SyncIndicator({ isOnline, pendingCount }) {
  if (isOnline && pendingCount === 0) return <div style={{ fontSize: 12, color: "#a5d6a7" }}>Synced</div>;
  if (!isOnline) return <div style={{ fontSize: 12, color: "#ef9a9a" }}>Offline{pendingCount > 0 ? " (" + pendingCount + ")" : ""}</div>;
  return <div style={{ fontSize: 12, color: "#fff176" }}>Syncing...</div>;
}

function LoginScreen({ onLogin }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [resetMode, setResetMode] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await new Promise(r => setTimeout(r, 600));
      const user = mockSignIn(email, password);
      if (remember) localStorage.setItem("mobicare_session", JSON.stringify({ user, expires: Date.now() + 7 * 86400000 }));
      onLogin(user);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleReset = async (e) => {
    e.preventDefault();
    setLoading(true);
    await new Promise(r => setTimeout(r, 800));
    setResetSent(true);
    setLoading(false);
  };

  const inp = { width: "100%", padding: "12px 14px", border: "2px solid #e0e0e0", borderRadius: 10, fontSize: 15, outline: "none", boxSizing: "border-box", fontFamily: "inherit" };

  return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(160deg, #1b5e20 0%, #2e7d32 40%, #388e3c 100%)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ width: "100%", maxWidth: 380 }}>
        <div style={{ textAlign: "center", marginBottom: 40 }}>
          <div style={{ width: 72, height: 72, background: "rgba(255,255,255,0.15)", borderRadius: 20, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 800, color: "#fff", marginBottom: 16, border: "1px solid rgba(255,255,255,0.2)" }}>MC</div>
          <h1 style={{ color: "#fff", fontSize: 32, fontWeight: 800, margin: 0 }}>MobiCare</h1>
          <p style={{ color: "rgba(255,255,255,0.7)", margin: "4px 0 0", fontSize: 14 }}>Community Health Worker Platform</p>
        </div>
        <div style={{ background: "rgba(255,255,255,0.95)", borderRadius: 20, padding: 28, boxShadow: "0 20px 60px rgba(0,0,0,0.3)" }}>
          {!resetMode ? (
            <>
              <h2 style={{ margin: "0 0 20px", fontSize: 20, fontWeight: 700, color: "#1b5e20" }}>Sign In</h2>
              {error && <div style={{ background: "#ffebee", color: "#c62828", padding: "10px 14px", borderRadius: 8, fontSize: 13, marginBottom: 16 }}>{error}</div>}
              <form onSubmit={handleLogin}>
                <div style={{ marginBottom: 16 }}>
                  <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#333", marginBottom: 6 }}>Email</label>
                  <input value={email} onChange={e => setEmail(e.target.value)} type="email" required placeholder="your@email.com" style={inp} />
                </div>
                <div style={{ marginBottom: 16 }}>
                  <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#333", marginBottom: 6 }}>Password</label>
                  <input value={password} onChange={e => setPassword(e.target.value)} type="password" required placeholder="password" style={inp} />
                </div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
                  <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "#555", cursor: "pointer" }}>
                    <input type="checkbox" checked={remember} onChange={e => setRemember(e.target.checked)} style={{ accentColor: "#2e7d32" }} />
                    Remember me for 7 days
                  </label>
                  <button type="button" onClick={() => setResetMode(true)} style={{ background: "none", border: "none", color: "#2e7d32", fontSize: 13, cursor: "pointer", fontWeight: 600, padding: 0 }}>Forgot password?</button>
                </div>
                <button type="submit" disabled={loading} style={{ width: "100%", padding: "14px", background: loading ? "#aaa" : "#2e7d32", color: "#fff", border: "none", borderRadius: 12, fontSize: 16, fontWeight: 700, cursor: loading ? "not-allowed" : "pointer", fontFamily: "inherit" }}>
                  {loading ? "Signing in..." : "Sign In"}
                </button>
              </form>
              <p style={{ textAlign: "center", fontSize: 12, color: "#888", marginTop: 16, marginBottom: 0 }}>Demo: alice@mobicare.rw / password123</p>
            </>
          ) : (
            <>
              <h2 style={{ margin: "0 0 8px", fontSize: 20, fontWeight: 700, color: "#1b5e20" }}>Reset Password</h2>
              {!resetSent ? (
                <>
                  <p style={{ fontSize: 13, color: "#666", marginTop: 0, marginBottom: 20 }}>Enter your email and we will send you a reset link.</p>
                  <form onSubmit={handleReset}>
                    <div style={{ marginBottom: 20 }}>
                      <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#333", marginBottom: 6 }}>Email</label>
                      <input value={email} onChange={e => setEmail(e.target.value)} type="email" required placeholder="your@email.com" style={inp} />
                    </div>
                    <button type="submit" disabled={loading} style={{ width: "100%", padding: "14px", background: "#2e7d32", color: "#fff", border: "none", borderRadius: 12, fontSize: 16, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
                      {loading ? "Sending..." : "Send Reset Link"}
                    </button>
                  </form>
                </>
              ) : (
                <div style={{ textAlign: "center", padding: "20px 0" }}>
                  <p style={{ color: "#2e7d32", fontWeight: 600, fontSize: 15 }}>Reset link sent!</p>
                  <p style={{ color: "#666", fontSize: 13 }}>Check your email at <strong>{email}</strong></p>
                </div>
              )}
              <button onClick={() => { setResetMode(false); setResetSent(false); }} style={{ background: "none", border: "none", color: "#2e7d32", fontSize: 13, cursor: "pointer", marginTop: 16, width: "100%", fontWeight: 600, padding: 0, fontFamily: "inherit" }}>Back to Sign In</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function BottomNav({ tab, setTab, counts }) {
  const tabs = [
    { id: "dashboard", label: "Dashboard" },
    { id: "patients", label: "Patients" },
    { id: "visits", label: "Visits" },
    { id: "profile", label: "Profile" },
  ];
  return (
    <nav style={{ position: "fixed", bottom: 0, left: 0, right: 0, background: "#fff", borderTop: "1px solid #e8f5e9", display: "flex", zIndex: 100 }}>
      {tabs.map(t => (
        <button key={t.id} onClick={() => setTab(t.id)} style={{ flex: 1, padding: "10px 0 8px", background: "none", border: "none", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 3, color: tab === t.id ? "#2e7d32" : "#9e9e9e", fontFamily: "inherit" }}>
          <span style={{ fontSize: 11, fontWeight: 800, width: 26, height: 26, display: "inline-flex", alignItems: "center", justifyContent: "center", borderRadius: 6, background: tab === t.id ? "#e8f5e9" : "#f0f0f0", position: "relative" }}>
            {t.label.charAt(0)}
            {t.id === "visits" && counts?.overdue > 0 && (
              <span style={{ position: "absolute", top: -4, right: -8, background: "#c62828", color: "#fff", borderRadius: "50%", width: 16, height: 16, fontSize: 10, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700 }}>{counts.overdue}</span>
            )}
          </span>
          <span style={{ fontSize: 11, fontWeight: tab === t.id ? 700 : 400 }}>{t.label}</span>
        </button>
      ))}
    </nav>
  );
}

function StatCard({ icon, value, label, color, bg, onClick }) {
  return (
    <div onClick={onClick} style={{ background: bg || "#fff", borderRadius: 16, padding: "20px 16px", display: "flex", flexDirection: "column", alignItems: "center", flex: 1, boxShadow: "0 2px 12px rgba(0,0,0,0.08)", cursor: onClick ? "pointer" : "default" }}>
      <span style={{ fontSize: 12, fontWeight: 800, width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 8, background: "rgba(0,0,0,0.07)", marginBottom: 6 }}>{icon}</span>
      <span style={{ fontSize: 32, fontWeight: 800, color, lineHeight: 1 }}>{value}</span>
      <span style={{ fontSize: 12, color: "#666", marginTop: 4, textAlign: "center", fontWeight: 500 }}>{label}</span>
    </div>
  );
}

function Dashboard({ visits, patients, onGoToVisits }) {
  const today = visits.filter(v => isToday(v.scheduled_date) && v.status !== "completed" && v.status !== "cancelled");
  const overdue = visits.filter(v => isOverdue(v.scheduled_date, v.status)).sort((a, b) => new Date(a.scheduled_date) - new Date(b.scheduled_date));
  const completedThisWeek = visits.filter(v => {
    if (v.status !== "completed") return false;
    return new Date(v.completed_date || v.updated_at) >= new Date(Date.now() - 7 * 86400000);
  });
  const getPatientName = (pid) => patients.find(p => p.id === pid)?.name || "Unknown";

  return (
    <div style={{ padding: "16px 16px 100px" }}>
      <h2 style={{ margin: "0 0 20px", fontSize: 22, fontWeight: 800, color: "#1b5e20" }}>Dashboard</h2>
      <div style={{ display: "flex", gap: 12, marginBottom: 20 }}>
        <StatCard icon="T" value={today.length} label="Today" color="#2e7d32" bg="#f1f8e9" />
        <StatCard icon="!" value={overdue.length} label="Overdue" color="#c62828" bg="#ffebee" onClick={() => onGoToVisits("overdue")} />
        <StatCard icon="D" value={completedThisWeek.length} label="This Week" color="#1565c0" bg="#e3f2fd" />
      </div>
      {today.length > 0 && (
        <>
          <h3 style={{ margin: "0 0 12px", fontSize: 16, fontWeight: 700, color: "#333" }}>Today's Schedule</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 20 }}>
            {today.sort((a, b) => new Date(a.scheduled_date) - new Date(b.scheduled_date)).map(v => (
              <VisitCard key={v.id} visit={v} patientName={getPatientName(v.patient_id)} compact />
            ))}
          </div>
        </>
      )}
      {overdue.length > 0 && (
        <>
          <h3 style={{ margin: "0 0 12px", fontSize: 16, fontWeight: 700, color: "#c62828" }}>Overdue Visits</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {overdue.map(v => <VisitCard key={v.id} visit={v} patientName={getPatientName(v.patient_id)} compact overdue />)}
          </div>
        </>
      )}
      {today.length === 0 && overdue.length === 0 && (
        <div style={{ textAlign: "center", padding: "60px 20px", color: "#666" }}>
          <p style={{ fontWeight: 700, color: "#2e7d32", fontSize: 15 }}>All clear for today</p>
          <p style={{ fontSize: 14 }}>No pending or overdue visits.</p>
        </div>
      )}
    </div>
  );
}

function VisitCard({ visit, patientName, compact, overdue: isOv }) {
  const statusColor = isOv ? "#c62828" : isToday(visit.scheduled_date) ? "#f57f17" : visit.status === "completed" ? "#388e3c" : "#666";
  const statusBg = isOv ? "#ffebee" : isToday(visit.scheduled_date) ? "#fff8e1" : visit.status === "completed" ? "#e8f5e9" : "#f5f5f5";
  return (
    <div style={{ background: "#fff", borderRadius: 12, padding: compact ? "12px 14px" : "16px", boxShadow: "0 2px 8px rgba(0,0,0,0.06)", borderLeft: "4px solid " + statusColor }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <p style={{ margin: 0, fontWeight: 700, fontSize: 15, color: "#222" }}>{patientName}</p>
          <p style={{ margin: "3px 0 0", fontSize: 13, color: "#666" }}>{visit.visit_type} - {formatTime(visit.scheduled_date)}</p>
          {isOv && <p style={{ margin: "3px 0 0", fontSize: 12, color: "#c62828", fontWeight: 600 }}>{daysOverdue(visit.scheduled_date)} day(s) overdue</p>}
        </div>
        <span style={{ background: statusBg, color: statusColor, fontSize: 11, fontWeight: 700, padding: "3px 8px", borderRadius: 20 }}>
          {isOv ? "OVERDUE" : isToday(visit.scheduled_date) ? "TODAY" : visit.status.toUpperCase()}
        </span>
      </div>
    </div>
  );
}

function PatientList({ patients, visits, onSelect, onAdd }) {
  const [search, setSearch] = useState("");
  const filtered = patients.filter(p => p.name.toLowerCase().includes(search.toLowerCase()) || p.location.toLowerCase().includes(search.toLowerCase()));
  const getNextVisit = (pid) => visits.filter(v => v.patient_id === pid && v.status === "scheduled" && new Date(v.scheduled_date) >= new Date()).sort((a, b) => new Date(a.scheduled_date) - new Date(b.scheduled_date))[0];
  const hasOverdue = (pid) => visits.some(v => v.patient_id === pid && isOverdue(v.scheduled_date, v.status));

  return (
    <div style={{ padding: "16px 16px 100px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: "#1b5e20" }}>Patients</h2>
        <span style={{ fontSize: 13, color: "#666" }}>{patients.length} total</span>
      </div>
      <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name or location..."
        style={{ width: "100%", padding: "12px 14px", border: "2px solid #e8f5e9", borderRadius: 12, fontSize: 14, outline: "none", boxSizing: "border-box", fontFamily: "inherit", background: "#f9fbe7", marginBottom: 16 }} />
      {filtered.length === 0 ? (
        <div style={{ textAlign: "center", padding: "60px 20px", color: "#666" }}>
          <p style={{ fontWeight: 600 }}>{search ? "No patients found" : "No patients yet"}</p>
          {!search && <p style={{ fontSize: 14 }}>Tap + to add your first patient</p>}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {filtered.map(p => {
            const next = getNextVisit(p.id);
            const overdue = hasOverdue(p.id);
            return (
              <div key={p.id} onClick={() => onSelect(p)} style={{ background: "#fff", borderRadius: 14, padding: "14px 16px", boxShadow: "0 2px 10px rgba(0,0,0,0.06)", cursor: "pointer", border: "2px solid " + (overdue ? "#ffcdd2" : "#f0f0f0") }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1 }}>
                    <div style={{ width: 36, height: 36, borderRadius: "50%", background: "#e8f5e9", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, fontWeight: 700, color: "#2e7d32", flexShrink: 0 }}>{p.name.charAt(0)}</div>
                    <div>
                      <p style={{ margin: 0, fontWeight: 700, fontSize: 15, color: "#222" }}>{p.name}</p>
                      <p style={{ margin: 0, fontSize: 12, color: "#888" }}>{p.age}y - {p.location}</p>
                    </div>
                  </div>
                  <div style={{ textAlign: "right", flexShrink: 0 }}>
                    {overdue && <span style={{ background: "#ffebee", color: "#c62828", fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 20, display: "block", marginBottom: 4 }}>OVERDUE</span>}
                    {next && <p style={{ margin: 0, fontSize: 11, color: "#666" }}>Next: {formatDate(next.scheduled_date)}</p>}
                    {!next && !overdue && <p style={{ margin: 0, fontSize: 11, color: "#bbb" }}>No upcoming</p>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
      <button onClick={onAdd} style={{ position: "fixed", bottom: 80, right: 20, width: 56, height: 56, borderRadius: "50%", background: "#2e7d32", color: "#fff", border: "none", fontSize: 28, cursor: "pointer", boxShadow: "0 4px 20px rgba(46,125,50,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 }}>+</button>
    </div>
  );
}

// Field is defined outside PatientForm so it does not re-mount on every keystroke
function Field({ label, required, error, children }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#333", marginBottom: 6 }}>
        {label}{required && <span style={{ color: "#c62828" }}> *</span>}
      </label>
      {children}
      {error && <p style={{ margin: "4px 0 0", fontSize: 12, color: "#c62828" }}>{error}</p>}
    </div>
  );
}

function PatientForm({ patient, onSave, onCancel, chwId, patientCount }) {
  const [name, setName] = useState(patient?.name || "");
  const [age, setAge] = useState(patient?.age || "");
  const [phone, setPhone] = useState(patient?.phone || "");
  const [location, setLocation] = useState(patient?.location || "");
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);

  const validate = () => {
    const e = {};
    if (!name || name.length < 2 || name.length > 100) e.name = "Name must be 2-100 characters";
    if (!age || isNaN(age) || age < 0 || age > 150) e.age = "Enter a valid age";
    if (phone && !/^\+250\s7\d{2}\s\d{3}\s\d{3}$/.test(phone)) e.phone = "Format: +250 7XX XXX XXX";
    if (!location) e.location = "Location is required";
    else if (!/^[^,]+,\s*[^,]+$/.test(location)) e.location = "Format: Sector, Cell";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) return;
    setSaving(true);
    const now = new Date().toISOString();
    const record = patient
      ? { ...patient, name, age: parseInt(age), phone, location, updated_at: now }
      : { id: genId(), chw_id: chwId, patient_id: genPatientId(chwId, patientCount), name, age: parseInt(age), phone, location, created_at: now, updated_at: now };
    await dbPut("patients", record);
    await dbPut("sync_queue", { action: patient ? "UPDATE_PATIENT" : "CREATE_PATIENT", data: record, timestamp: now, retries: 0 });
    setSaving(false);
    onSave(record);
  };

  const inp = (err) => ({ width: "100%", padding: "12px 14px", border: "2px solid " + (err ? "#ef9a9a" : "#e0e0e0"), borderRadius: 10, fontSize: 15, outline: "none", boxSizing: "border-box", fontFamily: "inherit" });

  return (
    <div style={{ padding: "16px 16px 100px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
        <button onClick={onCancel} style={{ background: "none", border: "none", fontSize: 24, cursor: "pointer", padding: 4 }}>←</button>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: "#1b5e20" }}>{patient ? "Edit Patient" : "Add Patient"}</h2>
      </div>
      <Field label="Full Name" required error={errors.name}>
        <input value={name} onChange={e => setName(e.target.value)} style={inp(errors.name)} placeholder="e.g. Marie Mutesi" />
      </Field>
      <Field label="Age" required error={errors.age}>
        <input value={age} onChange={e => setAge(e.target.value)} type="number" style={inp(errors.age)} placeholder="e.g. 34" min={0} max={150} />
      </Field>
      <Field label="Phone (optional)" error={errors.phone}>
        <input value={phone} onChange={e => setPhone(e.target.value)} style={inp(errors.phone)} placeholder="+250 7XX XXX XXX" />
      </Field>
      <Field label="Household Location" required error={errors.location}>
        <input value={location} onChange={e => setLocation(e.target.value)} style={inp(errors.location)} placeholder="e.g. Kimironko, Bibare" />
        <p style={{ margin: "4px 0 0", fontSize: 11, color: "#888" }}>Format: Sector, Cell</p>
      </Field>
      <button onClick={handleSave} disabled={saving} style={{ width: "100%", padding: "15px", background: saving ? "#aaa" : "#2e7d32", color: "#fff", border: "none", borderRadius: 12, fontSize: 16, fontWeight: 700, cursor: saving ? "not-allowed" : "pointer", fontFamily: "inherit", marginTop: 8 }}>
        {saving ? "Saving..." : (patient ? "Save Changes" : "Add Patient")}
      </button>
    </div>
  );
}

function PatientDetail({ patient, visits, onBack, onEdit, onAddVisit, onCompleteVisit, onCancelVisit, showToast }) {
  const [tab, setTab] = useState("visits");
  const patientVisits = visits.filter(v => v.patient_id === patient.id).sort((a, b) => new Date(b.scheduled_date) - new Date(a.scheduled_date));
  const upcoming = patientVisits.filter(v => v.status === "scheduled");
  const history = patientVisits.filter(v => v.status === "completed" || v.status === "cancelled");

  return (
    <div style={{ padding: "0 0 100px" }}>
      <div style={{ background: "linear-gradient(135deg, #1b5e20, #2e7d32)", padding: "20px 16px 24px", position: "relative" }}>
        <button onClick={onBack} style={{ background: "rgba(255,255,255,0.2)", border: "none", borderRadius: 8, padding: "6px 12px", color: "#fff", cursor: "pointer", fontSize: 14, marginBottom: 16 }}>Back</button>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ width: 56, height: 56, borderRadius: "50%", background: "rgba(255,255,255,0.2)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, color: "#fff", fontWeight: 700, border: "2px solid rgba(255,255,255,0.4)" }}>{patient.name.charAt(0)}</div>
          <div>
            <h2 style={{ margin: 0, color: "#fff", fontSize: 20, fontWeight: 800 }}>{patient.name}</h2>
            <p style={{ margin: "2px 0 0", color: "rgba(255,255,255,0.8)", fontSize: 13 }}>{patient.patient_id} - {patient.age}y</p>
            <p style={{ margin: "2px 0 0", color: "rgba(255,255,255,0.7)", fontSize: 12 }}>Location: {patient.location}</p>
          </div>
        </div>
        {patient.phone && <p style={{ margin: "12px 0 0", color: "rgba(255,255,255,0.8)", fontSize: 13 }}>Phone: {patient.phone}</p>}
        <button onClick={onEdit} style={{ position: "absolute", top: 20, right: 16, background: "rgba(255,255,255,0.2)", border: "none", borderRadius: 8, padding: "6px 14px", color: "#fff", cursor: "pointer", fontSize: 13, fontWeight: 600 }}>Edit</button>
      </div>
      <div style={{ display: "flex", borderBottom: "2px solid #e8f5e9", padding: "0 16px" }}>
        {["visits", "history"].map(t => (
          <button key={t} onClick={() => setTab(t)} style={{ flex: 1, padding: "14px 0", background: "none", border: "none", cursor: "pointer", fontSize: 14, fontWeight: tab === t ? 700 : 400, color: tab === t ? "#2e7d32" : "#888", borderBottom: tab === t ? "3px solid #2e7d32" : "3px solid transparent", marginBottom: -2, fontFamily: "inherit" }}>
            {t === "visits" ? "Upcoming (" + upcoming.length + ")" : "History (" + history.length + ")"}
          </button>
        ))}
      </div>
      <div style={{ padding: "16px" }}>
        {tab === "visits" && (
          upcoming.length === 0
            ? <div style={{ textAlign: "center", padding: "40px 20px", color: "#999" }}><p>No upcoming visits</p></div>
            : <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>{upcoming.map(v => <VisitDetailCard key={v.id} visit={v} onComplete={() => onCompleteVisit(v)} onCancel={() => { if (window.confirm("Cancel this visit?")) { onCancelVisit(v.id); showToast("Visit cancelled"); } }} />)}</div>
        )}
        {tab === "history" && (
          history.length === 0
            ? <div style={{ textAlign: "center", padding: "40px 20px", color: "#999" }}><p>No visit history yet</p></div>
            : <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>{history.map(v => <VisitHistoryCard key={v.id} visit={v} />)}</div>
        )}
      </div>
      <button onClick={onAddVisit} style={{ position: "fixed", bottom: 80, right: 20, width: 56, height: 56, borderRadius: "50%", background: "#2e7d32", color: "#fff", border: "none", fontSize: 28, cursor: "pointer", boxShadow: "0 4px 20px rgba(46,125,50,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 }}>+</button>
    </div>
  );
}

function VisitDetailCard({ visit, onComplete, onCancel }) {
  const overdue = isOverdue(visit.scheduled_date, visit.status);
  const today = isToday(visit.scheduled_date);
  const color = overdue ? "#c62828" : today ? "#f57f17" : "#2e7d32";
  const bg = overdue ? "#ffebee" : today ? "#fff8e1" : "#e8f5e9";
  return (
    <div style={{ background: "#fff", borderRadius: 12, padding: "14px", boxShadow: "0 2px 8px rgba(0,0,0,0.06)", border: "1px solid " + bg }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <span style={{ fontWeight: 700, fontSize: 15, color: "#222" }}>{visit.visit_type}</span>
        <span style={{ background: bg, color, fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 20 }}>{overdue ? "OVERDUE" : today ? "TODAY" : "UPCOMING"}</span>
      </div>
      <p style={{ margin: "0 0 12px", fontSize: 13, color: "#666" }}>{formatDate(visit.scheduled_date)} at {formatTime(visit.scheduled_date)}</p>
      {visit.notes && <p style={{ margin: "0 0 12px", fontSize: 13, color: "#555", background: "#f5f5f5", padding: "8px 10px", borderRadius: 8 }}>{visit.notes}</p>}
      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={onComplete} style={{ flex: 1, padding: "10px", background: "#2e7d32", color: "#fff", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>Mark Complete</button>
        <button onClick={onCancel} style={{ padding: "10px 14px", background: "#ffebee", color: "#c62828", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>
      </div>
    </div>
  );
}

function VisitHistoryCard({ visit }) {
  return (
    <div style={{ background: "#fff", borderRadius: 12, padding: "14px", boxShadow: "0 2px 8px rgba(0,0,0,0.06)", borderLeft: "4px solid " + (visit.status === "completed" ? "#388e3c" : "#bbb") }}>
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <span style={{ fontWeight: 700, fontSize: 14 }}>{visit.visit_type}</span>
        <span style={{ fontSize: 11, color: visit.status === "completed" ? "#388e3c" : "#999", fontWeight: 600 }}>{visit.status.toUpperCase()}</span>
      </div>
      <p style={{ margin: "4px 0", fontSize: 12, color: "#888" }}>{formatDate(visit.scheduled_date)}</p>
      {visit.notes && <p style={{ margin: "8px 0 0", fontSize: 13, color: "#555" }}>{visit.notes}</p>}
      {visit.vital_signs && Object.keys(visit.vital_signs).length > 0 && (
        <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap" }}>
          {visit.vital_signs.temperature && <span style={{ background: "#e8f5e9", color: "#2e7d32", fontSize: 12, padding: "2px 8px", borderRadius: 20, fontWeight: 600 }}>Temp: {visit.vital_signs.temperature}°C</span>}
          {visit.vital_signs.systolic && <span style={{ background: "#e3f2fd", color: "#1565c0", fontSize: 12, padding: "2px 8px", borderRadius: 20, fontWeight: 600 }}>BP: {visit.vital_signs.systolic}/{visit.vital_signs.diastolic}</span>}
        </div>
      )}
    </div>
  );
}

function ScheduleVisitForm({ patient, onSave, onCancel, chwId }) {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  const minDate = now.getFullYear() + "-" + pad(now.getMonth() + 1) + "-" + pad(now.getDate()) + "T" + pad(now.getHours()) + ":" + pad(now.getMinutes());
  const [date, setDate] = useState("");
  const [type, setType] = useState("Routine Checkup");
  const [notes, setNotes] = useState("");
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);

  const validate = () => {
    const e = {};
    if (!date) e.date = "Date is required";
    else if (new Date(date) < new Date()) e.date = "Cannot schedule in the past";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) return;
    setSaving(true);
    const nowStr = new Date().toISOString();
    const record = { id: genId(), chw_id: chwId, patient_id: patient.id, visit_type: type, scheduled_date: new Date(date).toISOString(), status: "scheduled", notes, vital_signs: {}, created_at: nowStr, updated_at: nowStr };
    await dbPut("visits", record);
    await dbPut("sync_queue", { action: "CREATE_VISIT", data: record, timestamp: nowStr, retries: 0 });
    setSaving(false);
    onSave(record);
  };

  const inp = { width: "100%", padding: "12px 14px", border: "2px solid #e0e0e0", borderRadius: 10, fontSize: 15, outline: "none", boxSizing: "border-box", fontFamily: "inherit" };

  return (
    <div style={{ padding: "16px 16px 100px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
        <button onClick={onCancel} style={{ background: "none", border: "none", fontSize: 24, cursor: "pointer", padding: 4 }}>←</button>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: "#1b5e20" }}>Schedule Visit</h2>
          <p style={{ margin: "2px 0 0", fontSize: 13, color: "#888" }}>For: {patient.name}</p>
        </div>
      </div>
      <div style={{ marginBottom: 18 }}>
        <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#333", marginBottom: 6 }}>Date & Time <span style={{ color: "#c62828" }}>*</span></label>
        <input type="datetime-local" value={date} onChange={e => setDate(e.target.value)} min={minDate} style={{ ...inp, border: "2px solid " + (errors.date ? "#ef9a9a" : "#e0e0e0") }} />
        {errors.date && <p style={{ margin: "4px 0 0", fontSize: 12, color: "#c62828" }}>{errors.date}</p>}
      </div>
      <div style={{ marginBottom: 18 }}>
        <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#333", marginBottom: 6 }}>Visit Type <span style={{ color: "#c62828" }}>*</span></label>
        <select value={type} onChange={e => setType(e.target.value)} style={{ ...inp, background: "#fff" }}>
          <option>Routine Checkup</option>
          <option>Follow-up Visit</option>
          <option>Emergency</option>
        </select>
      </div>
      <div style={{ marginBottom: 18 }}>
        <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#333", marginBottom: 6 }}>Notes (optional)</label>
        <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} placeholder="Any notes for this visit..." style={{ ...inp, resize: "none", fontSize: 14 }} />
      </div>
      <button onClick={handleSave} disabled={saving} style={{ width: "100%", padding: "15px", background: saving ? "#aaa" : "#2e7d32", color: "#fff", border: "none", borderRadius: 12, fontSize: 16, fontWeight: 700, cursor: saving ? "not-allowed" : "pointer", fontFamily: "inherit" }}>
        {saving ? "Scheduling..." : "Schedule Visit"}
      </button>
    </div>
  );
}

function CompleteVisitForm({ visit, patient, onSave, onCancel }) {
  const [notes, setNotes] = useState(visit.notes || "");
  const [temp, setTemp] = useState("");
  const [systolic, setSystolic] = useState("");
  const [diastolic, setDiastolic] = useState("");
  const [photos, setPhotos] = useState([]);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef();
  const notesLen = notes.length;

  const validate = () => {
    const e = {};
    if (notes.length < 10) e.notes = "Notes must be at least 10 characters";
    if (notes.length > 500) e.notes = "Notes cannot exceed 500 characters";
    if (temp && (isNaN(temp) || temp < 30 || temp > 45)) e.temp = "Temperature must be 30-45";
    if (systolic && (isNaN(systolic) || systolic < 60 || systolic > 250)) e.systolic = "Systolic must be 60-250";
    if (diastolic && (isNaN(diastolic) || diastolic < 40 || diastolic > 150)) e.diastolic = "Diastolic must be 40-150";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handlePhoto = (e) => {
    const files = Array.from(e.target.files);
    files.slice(0, 3 - photos.length).forEach(file => {
      const reader = new FileReader();
      reader.onload = (ev) => setPhotos(prev => [...prev, { url: ev.target.result, name: file.name }]);
      reader.readAsDataURL(file);
    });
  };

  const handleSave = async () => {
    if (!validate()) return;
    setSaving(true);
    const nowStr = new Date().toISOString();
    const updated = { ...visit, status: "completed", completed_date: nowStr, notes, vital_signs: { ...(temp ? { temperature: parseFloat(temp) } : {}), ...(systolic ? { systolic: parseInt(systolic), diastolic: parseInt(diastolic) } : {}) }, photo_urls: photos.map(p => p.url), updated_at: nowStr };
    await dbPut("visits", updated);
    await dbPut("sync_queue", { action: "COMPLETE_VISIT", data: updated, timestamp: nowStr, retries: 0 });
    setSaving(false);
    onSave(updated);
  };

  const inp = (err) => ({ width: "100%", padding: "10px 14px", border: "2px solid " + (err ? "#ef9a9a" : "#e0e0e0"), borderRadius: 10, fontSize: 14, outline: "none", boxSizing: "border-box", fontFamily: "inherit" });

  return (
    <div style={{ padding: "16px 16px 100px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
        <button onClick={onCancel} style={{ background: "none", border: "none", fontSize: 24, cursor: "pointer", padding: 4 }}>←</button>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: "#1b5e20" }}>Log Visit</h2>
          <p style={{ margin: "2px 0 0", fontSize: 13, color: "#888" }}>{patient.name} - {visit.visit_type}</p>
        </div>
      </div>
      <div style={{ marginBottom: 18 }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
          <label style={{ fontSize: 13, fontWeight: 600, color: "#333" }}>Visit Notes <span style={{ color: "#c62828" }}>*</span></label>
          <span style={{ fontSize: 12, color: notesLen > 500 ? "#c62828" : notesLen >= 10 ? "#388e3c" : "#aaa" }}>{notesLen}/500</span>
        </div>
        <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={5} placeholder="Describe the visit outcome, patient condition, and any actions taken... (min 10 characters)" style={{ width: "100%", padding: "12px 14px", border: "2px solid " + (errors.notes ? "#ef9a9a" : "#e0e0e0"), borderRadius: 10, fontSize: 14, outline: "none", boxSizing: "border-box", fontFamily: "inherit", resize: "none" }} />
        {errors.notes && <p style={{ margin: "4px 0 0", fontSize: 12, color: "#c62828" }}>{errors.notes}</p>}
      </div>
      <div style={{ background: "#f9fbe7", borderRadius: 12, padding: "16px", marginBottom: 18 }}>
        <h3 style={{ margin: "0 0 14px", fontSize: 15, fontWeight: 700, color: "#33691e" }}>Vital Signs (optional)</h3>
        <div style={{ marginBottom: 14 }}>
          <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#333", marginBottom: 6 }}>Temperature (degrees C)</label>
          <input value={temp} onChange={e => setTemp(e.target.value)} type="number" step="0.1" placeholder="e.g. 37.5" style={inp(errors.temp)} />
          {errors.temp && <p style={{ margin: "4px 0 0", fontSize: 12, color: "#c62828" }}>{errors.temp}</p>}
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <div style={{ flex: 1 }}>
            <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#333", marginBottom: 6 }}>Systolic (mmHg)</label>
            <input value={systolic} onChange={e => setSystolic(e.target.value)} type="number" placeholder="e.g. 120" style={inp(errors.systolic)} />
            {errors.systolic && <p style={{ margin: "4px 0 0", fontSize: 12, color: "#c62828" }}>{errors.systolic}</p>}
          </div>
          <div style={{ flex: 1 }}>
            <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#333", marginBottom: 6 }}>Diastolic (mmHg)</label>
            <input value={diastolic} onChange={e => setDiastolic(e.target.value)} type="number" placeholder="e.g. 80" style={inp(errors.diastolic)} />
            {errors.diastolic && <p style={{ margin: "4px 0 0", fontSize: 12, color: "#c62828" }}>{errors.diastolic}</p>}
          </div>
        </div>
      </div>
      <div style={{ marginBottom: 24 }}>
        <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#333", marginBottom: 8 }}>Photos (max 3, optional)</label>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {photos.map((p, i) => (
            <div key={i} style={{ position: "relative", width: 80, height: 80 }}>
              <img src={p.url} alt="" style={{ width: 80, height: 80, borderRadius: 8, objectFit: "cover" }} />
              <button onClick={() => setPhotos(prev => prev.filter((_, j) => j !== i))} style={{ position: "absolute", top: -6, right: -6, width: 20, height: 20, borderRadius: "50%", background: "#c62828", color: "#fff", border: "none", fontSize: 12, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>x</button>
            </div>
          ))}
          {photos.length < 3 && (
            <button onClick={() => fileInputRef.current?.click()} style={{ width: 80, height: 80, borderRadius: 8, border: "2px dashed #c8e6c9", background: "#f1f8e9", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4, color: "#2e7d32", fontFamily: "inherit", fontSize: 11, fontWeight: 700 }}>
              + Photo
            </button>
          )}
          <input ref={fileInputRef} type="file" accept="image/*" multiple style={{ display: "none" }} onChange={handlePhoto} />
        </div>
      </div>
      <button onClick={handleSave} disabled={saving} style={{ width: "100%", padding: "15px", background: saving ? "#aaa" : "#2e7d32", color: "#fff", border: "none", borderRadius: 12, fontSize: 16, fontWeight: 700, cursor: saving ? "not-allowed" : "pointer", fontFamily: "inherit" }}>
        {saving ? "Saving..." : "Complete Visit"}
      </button>
    </div>
  );
}

function VisitsList({ visits, patients, initialFilter, onCompleteVisit }) {
  const [filter, setFilter] = useState(initialFilter || "all");
  const getPatientName = (pid) => patients.find(p => p.id === pid)?.name || "Unknown";
  const filtered = visits.filter(v => {
    if (filter === "today") return isToday(v.scheduled_date) && v.status === "scheduled";
    if (filter === "overdue") return isOverdue(v.scheduled_date, v.status);
    if (filter === "upcoming") return v.status === "scheduled" && !isToday(v.scheduled_date) && !isOverdue(v.scheduled_date, v.status);
    if (filter === "completed") return v.status === "completed";
    return true;
  }).sort((a, b) => filter === "overdue" ? new Date(a.scheduled_date) - new Date(b.scheduled_date) : new Date(b.scheduled_date) - new Date(a.scheduled_date));
  const chips = ["all", "today", "overdue", "upcoming", "completed"];

  return (
    <div style={{ padding: "16px 16px 100px" }}>
      <h2 style={{ margin: "0 0 16px", fontSize: 22, fontWeight: 800, color: "#1b5e20" }}>Visits</h2>
      <div style={{ display: "flex", gap: 8, marginBottom: 16, overflowX: "auto", paddingBottom: 4 }}>
        {chips.map(c => {
          const count = c === "overdue" ? visits.filter(v => isOverdue(v.scheduled_date, v.status)).length : null;
          return (
            <button key={c} onClick={() => setFilter(c)} style={{ padding: "7px 14px", borderRadius: 20, border: "none", cursor: "pointer", whiteSpace: "nowrap", background: filter === c ? "#2e7d32" : "#f0f0f0", color: filter === c ? "#fff" : "#555", fontSize: 13, fontWeight: filter === c ? 700 : 400, fontFamily: "inherit" }}>
              {c.charAt(0).toUpperCase() + c.slice(1)}{count ? " (" + count + ")" : ""}
            </button>
          );
        })}
      </div>
      {filtered.length === 0
        ? <div style={{ textAlign: "center", padding: "60px 20px", color: "#999" }}><p>No {filter} visits</p></div>
        : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {filtered.map(v => {
              const ov = isOverdue(v.scheduled_date, v.status);
              const td = isToday(v.scheduled_date);
              const borderColor = ov ? "#c62828" : td ? "#f57f17" : v.status === "completed" ? "#388e3c" : "#2e7d32";
              const badgeBg = ov ? "#ffebee" : td ? "#fff8e1" : v.status === "completed" ? "#e8f5e9" : "#f0f0f0";
              const badgeColor = ov ? "#c62828" : td ? "#f57f17" : v.status === "completed" ? "#388e3c" : "#666";
              return (
                <div key={v.id} style={{ background: "#fff", borderRadius: 12, padding: "14px", boxShadow: "0 2px 8px rgba(0,0,0,0.06)", borderLeft: "4px solid " + borderColor }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div>
                      <p style={{ margin: 0, fontWeight: 700, fontSize: 15 }}>{getPatientName(v.patient_id)}</p>
                      <p style={{ margin: "3px 0", fontSize: 13, color: "#666" }}>{v.visit_type}</p>
                      <p style={{ margin: 0, fontSize: 12, color: "#999" }}>{formatDate(v.scheduled_date)} {formatTime(v.scheduled_date)}</p>
                      {ov && <p style={{ margin: "3px 0 0", fontSize: 12, color: "#c62828", fontWeight: 600 }}>{daysOverdue(v.scheduled_date)} day(s) overdue</p>}
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
                      <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 8px", borderRadius: 20, background: badgeBg, color: badgeColor }}>{ov ? "OVERDUE" : v.status.toUpperCase()}</span>
                      {v.status === "scheduled" && <button onClick={() => onCompleteVisit(v)} style={{ background: "#2e7d32", color: "#fff", border: "none", borderRadius: 8, padding: "6px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>Log</button>}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )
      }
    </div>
  );
}

function Profile({ user, onLogout, pendingCount, isOnline }) {
  return (
    <div style={{ padding: "16px 16px 100px" }}>
      <h2 style={{ margin: "0 0 20px", fontSize: 22, fontWeight: 800, color: "#1b5e20" }}>Profile</h2>
      <div style={{ background: "linear-gradient(135deg, #1b5e20, #2e7d32)", borderRadius: 16, padding: "24px", marginBottom: 20, textAlign: "center" }}>
        <div style={{ width: 64, height: 64, borderRadius: "50%", background: "rgba(255,255,255,0.2)", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 28, color: "#fff", fontWeight: 700, marginBottom: 12 }}>{user.name?.charAt(0)}</div>
        <h3 style={{ color: "#fff", margin: "0 0 4px", fontSize: 20, fontWeight: 700 }}>{user.name}</h3>
        <p style={{ color: "rgba(255,255,255,0.8)", margin: "0 0 4px", fontSize: 14 }}>{user.email}</p>
        <p style={{ color: "rgba(255,255,255,0.6)", margin: 0, fontSize: 13 }}>CHW ID: {user.chwId}</p>
      </div>
      <div style={{ background: "#fff", borderRadius: 16, padding: "16px", marginBottom: 16, boxShadow: "0 2px 8px rgba(0,0,0,0.06)" }}>
        <h3 style={{ margin: "0 0 16px", fontSize: 16, fontWeight: 700, color: "#333" }}>Sync Status</h3>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 12, height: 12, borderRadius: "50%", background: isOnline ? "#388e3c" : "#c62828" }} />
          <span style={{ fontSize: 14, color: "#555" }}>{isOnline ? "Online" : "Offline"}</span>
        </div>
        {pendingCount > 0 && <p style={{ margin: "10px 0 0", fontSize: 13, color: "#f57f17", fontWeight: 600 }}>{pendingCount} change(s) pending sync</p>}
        {pendingCount === 0 && isOnline && <p style={{ margin: "10px 0 0", fontSize: 13, color: "#388e3c", fontWeight: 600 }}>All data synced</p>}
      </div>
      <button onClick={onLogout} style={{ width: "100%", padding: "14px", background: "#ffebee", color: "#c62828", border: "2px solid #ffcdd2", borderRadius: 12, fontSize: 15, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>Sign Out</button>
    </div>
  );
}

export default function App() {
  const [user, setUser] = useState(null);
  const [tab, setTab] = useState("dashboard");
  const [patients, setPatients] = useState([]);
  const [visits, setVisits] = useState([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [screen, setScreen] = useState(null);
  const [loading, setLoading] = useState(true);
  const [visitFilter, setVisitFilter] = useState("all");
  const { toasts, show: showToast, dismiss } = useToast();

  useEffect(() => {
    try {
      const sess = localStorage.getItem("mobicare_session");
      if (sess) {
        const { user: u, expires } = JSON.parse(sess);
        if (Date.now() < expires) setUser(u);
        else localStorage.removeItem("mobicare_session");
      }
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      await seedData(user.chwId);
      const [ps, vs, sq] = await Promise.all([dbGetAll("patients"), dbGetAll("visits"), dbGetAll("sync_queue")]);
      setPatients(ps.filter(p => p.chw_id === user.chwId));
      setVisits(vs.filter(v => v.chw_id === user.chwId));
      setPendingCount(sq.length);
    };
    load();
  }, [user]);

  useEffect(() => {
    const onOnline = () => { setIsOnline(true); showToast("Back online", "warning"); };
    const onOffline = () => { setIsOnline(false); showToast("You are offline. Changes saved locally.", "warning"); };
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => { window.removeEventListener("online", onOnline); window.removeEventListener("offline", onOffline); };
  }, [showToast]);

  const refreshData = async () => {
    if (!user) return;
    const [ps, vs, sq] = await Promise.all([dbGetAll("patients"), dbGetAll("visits"), dbGetAll("sync_queue")]);
    setPatients(ps.filter(p => p.chw_id === user.chwId));
    setVisits(vs.filter(v => v.chw_id === user.chwId));
    setPendingCount(sq.length);
  };

  const handleLogout = () => {
    localStorage.removeItem("mobicare_session");
    setUser(null);
    setPatients([]);
    setVisits([]);
    setScreen(null);
  };

  const overdueCounts = visits.filter(v => isOverdue(v.scheduled_date, v.status)).length;

  if (loading) return <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", color: "#2e7d32", fontSize: 16, fontWeight: 600 }}>Loading...</div>;
  if (!user) return <><LoginScreen onLogin={setUser} /><ToastContainer toasts={toasts} onDismiss={dismiss} /></>;

  const renderScreen = () => {
    if (!screen) return null;
    if (screen.type === "add_patient") return <PatientForm chwId={user.chwId} patientCount={patients.length} onCancel={() => setScreen(null)} onSave={(p) => { refreshData(); setScreen({ type: "patient_detail", data: p }); showToast("Patient added!"); }} />;
    if (screen.type === "edit_patient") return <PatientForm patient={screen.data} chwId={user.chwId} patientCount={patients.length} onCancel={() => setScreen({ type: "patient_detail", data: screen.data })} onSave={(p) => { refreshData(); setScreen({ type: "patient_detail", data: p }); showToast("Patient updated!"); }} />;
    if (screen.type === "patient_detail") {
      const p = patients.find(pt => pt.id === screen.data.id) || screen.data;
      return <PatientDetail patient={p} visits={visits} showToast={showToast} onBack={() => setScreen(null)} onEdit={() => setScreen({ type: "edit_patient", data: p })} onAddVisit={() => setScreen({ type: "schedule_visit", data: { patient: p } })} onCompleteVisit={(v) => setScreen({ type: "complete_visit", data: { visit: v, patient: p } })} onCancelVisit={async (vid) => { const v = visits.find(vv => vv.id === vid); if (v) { await dbPut("visits", { ...v, status: "cancelled", updated_at: new Date().toISOString() }); refreshData(); } }} />;
    }
    if (screen.type === "schedule_visit") return <ScheduleVisitForm patient={screen.data.patient} chwId={user.chwId} onCancel={() => setScreen({ type: "patient_detail", data: screen.data.patient })} onSave={() => { refreshData(); setScreen({ type: "patient_detail", data: screen.data.patient }); showToast("Visit scheduled!"); }} />;
    if (screen.type === "complete_visit") return <CompleteVisitForm visit={screen.data.visit} patient={screen.data.patient} onCancel={() => setScreen({ type: "patient_detail", data: screen.data.patient })} onSave={() => { refreshData(); setScreen({ type: "patient_detail", data: screen.data.patient }); showToast("Visit logged!"); }} />;
    if (screen.type === "complete_visit_from_list") return <CompleteVisitForm visit={screen.data.visit} patient={patients.find(p => p.id === screen.data.visit.patient_id) || { name: "Patient", id: screen.data.visit.patient_id }} onCancel={() => setScreen(null)} onSave={() => { refreshData(); setScreen(null); showToast("Visit logged!"); }} />;
    return null;
  };

  if (screen) return (
    <div style={{ fontFamily: "'Outfit', sans-serif", maxWidth: 600, margin: "0 auto", minHeight: "100vh", background: "#fafafa" }}>
      <ToastContainer toasts={toasts} onDismiss={dismiss} />
      {renderScreen()}
    </div>
  );

  return (
    <div style={{ fontFamily: "'Outfit', sans-serif", maxWidth: 600, margin: "0 auto", minHeight: "100vh", background: "#fafafa" }}>
      <ToastContainer toasts={toasts} onDismiss={dismiss} />
      <header style={{ background: "#2e7d32", padding: "12px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", position: "sticky", top: 0, zIndex: 99 }}>
        <span style={{ color: "#fff", fontSize: 18, fontWeight: 800 }}>MobiCare</span>
        <SyncIndicator isOnline={isOnline} pendingCount={pendingCount} />
      </header>
      <main>
        {tab === "dashboard" && <Dashboard visits={visits} patients={patients} onGoToVisits={(f) => { setVisitFilter(f); setTab("visits"); }} />}
        {tab === "patients" && <PatientList patients={patients} visits={visits} onSelect={(p) => setScreen({ type: "patient_detail", data: p })} onAdd={() => setScreen({ type: "add_patient" })} />}
        {tab === "visits" && <VisitsList visits={visits} patients={patients} initialFilter={visitFilter} onCompleteVisit={(v) => setScreen({ type: "complete_visit_from_list", data: { visit: v } })} />}
        {tab === "profile" && <Profile user={user} onLogout={handleLogout} pendingCount={pendingCount} isOnline={isOnline} />}
      </main>
      <BottomNav tab={tab} setTab={(t) => { setTab(t); setScreen(null); }} counts={{ overdue: overdueCounts }} />
    </div>
  );
}
