const content=document.getElementById("content"), title=document.getElementById("pageTitle"), modal=document.getElementById("modal"), modalTitle=document.getElementById("modalTitle"), modalBody=document.getElementById("modalBody");
const pages={dashboard:"Dashboard",projects:"Projects",tasks:"Tasks",snippets:"Code Snippets",bugs:"Bug Tracking",team:"Team",reports:"Reports & Analytics"};
document.querySelectorAll(".nav").forEach(b=>b.onclick=()=>showPage(b.dataset.page));
async function api(url,opt){const r=await fetch(url,opt);const d=await r.json();if(!r.ok)throw new Error(d.error||"Request failed");return d}
function esc(v){return String(v??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]))}
function showPage(p){document.querySelectorAll(".nav").forEach(b=>b.classList.toggle("active",b.dataset.page===p));title.textContent=pages[p];({dashboard,projects,tasks,snippets,bugs,team,reports}[p])()}
function openModal(t,b){modalTitle.textContent=t;modalBody.innerHTML=b;modal.classList.remove("hidden")}
function closeModal(){modal.classList.add("hidden")}
async function dashboard(){const o=await api("/api/overview");content.innerHTML=`<div class="hero"><div><h2>Welcome to NEXORA</h2><p>A unified platform to organize software projects, tasks, code snippets, bugs, team collaboration and analytics in one workspace.</p></div><div class="hero-badge">SQLite database connected</div></div><div class="cards">${stat("Projects",o.projects)}${stat("Tasks",o.tasks)}${stat("Completed",o.completedTasks)}${stat("Open Bugs",o.bugs-o.resolvedBugs)}</div><div class="section-head"><h2>Six Core Modules</h2></div><div class="grid">${module("Project Management","Create and monitor software projects and their status.")}${module("Task Management","Assign work, priorities, deadlines and completion status.")}${module("Code Snippet Manager","Store reusable code with language-based organization.")}${module("Bug Tracking","Report, prioritize and resolve software issues.")}${module("Team Collaboration","Manage team members and development roles.")}${module("Reports & Analytics","Monitor progress using live project statistics.")}</div>`}
function stat(n,v){return `<div class="card stat"><div class="muted">${n}</div><div class="num">${v}</div><div class="muted">Live from database</div></div>`}
function module(n,p){return `<div class="module"><h3>${n}</h3><p>${p}</p></div>`}
async function projects(){const rows=await api("/api/projects");content.innerHTML=`<div class="section-head"><h2>Project Management</h2><button class="btn" onclick="projectForm()">+ New Project</button></div>${table(rows,["name","description","status","created_at"],"project")}`}
async function tasks(){const rows=await api("/api/tasks");content.innerHTML=`<div class="section-head"><h2>Task Management</h2><button class="btn" onclick="taskForm()">+ New Task</button></div>${table(rows,["title","priority","status","due_date","project_name"],"task")}`}
async function snippets(){const rows=await api("/api/snippets");content.innerHTML=`<div class="section-head"><h2>Code Snippet Manager</h2><button class="btn" onclick="snippetForm()">+ New Snippet</button></div>${table(rows,["title","language","code","created_at"],"snippet")}`}
async function bugs(){const rows=await api("/api/bugs");content.innerHTML=`<div class="section-head"><h2>Bug Tracking</h2><button class="btn" onclick="bugForm()">+ Report Bug</button></div>${table(rows,["title","priority","status","assigned_to","created_at"],"bug")}`}
async function team(){const rows=await api("/api/team");content.innerHTML=`<div class="section-head"><h2>Team Collaboration</h2><button class="btn" onclick="teamForm()">+ Add Member</button></div>${table(rows,["name","email","role","created_at"],"member")}`}
function table(rows,cols,type){if(!rows.length)return `<div class="table-wrap"><div class="empty">No records yet. Use the button above to add one.</div></div>`;return `<div class="table-wrap"><table class="table"><thead><tr>${cols.map(c=>`<th>${c.replace("_"," ")}</th>`).join("")}<th>Actions</th></tr></thead><tbody>${rows.map(r=>`<tr>${cols.map(c=>`<td>${c==="code"?`<code>${esc(r[c]).slice(0,70)}${String(r[c]).length>70?"…":""}</code>`:c==="status"?`<span class="pill">${esc(r[c])}</span>`:esc(r[c])}</td>`).join("")}<td class="actions"><button onclick='edit${cap(type)}(${JSON.stringify(r)})'>Edit</button><button onclick='del("${type}",${r.id})'>Delete</button></td></tr>`).join("")}</tbody></table></div>`}
const cap=s=>s[0].toUpperCase()+s.slice(1);
function projectForm(r={}){openModal(r.id?"Edit Project":"New Project",`<form onsubmit="saveProject(event,${r.id||0})"><div class="form-grid"><div class="field"><label>Project Name</label><input id="pname" required value="${esc(r.name)}"></div><div class="field"><label>Status</label><select id="pstatus"><option ${r.status==="Active"?"selected":""}>Active</option><option ${r.status==="Completed"?"selected":""}>Completed</option><option ${r.status==="On Hold"?"selected":""}>On Hold</option></select></div><div class="field full"><label>Description</label><textarea id="pdesc">${esc(r.description)}</textarea></div></div><br><button class="btn">Save Project</button></form>`)}
async function saveProject(e,id){e.preventDefault();await api(id?`/api/projects/${id}`:"/api/projects",{method:id?"PUT":"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({name:pname.value,description:pdesc.value,status:pstatus.value})});closeModal();projects()}
function editProject(r){projectForm(r)}
async function taskForm(r={}){const ps=await api("/api/projects");openModal(r.id?"Edit Task":"New Task",`<form onsubmit="saveTask(event,${r.id||0})"><div class="form-grid"><div class="field"><label>Title</label><input id="ttitle" required value="${esc(r.title)}"></div><div class="field"><label>Priority</label><select id="tpriority">${["Low","Medium","High","Critical"].map(x=>`<option ${r.priority===x?"selected":""}>${x}</option>`).join("")}</select></div><div class="field"><label>Status</label><select id="tstatus">${["Pending","In Progress","Completed"].map(x=>`<option ${r.status===x?"selected":""}>${x}</option>`).join("")}</select></div><div class="field"><label>Due Date</label><input id="tdue" type="date" value="${esc(r.due_date)}"></div><div class="field"><label>Project</label><select id="tproject"><option value="">No project</option>${ps.map(p=>`<option value="${p.id}" ${r.project_id==p.id?"selected":""}>${esc(p.name)}</option>`).join("")}</select></div><div class="field full"><label>Description</label><textarea id="tdesc">${esc(r.description)}</textarea></div></div><br><button class="btn">Save Task</button></form>`)}
async function saveTask(e,id){e.preventDefault();await api(id?`/api/tasks/${id}`:"/api/tasks",{method:id?"PUT":"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({title:ttitle.value,description:tdesc.value,priority:tpriority.value,status:tstatus.value,due_date:tdue.value,project_id:tproject.value||null})});closeModal();tasks()}
function editTask(r){taskForm(r)}
function snippetForm(r={}){openModal(r.id?"Edit Snippet":"New Code Snippet",`<form onsubmit="saveSnippet(event,${r.id||0})"><div class="field"><label>Title</label><input id="stitle" required value="${esc(r.title)}"></div><br><div class="field"><label>Language</label><input id="slang" required value="${esc(r.language)}" placeholder="JavaScript, Python, Java..."></div><br><div class="field"><label>Code</label><textarea id="scode" required>${esc(r.code)}</textarea></div><br><button class="btn">Save Snippet</button></form>`)}
async function saveSnippet(e,id){e.preventDefault();await api(id?`/api/snippets/${id}`:"/api/snippets",{method:id?"PUT":"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({title:stitle.value,language:slang.value,code:scode.value})});closeModal();snippets()}
function editSnippet(r){snippetForm(r)}
async function bugForm(r={}){const members=await api("/api/team");const memberOptions=`<option value="">Unassigned</option>${members.map(m=>`<option value="${esc(m.name)}" ${r.assigned_to===m.name?"selected":""}>${esc(m.name)}</option>`).join("")}`;openModal(r.id?"Edit Bug":"Report Bug",`<form onsubmit="saveBug(event,${r.id||0})"><div class="form-grid"><div class="field"><label>Bug Title</label><input id="btitle" required value="${esc(r.title)}"></div><div class="field"><label>Priority</label><select id="bpriority">${["Low","Medium","High","Critical"].map(x=>`<option ${r.priority===x?"selected":""}>${x}</option>`).join("")}</select></div><div class="field"><label>Status</label><select id="bstatus">${["Open","In Progress","Resolved"].map(x=>`<option ${r.status===x?"selected":""}>${x}</option>`).join("")}</select></div><div class="field"><label>Assigned To</label><select id="bassigned">${memberOptions}</select></div><div class="field full"><label>Description</label><textarea id="bdesc">${esc(r.description)}</textarea></div></div><br><button class="btn">Save Bug</button></form>`)}
async function saveBug(e,id){e.preventDefault();await api(id?`/api/bugs/${id}`:"/api/bugs",{method:id?"PUT":"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({title:btitle.value,description:bdesc.value,priority:bpriority.value,status:bstatus.value,assigned_to:bassigned.value||null})});closeModal();bugs()}
function editBug(r){bugForm(r)}
function teamForm(){openModal("Add Team Member",`<form onsubmit="saveMember(event)"><div class="form-grid"><div class="field"><label>Name</label><input id="mname" required></div><div class="field"><label>Email</label><input id="memail" type="email"></div><div class="field"><label>Role</label><input id="mrole" placeholder="Developer, Tester, Manager..."></div></div><br><button class="btn">Add Member</button></form>`)}
async function saveMember(e){e.preventDefault();await api("/api/team",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({name:mname.value,email:memail.value,role:mrole.value})});closeModal();team()}
async function del(type,id){if(!confirm("Delete this record?"))return;const map={project:"projects",task:"tasks",snippet:"snippets",bug:"bugs",member:"team"};await api(`/api/${map[type]}/${id}`,{method:"DELETE"});showPage(type==="project"?"projects":type==="task"?"tasks":type==="snippet"?"snippets":type==="bug"?"bugs":"team")}
async function reports(){const o=await api("/api/overview");const taskPct=o.tasks?Math.round(o.completedTasks/o.tasks*100):0;const bugPct=o.bugs?Math.round(o.resolvedBugs/o.bugs*100):0;content.innerHTML=`<div class="section-head"><h2>Reports & Analytics</h2></div><div class="report-grid"><div class="card"><div class="muted">Task Completion</div><div class="num">${taskPct}%</div><div class="bar"><i style="width:${taskPct}%"></i></div><p class="muted">${o.completedTasks} completed out of ${o.tasks} tasks</p></div><div class="card"><div class="muted">Bug Resolution</div><div class="num">${bugPct}%</div><div class="bar"><i style="width:${bugPct}%"></i></div><p class="muted">${o.resolvedBugs} resolved out of ${o.bugs} bugs</p></div><div class="card"><h3>Platform Summary</h3><ul class="feature-list"><li>${o.projects} projects</li><li>${o.tasks} tasks</li><li>${o.snippets} code snippets</li><li>${o.bugs} bugs</li><li>${o.members} team members</li></ul></div><div class="card"><h3>Purpose of NEXORA</h3><p class="muted">NEXORA brings common software development management activities into one unified web platform, reducing the need to manage separate records for projects, tasks, snippets, bugs, teams and reports.</p></div></div>`}
showPage("dashboard");

const authScreen = document.getElementById("authScreen");
const appScreen = document.getElementById("app");
const authMessage = document.getElementById("authMessage");

function applyTheme() {
  document.body.classList.remove("theme-ocean", "theme-violet", "theme-sunset", "theme-midnight");
  document.body.classList.add("theme-purple");
  localStorage.setItem("nexoraTheme", "purple");
}

applyTheme();

function showAuthForm(mode) {
  document.getElementById("loginForm").classList.toggle("hidden", mode !== "login");
  document.getElementById("registerForm").classList.toggle("hidden", mode !== "register");
  document.getElementById("loginTab").classList.toggle("active", mode === "login");
  document.getElementById("registerTab").classList.toggle("active", mode === "register");
  authMessage.textContent = "";
}

document.getElementById("loginForm").addEventListener("submit", async function (e) {
  e.preventDefault();
  authMessage.textContent = "Signing in...";

  try {
    const result = await api("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: document.getElementById("loginUsername").value.trim(),
        password: document.getElementById("loginPassword").value
      })
    });

    sessionStorage.setItem("nexoraUser", JSON.stringify(result.user));
    authScreen.classList.add("hidden");
    appScreen.classList.remove("hidden");
    authMessage.textContent = "";
    showPage("dashboard");
  } catch (error) {
    authMessage.textContent = error.message || "Login failed. Please try again.";
  }
});

document.getElementById("registerForm").addEventListener("submit", async function (e) {
  e.preventDefault();
  authMessage.textContent = "Creating your account...";

  try {
    const result = await api("/api/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        full_name: document.getElementById("regName").value.trim(),
        username: document.getElementById("regUsername").value.trim(),
        email: document.getElementById("regEmail").value.trim(),
        contact: document.getElementById("regContact").value.trim(),
        password: document.getElementById("regPassword").value
      })
    });

    showAuthForm("login");
    document.getElementById("loginUsername").value =
      document.getElementById("regUsername").value.trim();
    document.getElementById("loginPassword").value = "";
    authMessage.textContent = result.message + " Please log in.";
  } catch (error) {
    authMessage.textContent = error.message || "Registration failed.";
  }
});

document.getElementById("logoutButton").addEventListener("click", function () {
  sessionStorage.removeItem("nexoraUser");
  appScreen.classList.add("hidden");
  authScreen.classList.remove("hidden");
  document.getElementById("loginPassword").value = "";
  showAuthForm("login");
});

const usernameInput = document.getElementById("loginUsername");
const rememberCheckbox = document.getElementById("rememberUsername");

if (usernameInput && rememberCheckbox) {
    // Load the previously remembered username
    usernameInput.value = localStorage.getItem("nexoraRememberedUsername") || "";

    rememberCheckbox.checked = Boolean(usernameInput.value);

    // Save or remove the username when the checkbox changes
    rememberCheckbox.addEventListener("change", function () {
        if (rememberCheckbox.checked) {
            localStorage.setItem(
                "nexoraRememberedUsername",
                usernameInput.value.trim()
            );
        } else {
            localStorage.removeItem("nexoraRememberedUsername");
        }
    });

    // Update the saved username when the login form is submitted
    const loginForm = document.getElementById("loginForm");

    if (loginForm) {
        loginForm.addEventListener("submit", function () {
            if (rememberCheckbox.checked) {
                localStorage.setItem(
                    "nexoraRememberedUsername",
                    usernameInput.value.trim()
                );
            } else {
                localStorage.removeItem("nexoraRememberedUsername");
            }
        });
    }
}