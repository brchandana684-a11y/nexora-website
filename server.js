const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const sqlite3 = require("sqlite3").verbose();
const crypto = require("crypto");

const app = express();
const PORT = process.env.PORT || 3000;

// Create database folder
const DATA_DIR = path.join(__dirname, "data");
fs.mkdirSync(DATA_DIR, { recursive: true });

const DB_FILE = path.join(DATA_DIR, "nexora.db");

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

// Connect to database
const db = new sqlite3.Database(DB_FILE, (err) => {
    if (err) {
        console.error("Database connection failed:", err.message);
        return;
    }

    console.log("NEXORA database connected successfully.");
});

function ensureColumn(tableName, columnName, columnDefinition) {
    db.all(`PRAGMA table_info(${tableName})`, (err, columns) => {
        if (err) {
            console.error(`Failed to inspect ${tableName}:`, err.message);
            return;
        }

        const hasColumn = columns && columns.some((column) => column.name === columnName);
        if (!hasColumn) {
            db.run(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnDefinition}`, (alterErr) => {
                if (alterErr && !/duplicate column name/i.test(alterErr.message)) {
                    console.error(`Migration for ${tableName}.${columnName} failed:`, alterErr.message);
                }
            });
        }
    });
}

// Create tables
db.serialize(() => {
    db.run(`
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            full_name TEXT NOT NULL,
            username TEXT NOT NULL UNIQUE,
            email TEXT NOT NULL UNIQUE,
            contact TEXT NOT NULL,
            password_hash TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS projects (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            name TEXT NOT NULL,
            description TEXT,
            status TEXT DEFAULT 'In Progress',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS tasks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            project_id INTEGER,
            title TEXT NOT NULL,
            description TEXT,
            priority TEXT DEFAULT 'Medium',
            status TEXT DEFAULT 'Pending',
            due_date TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS snippets (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            title TEXT NOT NULL,
            language TEXT,
            code TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS bugs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            title TEXT NOT NULL,
            description TEXT,
            priority TEXT DEFAULT 'Medium',
            status TEXT DEFAULT 'Open',
            assigned_to TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    ensureColumn("bugs", "assigned_to", "TEXT");

    db.run(`
        CREATE TABLE IF NOT EXISTS team (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            name TEXT NOT NULL,
            email TEXT,
            role TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);
});

// Health check
app.get("/api/health", (req, res) => {
    res.json({
        app: "NEXORA",
        message: "API is running",
        database: "SQLite"
    });
});

// Overview / dashboard / reports
app.get("/api/overview", (req, res) => {
    const queries = {
        projects: "SELECT COUNT(*) AS total FROM projects",
        tasks: "SELECT COUNT(*) AS total FROM tasks",
        completedTasks:
            "SELECT COUNT(*) AS total FROM tasks WHERE LOWER(TRIM(status)) = 'completed'",
        bugs: "SELECT COUNT(*) AS total FROM bugs",
        resolvedBugs:
            "SELECT COUNT(*) AS total FROM bugs WHERE LOWER(TRIM(status)) = 'resolved'",
        snippets: "SELECT COUNT(*) AS total FROM snippets",
        members: "SELECT COUNT(*) AS total FROM team"
    };

    const overview = {};
    const keys = Object.keys(queries);
    let remaining = keys.length;
    let hasError = false;

    keys.forEach((key) => {
        db.get(queries[key], [], (err, row) => {
            if (err) {
                console.error("Overview query failed:", err.message);

                if (!hasError) {
                    hasError = true;
                    res.status(500).json({
                        error: "Could not load Reports & Analytics."
                    });
                }
                return;
            }

            overview[key] = row ? row.total : 0;
            remaining--;

            if (remaining === 0 && !hasError) {
                res.json(overview);
            }
        });
    });
});

// Generic CRUD routes
function registerRoutes(endpoint, table, fields) {
    app.get(`/api/${endpoint}`, (req, res) => {
        const query = endpoint === "tasks"
            ? `SELECT tasks.*, projects.name AS project_name
               FROM tasks
               LEFT JOIN projects ON tasks.project_id = projects.id
               ORDER BY tasks.id DESC`
            : `SELECT * FROM ${table} ORDER BY id DESC`;

        db.all(query, [], (err, rows) => {
            if (err) {
                return res.status(500).json({ error: err.message });
            }

            res.json(rows);
        });
    });

    app.post(`/api/${endpoint}`, (req, res) => {
        const values = fields.map((field) => req.body[field] ?? null);
        const columns = fields.join(", ");
        const placeholders = fields.map(() => "?").join(", ");

        db.run(
            `INSERT INTO ${table} (${columns}) VALUES (${placeholders})`,
            values,
            function (err) {
                if (err) {
                    return res.status(400).json({ error: err.message });
                }

                db.get(
                    `SELECT * FROM ${table} WHERE id = ?`,
                    [this.lastID],
                    (selectErr, row) => {
                        if (selectErr) {
                            return res.status(500).json({
                                error: selectErr.message
                            });
                        }

                        res.status(201).json(row);
                    }
                );
            }
        );
    });

    app.put(`/api/${endpoint}/:id`, (req, res) => {
        const values = fields.map((field) => req.body[field] ?? null);
        const updates = fields.map((field) => `${field} = ?`).join(", ");

        db.run(
            `UPDATE ${table} SET ${updates} WHERE id = ?`,
            [...values, req.params.id],
            function (err) {
                if (err) {
                    return res.status(400).json({ error: err.message });
                }

                res.json({ updated: this.changes });
            }
        );
    });

    app.delete(`/api/${endpoint}/:id`, (req, res) => {
        db.run(
            `DELETE FROM ${table} WHERE id = ?`,
            [req.params.id],
            function (err) {
                if (err) {
                    return res.status(500).json({ error: err.message });
                }

                res.json({ deleted: this.changes });
            }
        );
    });
}

// Register module routes
registerRoutes("projects", "projects", [
    "user_id", "name", "description", "status"
]);

registerRoutes("tasks", "tasks", [
    "user_id", "project_id", "title", "description",
    "priority", "status", "due_date"
]);

registerRoutes("snippets", "snippets", [
    "user_id", "title", "language", "code"
]);

registerRoutes("bugs", "bugs", [
    "user_id", "title", "description", "priority", "status", "assigned_to"
]);

registerRoutes("team", "team", [
    "user_id", "name", "email", "role"
]);

// Register user
app.post("/api/register", (req, res) => {
    const { full_name, username, email, contact, password } = req.body;

    if (!full_name || !username || !email || !contact || !password) {
        return res.status(400).json({
            error: "Please fill in all fields."
        });
    }

    if (password.length < 6) {
        return res.status(400).json({
            error: "Password must contain at least 6 characters."
        });
    }

    const salt = crypto.randomBytes(16).toString("hex");
    const hash = crypto.scryptSync(password, salt, 64).toString("hex");
    const passwordHash = `${salt}:${hash}`;

    db.run(
        `INSERT INTO users
        (full_name, username, email, contact, password_hash)
        VALUES (?, ?, ?, ?, ?)`,
        [full_name, username, email, contact, passwordHash],
        function (err) {
            if (err) {
                return res.status(400).json({
                    error: "Username or email may already be registered."
                });
            }

            res.status(201).json({
                message: "Registration successful.",
                user: {
                    id: this.lastID,
                    full_name,
                    username,
                    email,
                    contact
                }
            });
        }
    );
});

// Login
app.post("/api/login", (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({
            error: "Enter your username/email and password."
        });
    }

    db.get(
        "SELECT * FROM users WHERE username = ? OR email = ?",
        [username, username],
        (err, user) => {
            if (err || !user) {
                return res.status(401).json({
                    error: "Invalid username/email or password."
                });
            }

            const parts = user.password_hash.split(":");
            const salt = parts[0];
            const savedHash = parts[1];

            const enteredHash = crypto
                .scryptSync(password, salt, 64)
                .toString("hex");

            const savedBuffer = Buffer.from(savedHash, "hex");
            const enteredBuffer = Buffer.from(enteredHash, "hex");

            if (
                savedBuffer.length !== enteredBuffer.length ||
                !crypto.timingSafeEqual(savedBuffer, enteredBuffer)
            ) {
                return res.status(401).json({
                    error: "Invalid username/email or password."
                });
            }

            res.json({
                message: "Login successful.",
                user: {
                    id: user.id,
                    full_name: user.full_name,
                    username: user.username,
                    email: user.email,
                    contact: user.contact
                }
            });
        }
    );
});

// Start server
app.listen(PORT, () => {
    console.log(`NEXORA backend running at http://localhost:${PORT}`);
});