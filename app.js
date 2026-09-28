(() => {
if (!window.supabase) return;
const sb = window.supabase.createClient(window.EDU_UGANDA_CONFIG.supabaseUrl, window.EDU_UGANDA_CONFIG.supabasePublishableKey);

const S = {
  session: null,
  profile: null,
  isAdmin: false,
  videos: [],
  subjects: [],
  classes: [],
  settings: { payments_enabled: false, mtn: "0770000000", airtel: "0750000000", bank_name: "Stanbic Bank Uganda", bank_account: "0100000000", bank_holder: "EduUganda Ltd", live_enabled: false, live_title: "Physics Revision", live_class: "", live_date: "", live_start: "10:00", live_end: "11:00", live_url: "" },
  progress: [],
  users: [],
  groups: [],
  groupMembers: [],
  revenueTotal: 0
};

function esc(v = "") { return String(v).replace(/[&<>"']/g, m => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[m])); }
function toast(msg) { const r = document.getElementById("toast-root"); r.innerHTML = `<div class="toast">${esc(msg)}</div>`; setTimeout(() => r.innerHTML = "", 2600); }
function money(n) { return new Intl.NumberFormat("en-UG").format(n) + " UGX"; }
function classesFor(level) { return level === "Nursery" ? ["Baby", "Middle", "Top"] : level === "Primary" ? ["P1", "P2", "P3", "P4", "P5", "P6", "P7"] : ["S1", "S2", "S3", "S4", "S5", "S6"]; }
function initials(name) { return (name || "AJ").split(/\s+/).map(x => x[0]).slice(0, 2).join("").toUpperCase(); }
function logo() { return `<div class="logo"><div class="logo-mark"><img src="assets/logo.svg" style="width:36px;height:36px"></div><span>Edu<span style="color:#fbbf24">Uganda</span></span></div>`; }

// ---------- DATA LOADERS ----------
async function loadProfile() {
  if (!S.session) { S.profile = null; return; }
  const { data, error } = await sb.from("profiles").select("*").eq("id", S.session.user.id).maybeSingle();
  if (error) console.error("Profile lookup failed:", error);
  S.profile = error ? null : data;
  S.isAdmin = !!S.profile?.is_admin;
}
async function loadStaticData() {
  const [{ data: subs }, { data: cls }, { data: set }] = await Promise.all([
    sb.from("subjects").select("name").order("name"),
    sb.from("classes").select("name").order("sort_order"),
    sb.from("settings").select("*").eq("id", 1).single()
  ]);
  S.subjects = (subs || []).map(x => x.name);
  S.classes = (cls || []).map(x => x.name);
  if (set) S.settings = set;
}
async function loadVideos() {
  const { data } = await sb.from("videos").select("*").order("created_at", { ascending: false });
  S.videos = data || [];
}
async function loadProgress() {
  if (!S.profile) return;
  const { data } = await sb.from("watch_progress").select("video_id").eq("user_id", S.profile.id);
  S.progress = (data || []).map(x => x.video_id);
}
async function loadAdminData() {
  const [{ data: users }, { data: payments }, { data: groups }] = await Promise.all([
    sb.from("profiles").select("*").order("created_at", { ascending: false }),
    sb.from("payments").select("amount"),
    sb.from("discussion_groups").select("*").order("created_at", { ascending: false })
  ]);
  S.users = users || [];
  S.groups = groups || [];
  S.revenueTotal = (payments || []).reduce((a, p) => a + Number(p.amount || 0), 0);
}

async function loadGroups() {
  const { data: groups } = await sb.from("discussion_groups").select("*").order("created_at", { ascending: false });
  const { data: members } = await sb.from("group_members").select("group_id, user_id");
  S.groups = groups || [];
  S.groupMembers = members || [];
}

// ---------- SHELL / NAV ----------
function searchQuery() { const query = new URLSearchParams(location.hash.split("?")[1] || ""); return query.get("q") || ""; }
function topbar(admin = false) { return `<header class="topbar">${logo()}<div class="search"><span>⌕</span><input id="global-search" placeholder="${admin ? "Search students, groups, lessons..." : "Search topics, lessons, subjects..."}" value="${esc(searchQuery())}"></div><div style="flex:1"></div>${admin ? `<span class="pill yellow">ADMIN</span>` : `<button class="icon-btn" onclick="go('notifications')" title="Notifications">🔔</button><button class="avatar" onclick="go('profile')">${initials(S.profile?.name)}</button>`}</header>`; }
function sidebar() { return `<aside class="sidebar">
  <div class="side-title">Learning</div>
  <button class="nav-btn active" onclick="go('dashboard')">⌂ <span>Home</span></button>
  <button class="nav-btn" onclick="go('videos')">▶ <span>Videos</span></button>
  <button class="nav-btn" onclick="go('notes')">▤ <span>Class Notes</span></button>
  <button class="nav-btn" onclick="go('groups')">👥 <span>Discussion Groups</span></button>
  <button class="nav-btn" onclick="go('live')">◉ <span>Live Classes</span></button>
  <div class="side-title">Levels</div>
  ${["Nursery", "Primary", "Secondary"].map(l => `<button class="nav-btn" onclick="filterLevel('${l}')">▸ <span>${l}</span></button>`).join("")}
  <div class="side-title">My account</div>
  <button class="nav-btn" onclick="go('profile')">● <span>Profile</span></button>
  <button class="nav-btn" onclick="logout()">↪ <span>Logout</span></button>
</aside>`; }
function bottom() { return `<nav class="bottom-nav"><button onclick="go('dashboard')" class="active">⌂<br>Home</button><button onclick="go('videos')">▶<br>Videos</button><button onclick="go('notes')">▤<br>Notes</button><button onclick="go('groups')">👥<br>Groups</button><button onclick="go('live')">◉<br>Live</button></nav>`; }
function requireUser() { if (!S.session || !S.profile) { renderAuth("login"); return false; } if (S.settings.payments_enabled && !S.profile.paid && !S.profile.is_admin) { renderPayment(); return false; } return true; }
function shell(content) { document.getElementById("app").innerHTML = `<div class="app-shell">${topbar()}<div class="layout">${sidebar()}<main class="main">${content}</main></div>${bottom()}</div>`; bindSearch(); }
function bindSearch() { const el = document.getElementById("global-search"); if (el) el.addEventListener("keydown", e => { if (e.key !== "Enter") return; const query = el.value.trim(); location.hash = S.isAdmin ? "#/admin?q=" + encodeURIComponent(query) : "#/videos?q=" + encodeURIComponent(query); }); }

// ---------- AUTH SCREENS ----------
function renderAuth(mode = "login") {
  document.getElementById("app").innerHTML = `<div class="auth-wrap"><div class="auth-card">${logo()}<div style="height:18px"></div>${mode === "register" ? registerForm() : mode === "forgot" ? forgotForm() : loginForm()}</div></div>`;
}
function loginForm() { return `<h1 style="font-size:28px;margin:18px 0 5px">Welcome back</h1><p class="muted">Sign in to continue learning with EduUganda.</p>
<form onsubmit="login(event)"><div class="field"><label>Email</label><input id="login-email" type="email" required placeholder="you@example.com"></div><div class="field"><label>Password</label><input id="login-password" type="password" required placeholder="••••••••"></div><div class="row space" style="margin:12px 0 18px"><button type="button" class="link-btn" onclick="renderAuth('forgot')">Forgot password?</button><span class="small muted">New student?</span></div><button class="btn btn-primary btn-wide">Login</button></form><button class="btn btn-ghost btn-wide" style="margin-top:10px" onclick="renderAuth('register')">Create student account</button>`; }
function registerForm() { return `<h1 style="font-size:28px;margin:18px 0 5px">Create your account</h1><p class="muted">Choose your level and class to personalize your learning path.</p>
<form onsubmit="register(event)"><div class="field"><label>Full Name</label><input id="reg-name" required></div><div class="field"><label>Email</label><input id="reg-email" type="email" required></div><div class="field"><label>Phone Number</label><input id="reg-phone" required placeholder="07XXXXXXXX"></div><div class="field"><label>Password</label><input id="reg-password" type="password" minlength="6" required></div><div class="field"><label>Level</label><select id="reg-level" onchange="updateClassOptions()" required><option value="">Select level</option><option>Nursery</option><option>Primary</option><option>Secondary</option></select></div><div class="field"><label>Class</label><select id="reg-class" required><option value="">Select level first</option></select></div><button class="btn btn-primary btn-wide">Create account</button></form><button class="btn btn-ghost btn-wide" style="margin-top:10px" onclick="renderAuth('login')">Back to login</button>`; }
function availableClasses() { return S.classes.length ? S.classes : [...new Set([...classesFor("Nursery"), ...classesFor("Primary"), ...classesFor("Secondary")])]; }
function updateClassOptions() { document.getElementById("reg-class").innerHTML = availableClasses().map(c => `<option>${esc(c)}</option>`).join(""); }
function forgotForm() { return `<h1 style="font-size:28px;margin:18px 0 5px">Reset password</h1><p class="muted">Enter your account email and we'll send you a reset link.</p><form onsubmit="forgot(event)"><div class="field"><label>Email</label><input id="forgot-email" type="email" required></div><button class="btn btn-primary btn-wide">Send reset link</button></form><button class="btn btn-ghost btn-wide" style="margin-top:10px" onclick="renderAuth('login')">Back to login</button>`; }

async function register(e) {
  e.preventDefault();
  const name = document.getElementById("reg-name").value.trim();
  const email = document.getElementById("reg-email").value.trim().toLowerCase();
  const phone = document.getElementById("reg-phone").value.trim();
  const password = document.getElementById("reg-password").value;
  const level = document.getElementById("reg-level").value;
  const klass = document.getElementById("reg-class").value;
  const { data, error } = await sb.auth.signUp({ email, password, options: { data: { name, phone, level, class: klass } } });
  if (error) { toast(error.message); return; }
  if (data.session) {
    S.session = data.session;
    await loadProfile();
    (S.settings.payments_enabled && !S.profile?.paid) ? renderPayment() : go("dashboard");
  } else {
    toast("Account created. Check your email to confirm it, then log in.");
    renderAuth("login");
  }
}
async function login(e) {
  e.preventDefault();
  const email = document.getElementById("login-email").value.trim().toLowerCase();
  const password = document.getElementById("login-password").value;
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error) {
    console.error("Login failed:", error);
    const message = error.message === "Invalid login credentials"
      ? "Email or password is incorrect. Reset the password in Supabase, then try again."
      : error.message;
    toast(message);
    return;
  }
  S.session = data.session;
  await loadProfile();
  if (!S.profile) { toast("Could not load your profile."); return; }
  if (S.profile.disabled) { toast("This account has been disabled."); await logout(); return; }
  if (S.profile.is_admin) { go("admin"); return; }
  (S.settings.payments_enabled && !S.profile.paid) ? renderPayment() : go("dashboard");
}
async function forgot(e) {
  e.preventDefault();
  const email = document.getElementById("forgot-email").value.trim();
  const { error } = await sb.auth.resetPasswordForEmail(email);
  toast(error ? "Could not send reset email." : "Password reset instructions have been sent to your email.");
  renderAuth("login");
}
async function logout() {
  await sb.auth.signOut();
  S.session = null; S.profile = null; S.isAdmin = false; S.videos = []; S.progress = []; S.users = [];
  location.hash = "#/login"; renderAuth("login");
}

// ---------- PAYMENT ----------
function momoFields() { return `<div class="field"><label>Network</label><select id="pay-network"><option>MTN MoMo</option><option>Airtel Money</option></select></div><div class="field"><label>Mobile Money phone</label><input id="pay-phone" value="${esc(S.profile.phone || "")}" placeholder="07XXXXXXXX"></div><div class="notice">A payment prompt would be sent to this number when a live mobile-money backend is connected.</div>`; }
function cardFields() { return `<div class="field"><label>Cardholder name</label><input id="card-name" placeholder="JOHN DOE"></div><div class="field"><label>Card number</label><input id="card-number" inputmode="numeric" maxlength="19" placeholder="4242 4242 4242 4242"></div><div class="row"><div class="field" style="flex:1"><label>Expiry</label><input id="card-exp" placeholder="12/30"></div><div class="field" style="flex:1"><label>CVV</label><input id="card-cvv" maxlength="4" placeholder="123"></div></div><div class="notice">Test UI: use 4242 4242 4242 4242 for a successful test-card flow.</div>`; }
function selectPay(kind) { document.getElementById("momo-method").classList.toggle("selected", kind === "momo"); document.getElementById("card-method").classList.toggle("selected", kind === "card"); document.getElementById("pay-fields").innerHTML = kind === "momo" ? momoFields() : cardFields(); }
function renderPayment() {
  const prices = { Nursery: 30000, Primary: 50000, Secondary: 70000 }, amount = prices[S.profile.level] || 70000;
  document.getElementById("app").innerHTML = `<div class="auth-wrap"><div class="auth-card payment">${logo()}<div class="row space" style="margin-top:20px"><div><h1 style="font-size:27px;margin:0">Complete term payment</h1><p class="muted">Unlock your ${esc(S.profile.level)} ${esc(S.profile.class)} learning dashboard.</p></div><div class="price">${money(amount)}</div></div>
<div class="notice" style="margin:16px 0">Payment is required before lesson videos are unlocked. Choose a payment method below.</div>
<div class="method-grid"><div class="method selected" id="momo-method" onclick="selectPay('momo')"><b>📱 Mobile Money</b><div class="small muted">MTN MoMo or Airtel Money</div></div><div class="method" id="card-method" onclick="selectPay('card')"><b>💳 Visa / Mastercard</b><div class="small muted">Secure card test interface</div></div></div>
<div id="pay-fields" style="margin-top:15px">${momoFields()}</div>
<button class="btn btn-primary btn-wide" onclick="completePayment(${amount})">Pay ${money(amount)}</button>
<div class="row space" style="margin-top:13px"><span class="small muted">Account: ${esc(S.profile.email)}</span><button class="link-btn small" onclick="logout()">Cancel</button></div></div></div>`;
}
async function completePayment(amount) {
  const method = document.getElementById("card-number") ? "Card" : "Mobile Money";
  const { error: payErr } = await sb.from("payments").insert({ user_id: S.profile.id, amount, method });
  const { error: profErr } = await sb.from("profiles").update({ paid: true, paid_at: new Date().toISOString() }).eq("id", S.profile.id);
  if (payErr || profErr) { toast("Payment could not be recorded. Please try again."); return; }
  S.profile.paid = true;
  toast("Payment successful. Your student dashboard is now unlocked.");
  setTimeout(() => { location.hash = "#/dashboard"; renderRoute(); }, 350);
}

// ---------- STUDENT PAGES ----------
function hero() { const u = S.profile; return `<section class="hero"><div class="hero-copy"><div style="font-size:17px">Good morning,</div><h1>${esc(u.name)} 👋</h1><p>"A little progress each day adds up to big results."</p><div style="height:7px;width:78px;border-radius:10px;background:#fbbf24;margin-top:20px"></div></div><div class="hero-badge"><div style="font-size:30px">🇺🇬</div><div class="muted" style="color:#fff;margin-top:8px">Current class</div><strong style="font-size:22px">${esc(u.level)}</strong><div style="font-size:22px">${esc(u.class)}</div><button class="btn btn-yellow" style="margin-top:14px" onclick="go('profile')">⇄ Change Class</button></div></section>`; }
function liveDetails() {
  const set = S.settings;
  return { title: set.live_title || "Live Class", klass: set.live_class || S.profile.class, date: set.live_date || "", start: set.live_start || "", end: set.live_end || "", url: set.live_url || "" };
}
function liveLabel(date) {
  if (!date) return "Schedule to be announced";
  const parsed = new Date(`${date}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? date : parsed.toLocaleDateString("en-UG", { weekday: "long", month: "short", day: "numeric" });
}
async function dashboard() {
  if (!requireUser()) return;
  await loadVideos(); await loadProgress();
  const u = S.profile, rec = S.videos.filter(v => v.class === u.class).slice(0, 3);
  const vids = rec.length ? rec : S.videos.slice(0, 3);
  const watched = S.progress;
  shell(`${hero()}<section class="section"><div class="quick-grid">
<button class="quick-card q-red" onclick="go('videos')"><div class="quick-icon">▶</div><div>Watch<br>Videos</div></button>
<button class="quick-card q-blue" onclick="go('notes')"><div class="quick-icon">▤</div><div>Class<br>Notes</div></button>
<button class="quick-card q-green" onclick="go('groups')"><div class="quick-icon">👥</div><div>Discussion<br>Groups</div></button>
<button class="quick-card q-purple" onclick="go('live')"><div class="quick-icon">◉</div><div>Live<br>Classes</div></button></div></section>
<section class="section"><div class="section-head"><h2>⭐ Recommended for You</h2><button class="link-btn" onclick="go('videos')">View all →</button></div><div class="video-grid">${vids.map(videoCard).join("")}</div></section>
<section class="section"><div class="section-head"><h2>📘 Your Subjects</h2><button class="link-btn" onclick="go('videos')">See all subjects →</button></div><div class="subject-grid">${S.subjects.slice(0, 6).map((s, i) => subjectCard(s, i)).join("")}</div></section>
<section class="section"><div class="section-head"><h2>📡 Upcoming Live Classes</h2><button class="link-btn" onclick="go('live')">View all →</button></div>${S.settings.live_enabled ? (() => { const live = liveDetails(); return `<div class="card row space"><div><b>${esc(live.title)} (${esc(live.klass)})</b><div class="muted">${esc(liveLabel(live.date))} · ${esc(live.start)} - ${esc(live.end)}</div></div><button class="btn btn-green" onclick="joinLive()">Join Live</button></div>`; })() : `<div class="card"><span class="muted">No live class is currently scheduled.</span></div>`}</section>
<section class="section"><div class="section-head"><h2>◷ Your Recent Activity</h2><button class="link-btn" onclick="go('videos')">View all →</button></div><div class="card">${S.videos.slice(0, 1).map(v => `<div class="row space"><div><b>${esc(v.title)}</b><div class="muted">${esc(v.subject)} · ${esc(v.class)}</div></div><div style="width:180px"><div class="row space small"><span>Watched ${watched.includes(v.id) ? 100 : 80}%</span></div><div class="progress"><i style="width:${watched.includes(v.id) ? 100 : 80}%"></i></div></div></div>`).join("")}</div></section>`);
}
function subjectCard(s, i) { const icons = ["√x", "🍃", "⚗", "⚛", "▤", "🌐"]; return `<button class="subject-card" onclick="filterSubject('${esc(s)}')"><div class="subject-icon" style="background:${["#e8f2ff", "#e9faee", "#fff0dc", "#ffecec", "#f1eaff", "#e6fbfa"][i % 6]}">${icons[i % 6]}</div><div style="text-align:left"><b>${esc(s)}</b><div class="muted small">${36 + i * 3} lessons</div></div><span style="margin-left:auto;color:#94a3b8">›</span></button>`; }
function videoCard(v) { return `<article class="video-card" onclick="openVideo('${v.id}')"><div class="thumb">${v.thumb ? `<img src="${esc(v.thumb)}">` : `<div class="thumb-fallback">${esc(v.subject)}<br>${esc(v.title)}</div>`}<span class="duration">${esc(v.duration || "12:00")}</span></div><div class="video-info"><h3>${esc(v.title)}</h3><div class="meta">${esc(v.subject)} · ${esc(v.class)} · ${esc(v.views || "New")} views</div></div></article>`; }
async function videosPage() {
  if (!requireUser()) return;
  await loadVideos();
  const p = new URLSearchParams(location.hash.split("?")[1] || ""), q = (p.get("q") || "").toLowerCase();
  const subject = p.get("subject") || "", level = p.get("level") || "";
  let arr = S.videos.filter(v => (!q || Object.values(v).some(x => String(x).toLowerCase().includes(q))) && (!subject || v.subject === subject) && (!level || v.class === level));
  shell(`<section class="section" style="padding-top:20px"><div class="section-head"><div><h2>${q ? "Search results" : "Video lessons"}</h2><div class="muted small">${arr.length} lesson${arr.length === 1 ? "" : "s"} available</div></div><div class="row"><select onchange="filterLevel(this.value)" style="border:1px solid var(--line);padding:9px;border-radius:10px"><option value="">All classes</option>${S.classes.map(c => `<option ${level === c ? "selected" : ""}>${c}</option>`).join("")}</select></div></div>${arr.length ? `<div class="video-grid">${arr.map(videoCard).join("")}</div>` : `<div class="card empty">No lessons matched your search.</div>`}</section>`);
}
function filterLevel(l) { if (!l) { go("videos"); return; } location.hash = "#/videos?level=" + encodeURIComponent(l); }
function filterSubject(s) { location.hash = "#/videos?subject=" + encodeURIComponent(s); }
async function openVideo(id) { if (!requireUser()) return; location.hash = "#/video/" + id; }
async function playerPage(id) {
  if (!requireUser()) return;
  if (!S.videos.length) await loadVideos();
  await loadProgress();
  const v = S.videos.find(x => x.id === id) || S.videos[0];
  if (!v) { toast("No lessons available yet."); go("dashboard"); return; }
  if (!S.progress.includes(v.id)) { await sb.from("watch_progress").upsert({ user_id: S.profile.id, video_id: v.id }); S.progress.push(v.id); }
  const next = S.videos[(S.videos.findIndex(x => x.id === v.id) + 1) % S.videos.length];
  shell(`<section class="section" style="padding-top:20px"><div class="player-layout"><div><div class="video-player"><iframe src="${esc(v.url)}?rel=0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe></div><h1 style="font-size:26px;margin:16px 0 6px">${esc(v.title)}</h1><div class="muted">${esc(v.subject)} · ${esc(v.class)} · ${esc(v.topic)}</div><p style="line-height:1.6">${esc(v.description)}</p><div class="row"><button class="btn btn-primary" onclick="downloadNotes('${v.id}')">📄 Download Notes</button><button class="btn btn-ghost" onclick="openVideo('${next.id}')">Next video →</button></div></div><aside><div class="card"><h3 style="margin-top:0">Up next</h3>${S.videos.slice(0, 6).map(x => `<div class="list-item ${x.id === v.id ? "active" : ""}" onclick="openVideo('${x.id}')"><b>${esc(x.title)}</b><div class="muted small">${esc(x.subject)} · ${esc(x.duration || "")}</div></div>`).join("")}</div></aside></div></section>`);
}
async function notesPage() {
  if (!requireUser()) return;
  await loadVideos();
  shell(`<section class="section" style="padding-top:20px"><div class="section-head"><h2>Class Notes</h2></div><div class="video-grid">${S.videos.map(v => `<div class="card"><div style="font-size:34px">📄</div><h3>${esc(v.title)}</h3><p class="muted small">${esc(v.subject)} · ${esc(v.class)}</p><button class="btn btn-primary" onclick="downloadNotes('${v.id}')">Download notes</button></div>`).join("")}</div></section>`);
}
function downloadNotes(id) { const v = S.videos.find(x => x.id === id); if (!v) return; const text = `EduUganda Notes\n\n${v.title}\n${v.subject} · ${v.class}\n\n${v.description || "Study notes for this lesson."}\n\nLesson topic: ${v.topic}`; const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([text], { type: "text/plain" })); a.download = v.title.replace(/\W+/g, "_") + ".txt"; a.click(); toast("Notes downloaded."); }
async function groupsPage() { if (!requireUser()) return; await loadGroups(); shell(`<section class="section" style="padding-top:20px"><div class="section-head"><h2>Discussion Groups</h2></div><div class="subject-grid">${S.groups.map(group => { const count = S.groupMembers.filter(member => member.group_id === group.id).length; const joined = S.groupMembers.some(member => member.group_id === group.id && member.user_id === S.profile.id); return `<div class="card"><div style="font-size:28px">👥</div><h3>${esc(group.name)}</h3><p class="muted">${count} ${count === 1 ? "member" : "members"}</p>${group.description ? `<p>${esc(group.description)}</p>` : ""}<button class="btn btn-primary" onclick="${joined ? `leaveGroup('${group.id}')` : `joinGroup('${group.id}')`}">${joined ? "Leave group" : "Join group"}</button></div>`; }).join("") || `<div class="card"><p class="muted">No discussion groups have been created yet.</p></div>`}</div></section>`); }
function livePage() { if (!requireUser()) return; const live = liveDetails(); shell(`<section class="section" style="padding-top:20px"><div class="section-head"><h2>Live Classes</h2></div>${S.settings.live_enabled ? `<div class="card row space"><div><span class="pill green">SCHEDULED</span><h3>${esc(live.title)} (${esc(live.klass)})</h3><div class="muted">${esc(liveLabel(live.date))} · ${esc(live.start)} - ${esc(live.end)} · Teacher-led revision</div></div><button class="btn btn-green" onclick="joinLive()">Join Live</button></div>` : `<div class="card empty"><p class="muted">No live class is currently scheduled.</p></div>`}</section>`); }
function joinLive() { const live = liveDetails(); if (!S.settings.live_enabled) { toast("No live class is currently scheduled."); return; } if (live.url) { window.open(live.url, "_blank", "noopener"); return; } toast("Live room is opening. The video classroom will be available at the scheduled time."); }
function notifications() { if (!requireUser()) return; shell(`<section class="section" style="padding-top:20px"><div class="card"><h2>Notifications</h2><p>🔔 New Physics Revision class tomorrow at 10:00 AM.</p><p>⭐ New recommended lesson available.</p><p>✓ Your term payment is active.</p></div></section>`); }
function profilePage() {
  if (!requireUser()) return;
  const u = S.profile;
  shell(`<section class="section" style="padding-top:20px"><div class="card" style="max-width:720px"><div class="row" style="gap:16px"><div class="avatar" style="width:70px;height:70px;font-size:22px">${initials(u.name)}</div><div><h2 style="margin:0">${esc(u.name)}</h2><div class="muted">${esc(u.email)}</div></div></div><hr style="border:0;border-top:1px solid var(--line);margin:20px 0"><div class="field"><label>Level</label><select id="profile-level" onchange="profileClasses()"><option>Nursery</option><option>Primary</option><option>Secondary</option></select></div><div class="field"><label>Class</label><select id="profile-class"></select></div><button class="btn btn-primary" onclick="saveProfile()">Save changes</button><button class="btn btn-danger" style="margin-left:8px" onclick="logout()">Logout</button></div></section>`);
  document.getElementById("profile-level").value = u.level; profileClasses(); document.getElementById("profile-class").value = u.class;
}
function profileClasses() { document.getElementById("profile-class").innerHTML = availableClasses().map(c => `<option>${esc(c)}</option>`).join(""); }
async function saveProfile() {
  const level = document.getElementById("profile-level").value, klass = document.getElementById("profile-class").value;
  const { error } = await sb.from("profiles").update({ level, class: klass }).eq("id", S.profile.id);
  if (error) { toast("Could not update profile."); return; }
  S.profile.level = level; S.profile.class = klass;
  toast("Profile updated."); go("dashboard");
}

// ---------- ROUTING ----------
function go(route) { location.hash = "#/" + route; }
async function renderRoute() {
  const h = location.hash.replace(/^#\/?/, "");
  if (h.startsWith("admin")) { await adminRoute(h); return; }
  if (h === "login" || h === "register" || h === "forgot") { renderAuth(h); return; }
  if (!S.session) { renderAuth("login"); return; }
  if (!S.profile) { await loadProfile(); }
  if (!S.profile) { renderAuth("login"); return; }
  if (S.profile.disabled) { toast("Your account has been disabled."); await logout(); return; }
  if (S.profile.is_admin) { go("admin"); return; }
  if (h.startsWith("video/")) { await playerPage(h.split("/")[1]); return; }
  if (h.startsWith("videos")) { await videosPage(); return; }
  if (h === "notes") { await notesPage(); return; }
  if (h === "groups") { groupsPage(); return; }
  if (h === "live") { livePage(); return; }
  if (h === "profile") { profilePage(); return; }
  if (h === "notifications") { notifications(); return; }
  await dashboard();
}
window.addEventListener("hashchange", renderRoute);
window.addEventListener("load", async () => {
  const { data: { session } } = await sb.auth.getSession();
  S.session = session;
  await loadProfile();
  await loadStaticData();
  if (!location.hash) location.hash = "#/dashboard"; else await renderRoute();
});
window.renderAuth = renderAuth; window.updateClassOptions = updateClassOptions; window.register = register; window.login = login; window.forgot = forgot; window.logout = logout; window.selectPay = selectPay; window.completePayment = completePayment; window.go = go; window.filterLevel = filterLevel; window.filterSubject = filterSubject; window.openVideo = openVideo; window.downloadNotes = downloadNotes; window.joinLive = joinLive; window.profileClasses = profileClasses; window.saveProfile = saveProfile; window.toast = toast;

// ---------- ADMIN ----------
function adminLogin() { document.getElementById("app").innerHTML = `<div class="auth-wrap"><div class="auth-card">${logo()}<span class="pill yellow" style="margin-top:20px">ADMINISTRATOR</span><h1 style="font-size:28px;margin:12px 0 5px">Admin sign in</h1><p class="muted">Manage students, lessons, classes, payment settings and revenue.</p><form onsubmit="adminSubmit(event)"><div class="field"><label>Email</label><input id="admin-email" type="email" required></div><div class="field"><label>Password</label><input id="admin-password" type="password" required></div><button class="btn btn-primary btn-wide">Sign in to Admin</button></form><button class="link-btn" style="margin-top:12px" onclick="renderAuth('forgot')">Forgot admin password?</button><button class="btn btn-ghost btn-wide" style="margin-top:10px" onclick="go('login')">Student login</button></div></div>`; }
async function adminSubmit(e) {
  e.preventDefault();
  const email = document.getElementById("admin-email").value.trim().toLowerCase();
  const password = document.getElementById("admin-password").value;
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error) {
    console.error("Admin sign-in failed:", error);
    const message = error.message === "Invalid login credentials"
      ? "Email or password is incorrect. Reset this user's password in Supabase Authentication."
      : error.message;
    toast(`Admin sign-in failed: ${message}`);
    return;
  }
  const { data: prof, error: profileError } = await sb.from("profiles").select("*").eq("id", data.user.id).single();
  if (profileError) {
    console.error("Admin profile lookup failed:", profileError);
    toast(`Could not load administrator profile: ${profileError.message}`);
    await sb.auth.signOut();
    return;
  }
  if (!prof?.is_admin) { toast("This account is not an administrator."); await sb.auth.signOut(); return; }
  S.session = data.session; S.profile = prof; S.isAdmin = true;
  await Promise.all([loadAdminData(), loadStaticData(), loadVideos()]);
  adminDashboard();
}
async function adminRoute(h) {
  if (h === "admin/logout") { await adminLogout(); return; }
  if (!S.session) { adminLogin(); return; }
  if (!S.profile) await loadProfile();
  if (!S.profile?.is_admin) { adminLogin(); return; }
  S.isAdmin = true;
  await Promise.all([loadAdminData(), loadStaticData(), loadVideos()]);
  adminDashboard();
}
async function adminLogout() { await sb.auth.signOut(); S.session = null; S.profile = null; S.isAdmin = false; go("login"); }
function adminDashboard() {
  const students = S.users.filter(u => !u.is_admin);
  const query = searchQuery().toLowerCase().trim();
  const visibleStudents = students.filter(u => !query || `${u.name || ""} ${u.email || ""} ${u.level || ""} ${u.class || ""}`.toLowerCase().includes(query));
  const visibleGroups = S.groups.filter(group => !query || `${group.name || ""} ${group.description || ""}`.toLowerCase().includes(query));
  const visibleVideos = S.videos.filter(video => !query || `${video.title || ""} ${video.subject || ""} ${video.class || ""} ${video.topic || ""}`.toLowerCase().includes(query));
  document.getElementById("app").innerHTML = `<div class="admin-shell">${topbar(true)}<main class="admin-main"><div class="row space" style="margin-bottom:18px"><div><h1 style="margin:0;font-size:30px">Admin dashboard</h1><p class="muted">Private administrator controls — student pages are separate.</p></div><button class="btn btn-danger" onclick="adminLogout()">Logout</button></div>
<div class="stat-grid"><div class="stat"><span class="muted small">Students</span><b>${students.length}</b></div><div class="stat"><span class="muted small">Paid accounts</span><b>${students.filter(u => u.paid).length}</b></div><div class="stat"><span class="muted small">Lessons</span><b>${S.videos.length}</b></div><div class="stat"><span class="muted small">Revenue</span><b>${money(S.revenueTotal)}</b></div></div>
<div class="admin-grid" style="margin-top:18px"><div class="card"><div class="section-head"><h2>Students${query ? ` matching “${esc(query)}”` : ""}</h2><button class="btn btn-ghost" onclick="exportUsers()">Export CSV</button></div><div class="table-wrap"><table class="data-table"><thead><tr><th>Name</th><th>Level</th><th>Class</th><th>Payment</th><th>Status</th><th>Action</th></tr></thead><tbody>${visibleStudents.map(u => `<tr><td>${esc(u.name)}<br><span class="muted">${esc(u.email)}</span></td><td>${esc(u.level)}</td><td>${esc(u.class)}</td><td>${u.paid ? "Paid" : "Unpaid"}</td><td>${u.disabled ? "Disabled" : "Active"}</td><td><button class="btn ${u.disabled ? "btn-green" : "btn-danger"}" onclick="toggleUser('${u.id}')">${u.disabled ? "Enable" : "Disable"}</button></td></tr>`).join("") || `<tr><td colspan="6" class="empty">No matching student accounts.</td></tr>`}</tbody></table></div></div>
<div class="card"><h2>Discussion groups</h2><form onsubmit="addGroup(event)"><div class="field"><label for="new-group-name">Group name</label><input id="new-group-name" type="text" autocomplete="off" maxlength="120" placeholder="e.g. S.5 Mathematics Study Circle" required></div><div class="field"><label for="new-group-description">Description</label><textarea id="new-group-description" rows="2" maxlength="500" placeholder="What will students discuss?"></textarea></div><button class="btn btn-primary" type="submit">Create group</button></form><div style="margin-top:16px">${visibleGroups.map(group => `<div class="row space" style="padding:8px 0;border-bottom:1px solid var(--line)"><span>${esc(group.name)}</span><button class="btn btn-danger" onclick="deleteGroup('${group.id}')">Delete</button></div>`).join("") || `<p class="muted small">${query ? "No matching groups." : "No groups created yet."}</p>`}</div></div>
<div class="card"><h2>Live class</h2><div class="field" style="display:flex;align-items:center;gap:10px"><input id="set-live-enabled" type="checkbox" style="width:18px;height:18px" ${S.settings.live_enabled ? "checked" : ""}><label style="margin:0">Show live class to students</label></div><div class="field"><label>Title</label><input id="set-live-title" type="text" value="${esc(S.settings.live_title)}"></div><div class="field"><label>Class</label><input id="set-live-class" type="text" value="${esc(S.settings.live_class)}" placeholder="Leave blank for each student's class"></div><div class="field"><label>Date</label><input id="set-live-date" type="date" value="${esc(S.settings.live_date)}"></div><div class="row"><div class="field" style="flex:1"><label>Starts</label><input id="set-live-start" type="time" value="${esc(S.settings.live_start)}"></div><div class="field" style="flex:1"><label>Ends</label><input id="set-live-end" type="time" value="${esc(S.settings.live_end)}"></div></div><div class="field"><label>Room URL</label><input id="set-live-url" type="url" value="${esc(S.settings.live_url)}" placeholder="https://..."></div><button class="btn btn-primary" onclick="saveSettings()">Save live class</button></div>
<div class="card"><h2>Payments</h2><div class="field" style="display:flex;align-items:center;gap:10px"><input id="set-payments-enabled" type="checkbox" style="width:18px;height:18px" ${S.settings.payments_enabled ? "checked" : ""}><label style="margin:0">Require term-fee payment before dashboard access</label></div><p class="muted small">Off by default at launch. Turn on only after real payment verification is ready.</p><button class="btn btn-primary" onclick="saveSettings()">Save payment setting</button></div>
<div class="card"><h2>Receiving accounts</h2><div class="field"><label>MTN MoMo number</label><input id="set-mtn" value="${esc(S.settings.mtn)}"></div><div class="field"><label>Airtel Money number</label><input id="set-airtel" value="${esc(S.settings.airtel)}"></div><div class="field"><label>Bank name</label><input id="set-bank" value="${esc(S.settings.bank_name)}"></div><div class="field"><label>Bank account</label><input id="set-account" value="${esc(S.settings.bank_account)}"></div><div class="field"><label>Account holder</label><input id="set-holder" value="${esc(S.settings.bank_holder)}"></div><button class="btn btn-primary" onclick="saveSettings()">Save accounts</button></div></div>
<div class="admin-grid" style="margin-top:18px"><div class="card"><div class="section-head"><h2>Video library</h2><button class="btn btn-primary" onclick="showVideoModal()">+ Upload lesson</button></div><div class="table-wrap"><table class="data-table"><thead><tr><th>Title</th><th>Subject</th><th>Class</th><th>Topic</th><th></th></tr></thead><tbody>${visibleVideos.map(v => `<tr><td>${esc(v.title)}</td><td>${esc(v.subject)}</td><td>${esc(v.class)}</td><td>${esc(v.topic)}</td><td><button class="btn btn-danger" onclick="deleteVideo('${v.id}')">Delete</button></td></tr>`).join("") || `<tr><td colspan="5" class="empty">${query ? "No matching lessons." : "No lessons found."}</td></tr>`}</tbody></table></div></div>
<div class="card"><div class="section-head"><h2>Subjects & classes</h2></div><div class="row"><input id="new-subject" placeholder="New subject" style="flex:1;border:1px solid var(--line);padding:10px;border-radius:10px"><button class="btn btn-primary" onclick="addSubject()">Add</button></div><div style="margin-top:14px;display:flex;flex-wrap:wrap;gap:7px">${S.subjects.map(s => `<span class="pill" style="background:#eef5ff;color:#20538b">${esc(s)} <button style="border:0;background:none" onclick="deleteSubject('${esc(s)}')">×</button></span>`).join("")}</div><hr style="border:0;border-top:1px solid var(--line);margin:18px 0"><div class="row"><input id="new-class" placeholder="New class e.g. S7" style="flex:1;border:1px solid var(--line);padding:10px;border-radius:10px"><button class="btn btn-primary" onclick="addClass()">Add</button></div><div style="margin-top:14px;display:flex;flex-wrap:wrap;gap:7px">${S.classes.map(c => `<span class="pill" style="background:#f3f7fb;color:#425a76">${esc(c)} <button style="border:0;background:none" onclick="deleteClass('${esc(c)}')">×</button></span>`).join("")}</div></div></div></main></div>`;
}
async function toggleUser(id) {
  const u = S.users.find(x => x.id === id); if (!u) return;
  const { error } = await sb.from("profiles").update({ disabled: !u.disabled }).eq("id", id);
  if (error) { console.error("Student update failed:", error); toast(`Could not update student: ${error.message}`); return; }
  await loadAdminData(); adminDashboard();
}
async function saveSettings() {
  const value = id => document.getElementById(id)?.value || "";
  const payload = { payments_enabled: document.getElementById("set-payments-enabled").checked, mtn: value("set-mtn"), airtel: value("set-airtel"), bank_name: value("set-bank"), bank_account: value("set-account"), bank_holder: value("set-holder"), live_enabled: document.getElementById("set-live-enabled").checked, live_title: value("set-live-title"), live_class: value("set-live-class"), live_date: value("set-live-date"), live_start: value("set-live-start"), live_end: value("set-live-end"), live_url: value("set-live-url") };
  const { error } = await sb.from("settings").update(payload).eq("id", 1);
  if (error) { console.error("Settings update failed:", error); toast(`Could not save settings: ${error.message}`); return; }
  S.settings = { ...S.settings, ...payload };
  toast("Receiving accounts saved.");
}
async function addGroup(event) {
  event?.preventDefault();
  const name = document.getElementById("new-group-name").value.trim();
  const description = document.getElementById("new-group-description").value.trim();
  if (!name) { toast("Group name is required."); return; }
  const { error } = await sb.from("discussion_groups").insert({ name, description });
  if (error) { console.error("Group insert failed:", error); toast(`Could not create group: ${error.message}`); return; }
  await loadAdminData(); adminDashboard();
}
async function deleteGroup(id) {
  const { error } = await sb.from("discussion_groups").delete().eq("id", id);
  if (error) { console.error("Group delete failed:", error); toast(`Could not delete group: ${error.message}`); return; }
  await loadAdminData(); adminDashboard();
}
async function joinGroup(id) {
  const { error } = await sb.from("group_members").insert({ group_id: id, user_id: S.profile.id });
  if (error && error.code !== "23505") { toast(`Could not join group: ${error.message}`); return; }
  groupsPage();
}
async function leaveGroup(id) {
  const { error } = await sb.from("group_members").delete().eq("group_id", id).eq("user_id", S.profile.id);
  if (error) { toast(`Could not leave group: ${error.message}`); return; }
  groupsPage();
}
async function addSubject() {
  const v = document.getElementById("new-subject").value.trim();
  if (!v) { toast("Subject name is required."); return; }
  if (S.subjects.includes(v)) { toast("That subject already exists."); return; }
  const { error } = await sb.from("subjects").insert({ name: v });
  if (error) { console.error("Subject insert failed:", error); toast(`Could not add subject: ${error.message}`); return; }
  toast("Subject added."); await loadStaticData(); adminDashboard();
}
async function deleteSubject(v) { const { error } = await sb.from("subjects").delete().eq("name", v); if (error) { console.error("Subject delete failed:", error); toast(`Could not delete subject: ${error.message}`); return; } toast("Subject deleted."); await loadStaticData(); adminDashboard(); }
async function addClass() {
  const v = document.getElementById("new-class").value.trim();
  if (!v) { toast("Class name is required."); return; }
  if (S.classes.includes(v)) { toast("That class already exists."); return; }
  const { error } = await sb.from("classes").insert({ name: v, sort_order: S.classes.length + 1 });
  if (error) { console.error("Class insert failed:", error); toast(`Could not add class: ${error.message}`); return; }
  toast("Class added."); await loadStaticData(); adminDashboard();
}
async function deleteClass(v) { const { error } = await sb.from("classes").delete().eq("name", v); if (error) { console.error("Class delete failed:", error); toast(`Could not delete class: ${error.message}`); return; } toast("Class deleted."); await loadStaticData(); adminDashboard(); }
async function deleteVideo(id) { await sb.from("videos").delete().eq("id", id); await loadVideos(); adminDashboard(); }
function showVideoModal() { const wrap = document.createElement("div"); wrap.className = "modal-back"; wrap.id = "video-modal"; wrap.innerHTML = `<div class="modal"><div class="row space"><h2 style="margin:0">Upload lesson</h2><button class="icon-btn" onclick="closeVideoModal()">×</button></div><div class="field"><label>Title</label><input id="vm-title" required></div><div class="field"><label>Subject</label><select id="vm-subject">${S.subjects.map(x => `<option>${esc(x)}</option>`).join("")}</select></div><div class="field"><label>Class</label><select id="vm-class">${S.classes.map(x => `<option>${esc(x)}</option>`).join("")}</select></div><div class="field"><label>Topic</label><input id="vm-topic" placeholder="e.g. Trigonometry"></div><div class="field"><label>Video URL</label><input id="vm-url" placeholder="YouTube embed or watch URL"></div><div class="field"><label>Attach notes PDF</label><input id="vm-notes" type="file" accept="application/pdf"></div><div class="field"><label>Description</label><textarea id="vm-desc" rows="3"></textarea></div><button class="btn btn-primary btn-wide" onclick="saveVideo()">Save lesson</button></div>`; document.body.appendChild(wrap); }
function closeVideoModal() { document.getElementById("video-modal")?.remove(); }
async function saveVideo() {
  const title = document.getElementById("vm-title").value.trim(), url = document.getElementById("vm-url").value.trim();
  if (!title || !url) { toast("Title and video URL are required."); return; }
  const raw = url.includes("youtube.com/watch") ? url.replace("watch?v=", "embed/") : url.includes("youtu.be/") ? url.replace("youtu.be/", "youtube.com/embed/") : url;
  const { error } = await sb.from("videos").insert({ title, subject: document.getElementById("vm-subject").value, class: document.getElementById("vm-class").value, topic: document.getElementById("vm-topic").value || "General", duration: "New", views: "0", url: raw, description: document.getElementById("vm-desc").value || "EduUganda lesson." });
  if (error) { toast("Could not save lesson."); return; }
  await loadVideos(); closeVideoModal(); adminDashboard(); toast("Lesson added to the library.");
}
function exportUsers() { const rows = [["Name", "Email", "Phone", "Level", "Class", "Paid", "Disabled"], ...S.users.filter(u => !u.is_admin).map(u => [u.name, u.email, u.phone, u.level, u.class, u.paid, u.disabled])]; const csv = rows.map(r => r.map(x => `"${String(x).replace(/"/g, '""')}"`).join(",")).join("\n"); const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" })); a.download = "eduuganda-students.csv"; a.click(); }
Object.assign(window, { adminSubmit, adminLogout, toggleUser, saveSettings, addGroup, deleteGroup, joinGroup, leaveGroup, addSubject, deleteSubject, addClass, deleteClass, deleteVideo, showVideoModal, closeVideoModal, saveVideo, exportUsers });
})();
