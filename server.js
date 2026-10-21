
const express = require("express");
const cors = require("cors");
const path = require("path");
const sqlite3 = require("sqlite3").verbose();

const app = express();
const PORT = 3000;
const DB_FILE = path.join(__dirname, "data", "nexora.db");

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const db = new sqlite3.Database(DB_FILE);

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
  try { res.json(await all(`SELECT tasks.*, projects.name AS project_name FROM tasks LEFT JOIN projects ON projects.id=tasks.project_id ORDER BY tasks.id DESC`)); }
  catch (e) { res.status(500).json({ error: e.message }); }
});
app.post("/api/tasks", async (req, res) => {
  try {
    const { title, description, priority = "Medium", status = "Pending", due_date = "", project_id = null } = req.body;
    if (!title?.trim()) return res.status(400).json({ error: "Task title is required" });
    const r = await run(`INSERT INTO tasks (title,description,priority,status,due_date,project_id) VALUES (?,?,?,?,?,?)`,
      [title.trim(), description || "", priority, status, due_date || "", project_id || null]);
    res.status(201).json(await get("SELECT * FROM tasks WHERE id=?", [r.id]));
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.put("/api/tasks/:id", async (req, res) => {
  try {
    const { title, description, priority, status, due_date, project_id } = req.body;
    await run(`UPDATE tasks SET title=?,description=?,priority=?,status=?,due_date=?,project_id=? WHERE id=?`,
      [title, description || "", priority, status, due_date || "", project_id || null, req.params.id]);
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
