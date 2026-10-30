
const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const sqlite3 = require("sqlite3").verbose();
const crypto = require("crypto");

const app = express();

const PORT = process.env.PORT || 3001;

// Create the database folder if it doesn't exist
const DATA_DIR = path.join(__dirname, "data");

if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Set the SQLite database path
const DB_FILE = path.join(DATA_DIR, "nexora.db");

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// Connect to the database
const db = new sqlite3.Database(DB_FILE, (err) => {
    if (err) {
        console.error("Database connection failed:", err.message);
    } else {
        console.log("NEXORA database connected successfully.");
    }
});

function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve({ id: this.lastID, changes: this.changes });
    });
  });
}

function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

async function initDb() {
  await run(`PRAGMA foreign_keys = ON`);

  await run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    username TEXT NOT NULL UNIQUE,
    contact TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  await run(`CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    status TEXT DEFAULT 'Active',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  await run(`CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT,
    priority TEXT DEFAULT 'Medium',
    status TEXT DEFAULT 'Pending',
    due_date TEXT,
    project_id INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE SET NULL
  )`);

  // Add task assignment support to existing databases without deleting current records.
  const taskColumns = await all("PRAGMA table_info(tasks)");
  if (!taskColumns.some((column) => column.name === "assigned_to")) {
    await run("ALTER TABLE tasks ADD COLUMN assigned_to TEXT DEFAULT ''");
  }

  await run(`CREATE TABLE IF NOT EXISTS snippets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    language TEXT NOT NULL,
    code TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  await run(`CREATE TABLE IF NOT EXISTS bugs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT,
    priority TEXT DEFAULT 'Medium',
    status TEXT DEFAULT 'Open',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  await run(`CREATE TABLE IF NOT EXISTS team (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT,
    role TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  const count = await get(`SELECT COUNT(*) AS count FROM projects`);
  if (count.count === 0) {
    const p = await run(
      `INSERT INTO projects (name, description, status) VALUES (?, ?, ?)`,
      ["NEXORA Demo Project", "Sample project for testing the platform.", "Active"]
    );
    await run(
      `INSERT INTO tasks (title, description, priority, status, due_date, project_id) VALUES (?, ?, ?, ?, ?, ?)`,
      ["Set up NEXORA", "Configure the application and database.", "High", "Completed", "", p.id]
    );
    await run(
      `INSERT INTO bugs (title, description, priority, status) VALUES (?, ?, ?, ?)`,
      ["Sample bug", "Example issue for demonstrating bug tracking.", "Low", "Open"]
    );
    await run(
      `INSERT INTO snippets (title, language, code) VALUES (?, ?, ?)`,
      ["Hello World", "JavaScript", "console.log('Hello NEXORA!');"]
    );
    await run(
      `INSERT INTO team (name, email, role) VALUES (?, ?, ?)`,
      ["Project Admin", "admin@nexora.local", "Administrator"]
    );
  }
}

app.get("/api/health", (req, res) => {
  res.json({ app: "NEXORA", status: "running", database: "SQLite" });
});

// Authentication: passwords are stored as salted scrypt hashes, never as plain text.
const activeTokens = new Map();
function makePasswordHash(password, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}
function verifyPassword(password, stored) {
  const [salt, original] = String(stored || "").split(":");
  if (!salt || !original) return false;
  const candidate = crypto.scryptSync(password, salt, 64);
  const expected = Buffer.from(original, "hex");
  return candidate.length === expected.length && crypto.timingSafeEqual(candidate, expected);
}
app.post("/api/auth/register", async (req, res) => {
  try {
    const { name, username, contact, password } = req.body || {};
    if (!name?.trim() || !username?.trim() || !contact?.trim() || !password) {
      return res.status(400).json({ error: "Please fill in all fields." });
    }
    if (username.trim().length < 3) return res.status(400).json({ error: "Username must be at least 3 characters." });
    if (password.length < 6) return res.status(400).json({ error: "Password must be at least 6 characters." });
    const exists = await get("SELECT id FROM users WHERE lower(username)=lower(?)", [username.trim()]);
    if (exists) return res.status(409).json({ error: "That username is already registered. Please log in instead." });
    // Support both the current users schema and older project databases.
    const userColumns = await all("PRAGMA table_info(users)");
    const columnNames = new Set(userColumns.map(c => c.name));
    if (columnNames.has("full_name") && columnNames.has("email")) {
      const safeEmail = `${username.trim().toLowerCase().replace(/[^a-z0-9._-]/g, ".")}@nexora.local`;
      await run("INSERT INTO users (full_name, username, email, contact, password_hash) VALUES (?, ?, ?, ?, ?)",
        [name.trim(), username.trim(), safeEmail, contact.trim(), makePasswordHash(password)]);
    } else {
      await run("INSERT INTO users (name, username, contact, password_hash) VALUES (?, ?, ?, ?)",
        [name.trim(), username.trim(), contact.trim(), makePasswordHash(password)]);
    }
    res.status(201).json({ success: true, message: "Registration successful. Please log in." });
  } catch (e) {
    if (String(e.message).includes("UNIQUE")) return res.status(409).json({ error: "That username is already registered. Please log in instead." });
    console.error("NEXORA registration failed:", e);
    res.status(500).json({ error: "Could not register this account. Check the VS Code terminal for details." });
  }
});
app.post("/api/auth/login", async (req, res) => {
  try {
    const { username, password } = req.body || {};
    if (!username?.trim() || !password) return res.status(400).json({ error: "Enter your username and password." });
    const userColumns = await all("PRAGMA table_info(users)");
    const columnNames = new Set(userColumns.map(c => c.name));
    const displayNameColumn = columnNames.has("name") ? "name" : "full_name";
    const user = await get(`SELECT id, ${displayNameColumn} AS name, username, password_hash FROM users WHERE lower(username)=lower(?)`, [username.trim()]);
    if (!user || !verifyPassword(password, user.password_hash)) return res.status(401).json({ error: "Incorrect username or password." });
    const token = crypto.randomBytes(32).toString("hex");
    activeTokens.set(token, { id: user.id, name: user.name, username: user.username });
    res.json({ token, user: { name: user.name, username: user.username } });
  } catch (e) { console.error("NEXORA login failed:", e); res.status(500).json({ error: "Could not log in right now. Check the VS Code terminal for details." }); }
});
app.post("/api/auth/logout", (req, res) => {
  const token = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  activeTokens.delete(token);
  res.json({ success: true });
});
app.get("/api/auth/me", (req, res) => {
  const token = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  const user = activeTokens.get(token);
  if (!user) return res.status(401).json({ error: "Please log in." });
  res.json({ user });
});

// Require login for application data APIs.
app.use("/api", (req, res, next) => {
  if (req.path === "/health" || req.path.startsWith("/auth/")) return next();
  const token = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  const user = activeTokens.get(token);
  if (!user) return res.status(401).json({ error: "Please log in to access NEXORA." });
  req.user = user;
  next();
});

app.get("/api/projects", async (req, res) => {
  try { res.json(await all("SELECT * FROM projects ORDER BY id DESC")); }
  catch (e) { res.status(500).json({ error: e.message }); }
});
app.post("/api/projects", async (req, res) => {
  try {
    const { name, description, status = "Active" } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: "Project name is required" });
    const r = await run("INSERT INTO projects (name, description, status) VALUES (?, ?, ?)", [name.trim(), description || "", status]);
    res.status(201).json(await get("SELECT * FROM projects WHERE id = ?", [r.id]));
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.put("/api/projects/:id", async (req, res) => {
  try {
    const { name, description, status } = req.body;
    await run("UPDATE projects SET name=?, description=?, status=? WHERE id=?", [name, description || "", status, req.params.id]);
    res.json(await get("SELECT * FROM projects WHERE id=?", [req.params.id]));
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.delete("/api/projects/:id", async (req, res) => {
  try { await run("DELETE FROM projects WHERE id=?", [req.params.id]); res.json({ success: true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.get("/api/tasks", async (req, res) => {
  try {
    res.json(await all(`SELECT tasks.*, projects.name AS project_name
      FROM tasks LEFT JOIN projects ON projects.id=tasks.project_id
      ORDER BY tasks.id DESC`));
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.post("/api/tasks", async (req, res) => {
  try {
    const { title, description, priority = "Medium", status = "Pending",
      due_date = "", project_id = null, assigned_to = "" } = req.body;
    if (!title?.trim()) return res.status(400).json({ error: "Task title is required" });
    const r = await run(`INSERT INTO tasks
      (title,description,priority,status,due_date,project_id,assigned_to)
      VALUES (?,?,?,?,?,?,?)`,
      [title.trim(), description || "", priority, status, due_date || "",
        project_id || null, assigned_to || ""]);
    res.status(201).json(await get("SELECT * FROM tasks WHERE id=?", [r.id]));
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.put("/api/tasks/:id", async (req, res) => {
  try {
    const { title, description, priority, status, due_date, project_id, assigned_to = "" } = req.body;
    await run(`UPDATE tasks SET title=?,description=?,priority=?,status=?,due_date=?,
      project_id=?,assigned_to=? WHERE id=?`,
      [title, description || "", priority, status, due_date || "",
        project_id || null, assigned_to || "", req.params.id]);
    res.json(await get("SELECT * FROM tasks WHERE id=?", [req.params.id]));
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.delete("/api/tasks/:id", async (req, res) => {
  try { await run("DELETE FROM tasks WHERE id=?", [req.params.id]); res.json({ success: true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.get("/api/snippets", async (req, res) => {
  try { res.json(await all("SELECT * FROM snippets ORDER BY id DESC")); }
  catch (e) { res.status(500).json({ error: e.message }); }
});
app.post("/api/snippets", async (req, res) => {
  try {
    const { title, language, code } = req.body;
    if (!title?.trim() || !language?.trim() || !code?.trim()) return res.status(400).json({ error: "Title, language and code are required" });
    const r = await run("INSERT INTO snippets (title,language,code) VALUES (?,?,?)", [title.trim(), language.trim(), code]);
    res.status(201).json(await get("SELECT * FROM snippets WHERE id=?", [r.id]));
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.put("/api/snippets/:id", async (req, res) => {
  try {
    const { title, language, code } = req.body;
    await run("UPDATE snippets SET title=?,language=?,code=? WHERE id=?", [title, language, code, req.params.id]);
    res.json(await get("SELECT * FROM snippets WHERE id=?", [req.params.id]));
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.delete("/api/snippets/:id", async (req, res) => {
  try { await run("DELETE FROM snippets WHERE id=?", [req.params.id]); res.json({ success: true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.get("/api/bugs", async (req, res) => {
  try { res.json(await all("SELECT * FROM bugs ORDER BY id DESC")); }
  catch (e) { res.status(500).json({ error: e.message }); }
});
app.post("/api/bugs", async (req, res) => {
  try {
    const { title, description, priority = "Medium", status = "Open" } = req.body;
    if (!title?.trim()) return res.status(400).json({ error: "Bug title is required" });
    const r = await run("INSERT INTO bugs (title,description,priority,status) VALUES (?,?,?,?)", [title.trim(), description || "", priority, status]);
    res.status(201).json(await get("SELECT * FROM bugs WHERE id=?", [r.id]));
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.put("/api/bugs/:id", async (req, res) => {
  try {
    const { title, description, priority, status } = req.body;
    await run("UPDATE bugs SET title=?,description=?,priority=?,status=? WHERE id=?", [title, description || "", priority, status, req.params.id]);
    res.json(await get("SELECT * FROM bugs WHERE id=?", [req.params.id]));
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.delete("/api/bugs/:id", async (req, res) => {
  try { await run("DELETE FROM bugs WHERE id=?", [req.params.id]); res.json({ success: true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.get("/api/team", async (req, res) => {
  try { res.json(await all("SELECT * FROM team ORDER BY id DESC")); }
  catch (e) { res.status(500).json({ error: e.message }); }
});
app.post("/api/team", async (req, res) => {
  try {
    const { name, email, role } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: "Member name is required" });
    const r = await run("INSERT INTO team (name,email,role) VALUES (?,?,?)", [name.trim(), email || "", role || "Member"]);
    res.status(201).json(await get("SELECT * FROM team WHERE id=?", [r.id]));
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.delete("/api/team/:id", async (req, res) => {
  try { await run("DELETE FROM team WHERE id=?", [req.params.id]); res.json({ success: true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.get("/api/overview", async (req, res) => {
  try {
    const [projects, tasks, completed, bugs, resolved, members, snippets] = await Promise.all([
      get("SELECT COUNT(*) count FROM projects"),
      get("SELECT COUNT(*) count FROM tasks"),
      get("SELECT COUNT(*) count FROM tasks WHERE status='Completed'"),
      get("SELECT COUNT(*) count FROM bugs"),
      get("SELECT COUNT(*) count FROM bugs WHERE status='Resolved'"),
      get("SELECT COUNT(*) count FROM team"),
      get("SELECT COUNT(*) count FROM snippets")
    ]);
    res.json({
      projects: projects.count,
      tasks: tasks.count,
      completedTasks: completed.count,
      bugs: bugs.count,
      resolvedBugs: resolved.count,
      members: members.count,
      snippets: snippets.count
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

initDb().then(() => {
  app.listen(PORT, () => console.log(`NEXORA is running at http://localhost:${PORT}`));
}).catch(err => {
  console.error("Database initialization failed:", err);
  process.exit(1);
});
