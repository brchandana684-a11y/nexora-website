# NEXORA — Final Working Project

NEXORA is a unified software development management platform with six modules:
1. Project Management
2. Task Management
3. Code Snippet Manager
4. Bug Tracking
5. Team Collaboration
6. Reports & Analytics

## Technology
- Frontend: HTML, CSS, JavaScript
- Backend: Node.js + Express
- Database: SQLite
- Database file: data/nexora.db (created automatically)

SQLite is used instead of MySQL so the project has no separate database server, password, or Workbench configuration.

## Run
Open this folder in VS Code, then open Terminal and run:

npm.cmd install
node server.js

Then open:

http://localhost:3000

The first run automatically creates the SQLite database and sample data.

## Health check
http://localhost:3000/api/health

## Notes
The `data/nexora.db` file is the real application database. It is created after the first successful start.
