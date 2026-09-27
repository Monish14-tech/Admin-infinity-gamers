/**
 * Infinity Gamers — Standalone Admin Management Portal
 * Connects securely to the Infinity Gamers backend API.
 */

// 1. BACKEND API CONFIGURATION
const DEFAULT_PROD_API = "https://infinity-gamers.onrender.com";
const DEFAULT_LOCAL_API = "http://localhost:3000";

function getInitialApiUrl() {
  let saved = localStorage.getItem("infinity_admin_api_url");
  if (saved && saved.trim()) {
    saved = saved.trim().replace(/\/+$/, "");
    // Auto-correct any legacy URL with trailing hyphen
    if (saved === "https://infinity-gamers-.onrender.com") {
      saved = DEFAULT_PROD_API;
      localStorage.setItem("infinity_admin_api_url", saved);
    }
    return saved;
  }
  const isLocal = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
  return isLocal ? DEFAULT_LOCAL_API : DEFAULT_PROD_API;
}

let API_BASE_URL = getInitialApiUrl();
const ADMIN_STORAGE_KEY = "infinity_admin_token";
let adminToken = localStorage.getItem(ADMIN_STORAGE_KEY) || "";

let allSessions = [];
let pollInterval = null;
let liveTimerInterval = null;
let currentFilter = "all";
let currentSearch = "";

// 2. INITIALIZATION
document.addEventListener("DOMContentLoaded", () => {
  initClock();
  initApiConnectionStatus();
  checkAuthAndInitView();

  // Set default API in modal input
  const apiInput = document.getElementById("apiUrlInput");
  if (apiInput) apiInput.value = API_BASE_URL;
});

// CLOCK
function initClock() {
  const clockEl = document.getElementById("adminClockText");
  const update = () => {
    if (!clockEl) return;
    const now = new Date();
    clockEl.textContent = "LIVE SYSTEM • " + now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) + " • " + now.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }).toUpperCase();
  };
  update();
  setInterval(update, 1000);
}

// API STATUS CHECK (WITH AUTO-FALLBACK & AUTO-RECOVERY)
async function initApiConnectionStatus() {
  const dot = document.getElementById("apiStatusDot");
  const text = document.getElementById("apiStatusText");

  try {
    const res = await fetch(`${API_BASE_URL}/api/health?_t=${Date.now()}`);
    if (res.ok) {
      if (dot) dot.className = "status-dot";
      if (text) text.textContent = "CONNECTED TO API";
      return true;
    }
    throw new Error("HTTP " + res.status);
  } catch (err) {
    // If the active URL fails, test production cloud API first
    if (API_BASE_URL !== DEFAULT_PROD_API) {
      try {
        const prodRes = await fetch(`${DEFAULT_PROD_API}/api/health?_t=${Date.now()}`);
        if (prodRes.ok) {
          API_BASE_URL = DEFAULT_PROD_API;
          localStorage.setItem("infinity_admin_api_url", API_BASE_URL);
          const apiInput = document.getElementById("apiUrlInput");
          if (apiInput) apiInput.value = API_BASE_URL;
          if (dot) dot.className = "status-dot";
          if (text) text.textContent = "CONNECTED TO API";
          return true;
        }
      } catch {}
    }

    // Next test local server
    if (API_BASE_URL !== DEFAULT_LOCAL_API) {
      try {
        const localRes = await fetch(`${DEFAULT_LOCAL_API}/api/health?_t=${Date.now()}`);
        if (localRes.ok) {
          API_BASE_URL = DEFAULT_LOCAL_API;
          localStorage.setItem("infinity_admin_api_url", API_BASE_URL);
          const apiInput = document.getElementById("apiUrlInput");
          if (apiInput) apiInput.value = API_BASE_URL;
          if (dot) dot.className = "status-dot";
          if (text) text.textContent = "CONNECTED TO API";
          return true;
        }
      } catch {}
    }

    if (dot) dot.className = "status-dot offline";
    if (text) text.textContent = "API OFFLINE";
    return false;
  }
}

// AUTH CHECK & VIEW SWITCH
function checkAuthAndInitView() {
  const authSection = document.getElementById("adminAuthSection");
  const dashSection = document.getElementById("adminDashboardSection");
  const topLogoutBtn = document.getElementById("btnTopLogout");

  if (adminToken) {
    if (authSection) authSection.style.display = "none";
    if (dashSection) dashSection.style.display = "block";
    if (topLogoutBtn) topLogoutBtn.style.display = "inline-flex";
    startDataPolling();
    refreshAdminData();
  } else {
    if (authSection) authSection.style.display = "block";
    if (dashSection) dashSection.style.display = "none";
    if (topLogoutBtn) topLogoutBtn.style.display = "none";
    stopDataPolling();
  }
}

// LOGIN
window.handleAdminLogin = async function(e) {
  e.preventDefault();
  const usernameInput = document.getElementById("adminUsername");
  const passwordInput = document.getElementById("adminPassword");
  const errorBox = document.getElementById("adminLoginError");
  const submitBtn = document.getElementById("btnSubmitLogin");

  if (errorBox) errorBox.style.display = "none";
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = "VERIFYING...";
  }

  const username = usernameInput ? usernameInput.value.trim() : "";
  const password = passwordInput ? passwordInput.value.trim() : "";

  try {
    const res = await fetch(`${API_BASE_URL}/api/admin/login?_t=${Date.now()}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password })
    });
    const data = await res.json();

    if (res.ok && data.success && data.token) {
      adminToken = data.token;
      localStorage.setItem(ADMIN_STORAGE_KEY, adminToken);
      showToast("Access granted. Welcome to Infinity Gamers Console.");
      checkAuthAndInitView();
      if (passwordInput) passwordInput.value = "";
    } else {
      throw new Error(data.error || "Invalid username or password.");
    }
  } catch (err) {
    if (errorBox) {
      errorBox.textContent = err.message || "Failed to authenticate with backend API.";
      errorBox.style.display = "block";
    }
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = "SIGN IN TO CONSOLE";
    }
  }
};

// LOGOUT
window.handleAdminLogout = function() {
  adminToken = "";
  localStorage.removeItem(ADMIN_STORAGE_KEY);
  showToast("Admin session ended.");
  checkAuthAndInitView();
};

// PASSWORD VISIBILITY TOGGLE
window.togglePasswordVisibility = function() {
  const pwdInput = document.getElementById("adminPassword");
  const eyeOpen = document.getElementById("eyeIconOpen");
  const eyeClosed = document.getElementById("eyeIconClosed");
  if (!pwdInput) return;

  if (pwdInput.type === "password") {
    pwdInput.type = "text";
    if (eyeOpen) eyeOpen.style.display = "none";
    if (eyeClosed) eyeClosed.style.display = "block";
  } else {
    pwdInput.type = "password";
    if (eyeOpen) eyeOpen.style.display = "block";
    if (eyeClosed) eyeClosed.style.display = "none";
  }
};

// TABS SWITCHING
window.switchAdminTab = function(tabId, btn) {
  document.querySelectorAll(".admin-tab-btn").forEach(b => b.classList.remove("active"));
  if (btn) btn.classList.add("active");

  document.querySelectorAll(".admin-tab-content").forEach(content => {
    content.style.display = "none";
  });

  const target = document.getElementById(tabId);
  if (target) target.style.display = "block";

  if (tabId === "tabNews") loadNews();
  if (tabId === "tabLeaderboard") loadLeaderboard();
};

// DATA POLLING
function startDataPolling() {
  stopDataPolling();
  pollInterval = setInterval(fetchSessions, 4000);
  liveTimerInterval = setInterval(updateLiveStationTimers, 1000);
}
function stopDataPolling() {
  if (pollInterval) clearInterval(pollInterval);
  if (liveTimerInterval) clearInterval(liveTimerInterval);
}

// REFRESH DATA
window.refreshAdminData = function() {
  fetchSessions();
  loadLeaderboard();
  loadNews();
  initApiConnectionStatus();
  showToast("Data refreshed from API.");
};

// 3. FETCH SESSIONS
async function fetchSessions() {
  if (!adminToken) return;

  try {
    const res = await fetch(`${API_BASE_URL}/api/admin/sessions?_t=${Date.now()}`, {
      headers: { "Authorization": `Bearer ${adminToken}` }
    });

    if (res.status === 401) {
      handleAdminLogout();
      return;
    }

    if (!res.ok) throw new Error("HTTP error " + res.status);
    const data = await res.json();
    allSessions = Array.isArray(data) ? data : [];

    updateStationOverview();
    renderSessionsTable();
  } catch (err) {
    console.warn("Failed to fetch sessions:", err);
  }
}

// 4. UPDATE LIVE STATION CARDS
function updateStationOverview() {
  const activeCountEl = document.getElementById("activeSessionsCount");
  const activeSessions = allSessions.filter(s => s.status === "active");
  if (activeCountEl) {
    activeCountEl.textContent = `${activeSessions.length} SESSION${activeSessions.length === 1 ? '' : 'S'} ACTIVE`;
  }

  updateStationCard("PS5 Station 1", 1);
  updateStationCard("PS5 Station 2", 2);
}

function updateStationCard(stationName, num) {
  const card = document.getElementById(`cardStation${num}`);
  const badge = document.getElementById(`badgeStation${num}`);
  const playerInfo = document.getElementById(`playerInfoStation${num}`);
  const inTimeEl = document.getElementById(`inTimeStation${num}`);
  const elapsedEl = document.getElementById(`elapsedStation${num}`);
  const gameEl = document.getElementById(`gameStation${num}`);
  const actionDiv = document.getElementById(`actionBtnStation${num}`);

  const active = allSessions.find(s => s.station === stationName && s.status === "active");

  if (active) {
    if (card) card.className = "station-live-card active-session";
    if (badge) {
      badge.className = "station-badge occupied";
      badge.textContent = "OCCUPIED";
    }
    if (playerInfo) {
      playerInfo.innerHTML = `<strong>${escapeHtml(active.customerName)}</strong><span>Phone: ${escapeHtml(active.phone || '-')}</span>`;
    }
    if (inTimeEl) inTimeEl.textContent = formatTimeShort(active.inTime);
    if (gameEl) gameEl.textContent = escapeHtml(active.game || "EA Sports FC 26");

    const elapsedMins = calculateElapsedMinutes(active.inTime);
    if (elapsedEl) elapsedEl.textContent = `${elapsedMins} MIN`;

    if (actionDiv) {
      actionDiv.innerHTML = `
        <button type="button" class="btn-primary" onclick="openCheckoutModal('${active.id}')" style="width:100%; min-height:36px; font-size:11px; background:#10b981; color:#000; border-color:#10b981;">
          END &amp; CHECKOUT
        </button>
      `;
    }
  } else {
    if (card) card.className = "station-live-card";
    if (badge) {
      badge.className = "station-badge vacant";
      badge.textContent = "VACANT";
    }
    if (playerInfo) {
      playerInfo.innerHTML = `<strong>No Active Player</strong><span>Station ready for walk-ins</span>`;
    }
    if (inTimeEl) inTimeEl.textContent = "--:--";
    if (elapsedEl) elapsedEl.textContent = "0 MIN";
    if (gameEl) gameEl.textContent = "--";

    if (actionDiv) {
      actionDiv.innerHTML = `
        <button type="button" class="btn-primary" onclick="openStartSessionModal('${stationName}')" style="width:100%; min-height:36px; font-size:11px;">
          START SESSION
        </button>
      `;
    }
  }
}

// REAL-TIME RUNNING TIMERS
function updateLiveStationTimers() {
  [1, 2].forEach(num => {
    const stationName = `PS5 Station ${num}`;
    const active = allSessions.find(s => s.station === stationName && s.status === "active");
    if (active) {
      const elapsedEl = document.getElementById(`elapsedStation${num}`);
      if (elapsedEl) {
        elapsedEl.textContent = `${calculateElapsedMinutes(active.inTime)} MIN`;
      }
    }
  });
}

// 5. RENDER SESSIONS TABLE
function renderSessionsTable() {
  const tbody = document.getElementById("sessionsTableBody");
  if (!tbody) return;

  // Compute repeat count map
  const phoneCounts = {};
  allSessions.forEach(s => {
    const p = (s.phone || '').trim();
    if (p) phoneCounts[p] = (phoneCounts[p] || 0) + 1;
  });

  let filtered = allSessions.slice();

  // Filter tab
  if (currentFilter === "active") filtered = filtered.filter(s => s.status === "active");
  if (currentFilter === "completed") filtered = filtered.filter(s => s.status === "completed");
  if (currentFilter === "repeat") {
    filtered = filtered.filter(s => {
      const p = (s.phone || '').trim();
      return p && phoneCounts[p] > 1;
    });
  }

  // Search filter
  if (currentSearch) {
    const q = currentSearch.toLowerCase();
    filtered = filtered.filter(s => 
      (s.customerName && s.customerName.toLowerCase().includes(q)) ||
      (s.phone && s.phone.includes(q)) ||
      (s.game && s.game.toLowerCase().includes(q)) ||
      (s.station && s.station.toLowerCase().includes(q))
    );
  }

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="10" style="text-align:center; padding:36px; color:var(--text-muted);">No matching customer session records found.</td></tr>`;
    return;
  }

  tbody.innerHTML = filtered.map(s => {
    const isActive = s.status === "active";
    const phone = (s.phone || '').trim();
    const count = phone ? phoneCounts[phone] : 0;
    const isRepeat = count > 1;

    const inTimeFormatted = formatDateTime(s.inTime);
    const outTimeFormatted = s.outTime ? formatDateTime(s.outTime) : "--";
    const duration = isActive ? `${calculateElapsedMinutes(s.inTime)} MIN (LIVE)` : `${s.durationMinutes || 0} MIN`;
    const amount = `Rs. ${s.amount || 0}`;

    return `
      <tr>
        <td>
          <span class="badge-status ${isActive ? 'active' : 'completed'}">
            ${isActive ? 'ACTIVE' : 'COMPLETED'}
          </span>
        </td>
        <td><strong style="color:#fff;">${escapeHtml(s.station)}</strong></td>
        <td>
          <span style="color:#fff; font-weight:600;">${escapeHtml(s.customerName)}</span>
          ${isRepeat ? `<span class="badge-repeat-cust" title="${count} visits">${count} VISITS</span>` : ''}
        </td>
        <td><span style="font-family:var(--font-mono); font-size:12px;">${escapeHtml(s.phone || '-')}</span></td>
        <td><span style="color:var(--neon-blue);">${escapeHtml(s.game || 'FC 26')}</span></td>
        <td><span style="font-family:var(--font-mono); font-size:11.5px;">${inTimeFormatted}</span></td>
        <td><span style="font-family:var(--font-mono); font-size:11.5px;">${outTimeFormatted}</span></td>
        <td><span style="font-family:var(--font-mono); font-size:12px; font-weight:700; color:${isActive ? 'var(--neon-blue)' : '#cbd5e1'};">${duration}</span></td>
        <td><span style="font-family:var(--font-mono); font-size:12px; font-weight:700; color:#10b981;">${amount}</span></td>
        <td>
          <div style="display:flex; gap:6px;">
            ${isActive ? `
              <button type="button" class="btn-primary" onclick="openCheckoutModal('${s.id}')" style="padding:4px 10px; min-height:28px; font-size:10px; background:#10b981; color:#000;">
                CHECKOUT
              </button>
            ` : ''}
            <button type="button" class="btn-danger" onclick="deleteSession('${s.id}')" style="padding:4px 8px; min-height:28px; font-size:10px;">
              DELETE
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join("");
}

window.filterSessions = function(filterType, btn) {
  document.querySelectorAll(".table-filter-btn").forEach(b => b.classList.remove("active"));
  if (btn) btn.classList.add("active");
  currentFilter = filterType;
  renderSessionsTable();
};

window.handleSessionSearch = function() {
  const input = document.getElementById("sessionSearchInput");
  currentSearch = input ? input.value.trim() : "";
  renderSessionsTable();
};

// 6. START NEW SESSION MODAL
window.openStartSessionModal = function(defaultStation = "PS5 Station 1") {
  const modal = document.getElementById("modalStartSession");
  const stationSelect = document.getElementById("newSessionStation");
  const repeatNotice = document.getElementById("repeatCustomerNotice");
  const form = document.getElementById("startSessionForm");

  if (form) form.reset();
  if (repeatNotice) repeatNotice.style.display = "none";
  if (stationSelect) stationSelect.value = defaultStation;

  handleStationSelectChange();
  if (modal) modal.classList.add("open");
};

window.closeStartSessionModal = function() {
  const modal = document.getElementById("modalStartSession");
  if (modal) modal.classList.remove("open");
};

window.handleStationSelectChange = function() {
  const stationSelect = document.getElementById("newSessionStation");
  const warning = document.getElementById("stationLockedWarning");
  const submitBtn = document.getElementById("btnSubmitStartSession");
  if (!stationSelect) return;

  const station = stationSelect.value;
  const isOccupied = allSessions.some(s => s.station === station && s.status === "active");

  if (isOccupied) {
    if (warning) warning.style.display = "block";
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = "STATION LOCKED (ACTIVE)";
    }
  } else {
    if (warning) warning.style.display = "none";
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = "START & LOCK STATION";
    }
  }
};

// REPEAT CUSTOMER CHECK IN MODAL
window.checkRepeatCustomer = function() {
  const phoneInput = document.getElementById("newCustomerPhone");
  const nameInput = document.getElementById("newCustomerName");
  const banner = document.getElementById("repeatCustomerNotice");
  const details = document.getElementById("repeatCustomerDetails");

  const phone = phoneInput ? phoneInput.value.trim() : "";
  const name = nameInput ? nameInput.value.trim().toLowerCase() : "";

  if ((!phone || phone.length < 5) && (!name || name.length < 3)) {
    if (banner) banner.style.display = "none";
    return;
  }

  const past = allSessions.filter(s => {
    if (phone && s.phone && s.phone.includes(phone)) return true;
    if (name && s.customerName && s.customerName.toLowerCase().includes(name)) return true;
    return false;
  });

  if (past.length > 0) {
    const totalMins = past.reduce((acc, s) => acc + (Number(s.durationMinutes) || 0), 0);
    const totalHours = (totalMins / 60).toFixed(1);
    const favGame = past[0].game || "EA Sports FC 26";

    if (banner) banner.style.display = "block";
    if (details) {
      details.innerHTML = `
        <strong>${escapeHtml(past[0].customerName)}</strong> has visited <strong>${past.length} times</strong> (${totalHours} hrs total playing time).<br>
        Frequently plays: <span style="color:var(--neon-pink);">${escapeHtml(favGame)}</span>
      `;
    }
  } else {
    if (banner) banner.style.display = "none";
  }
};

window.handleStartSessionSubmit = async function(e) {
  e.preventDefault();
  const station = document.getElementById("newSessionStation")?.value || "PS5 Station 1";
  const customerName = document.getElementById("newCustomerName")?.value.trim() || "";
  const phone = document.getElementById("newCustomerPhone")?.value.trim() || "";
  const game = document.getElementById("newSessionGame")?.value || "EA Sports FC 26";
  const amount = Number(document.getElementById("newHourlyRate")?.value) || 150;
  const notes = document.getElementById("newSessionNotes")?.value.trim() || "";

  if (!customerName) {
    showToast("Please enter a customer or team name.");
    return;
  }

  const submitBtn = document.getElementById("btnSubmitStartSession");
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = "STARTING...";
  }

  try {
    const res = await fetch(`${API_BASE_URL}/api/admin/sessions?_t=${Date.now()}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${adminToken}`
      },
      body: JSON.stringify({
        station,
        customerName,
        phone,
        game,
        amount,
        notes,
        status: "active",
        inTime: new Date().toISOString()
      })
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to start session.");

    showToast(`Session locked for ${customerName} on ${station}.`);
    closeStartSessionModal();
    fetchSessions();
  } catch (err) {
    showToast("Error: " + err.message);
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = "START & LOCK STATION";
    }
  }
};

// 7. CHECKOUT / END SESSION MODAL
window.openCheckoutModal = function(sessionId) {
  const session = allSessions.find(s => s.id === sessionId);
  if (!session) return;

  const modal = document.getElementById("modalCheckout");
  document.getElementById("checkoutSessionId").value = session.id;
  document.getElementById("checkoutCustomerName").textContent = session.customerName;
  document.getElementById("checkoutStation").textContent = session.station + " • " + (session.game || 'PS5 Game');
  document.getElementById("checkoutInTime").textContent = formatTimeShort(session.inTime);
  document.getElementById("checkoutOutTime").textContent = formatTimeShort(new Date().toISOString());

  const elapsedMins = Math.max(1, calculateElapsedMinutes(session.inTime));
  document.getElementById("checkoutDuration").textContent = `${elapsedMins} MIN`;

  // Auto calculate amount based on rate
  const baseRate = Number(session.amount) || 150;
  const billAmount = Math.max(50, Math.ceil((elapsedMins / 60) * baseRate));
  document.getElementById("checkoutFinalAmount").value = billAmount;
  document.getElementById("checkoutNotes").value = session.notes || "";

  if (modal) modal.classList.add("open");
};

window.closeCheckoutModal = function() {
  const modal = document.getElementById("modalCheckout");
  if (modal) modal.classList.remove("open");
};

window.handleCheckoutSubmit = async function(e) {
  e.preventDefault();
  const sessionId = document.getElementById("checkoutSessionId").value;
  const amount = Number(document.getElementById("checkoutFinalAmount").value) || 150;
  const notes = document.getElementById("checkoutNotes").value.trim();

  try {
    const res = await fetch(`${API_BASE_URL}/api/admin/sessions/${sessionId}?_t=${Date.now()}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${adminToken}`
      },
      body: JSON.stringify({
        amount,
        notes,
        outTime: new Date().toISOString()
      })
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to checkout session.");

    showToast("Session completed. Station is now vacant!");
    closeCheckoutModal();
    fetchSessions();
  } catch (err) {
    showToast("Error: " + err.message);
  }
};

// 8. DELETE SESSION
window.deleteSession = async function(sessionId) {
  if (!confirm("Are you sure you want to delete this customer session record?")) return;

  try {
    const res = await fetch(`${API_BASE_URL}/api/admin/sessions/${sessionId}?_t=${Date.now()}`, {
      method: "DELETE",
      headers: { "Authorization": `Bearer ${adminToken}` }
    });

    if (!res.ok) throw new Error("Failed to delete record.");
    showToast("Session record removed.");
    fetchSessions();
  } catch (err) {
    showToast("Error: " + err.message);
  }
};

// 9. LEADERBOARD
async function loadLeaderboard() {
  const tbody = document.getElementById("leaderboardTableBody");
  if (!tbody) return;

  try {
    const res = await fetch(`${API_BASE_URL}/api/top-players?_t=${Date.now()}`);
    if (!res.ok) throw new Error("Failed to fetch leaderboard.");
    const players = await res.json();

    if (!Array.isArray(players) || players.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:32px; color:var(--text-muted);">No player sessions recorded yet. Leaderboard updates automatically as sessions are completed.</td></tr>`;
      return;
    }

    tbody.innerHTML = players.map(p => {
      let tierColor = "#8492a6";
      if (p.tier === "DIAMOND SQUAD") tierColor = "#00d4ff";
      if (p.tier === "PLATINUM") tierColor = "#e5e4e2";
      if (p.tier === "GOLD") tierColor = "#ffd700";

      return `
        <tr>
          <td><strong style="font-family:var(--font-heading); color:${p.rank === 1 ? '#ffd700' : (p.rank === 2 ? '#e5e4e2' : (p.rank === 3 ? '#cd7f32' : '#fff'))}">#${p.rank}</strong></td>
          <td><strong style="color:#fff;">${escapeHtml(p.customerName)}</strong></td>
          <td><span style="font-family:var(--font-mono); font-size:12px;">${escapeHtml(p.phone || '-')}</span></td>
          <td><span style="font-family:var(--font-mono); font-weight:700; color:var(--neon-blue);">${p.totalHours} HRS</span></td>
          <td><span style="font-family:var(--font-mono);">${p.sessionCount}</span></td>
          <td><span style="color:#e2e8f0;">${escapeHtml(p.favoriteGame)}</span></td>
          <td>
            <span class="badge-status" style="border:1px solid ${tierColor}; color:${tierColor}; background:rgba(255,255,255,0.04);">
              ${p.tier}
            </span>
          </td>
        </tr>
      `;
    }).join("");
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:32px; color:#ef4444;">Error loading leaderboard: ${err.message}</td></tr>`;
  }
}

// 10. NEWS & TOURNAMENTS
async function loadNews() {
  const container = document.getElementById("publishedNewsList");
  if (!container) return;

  try {
    const res = await fetch(`${API_BASE_URL}/api/news?_t=${Date.now()}`);
    const news = await res.json();

    if (!Array.isArray(news) || news.length === 0) {
      container.innerHTML = `<div style="padding:24px; text-align:center; color:var(--text-muted); background:var(--bg-card); border:1px solid var(--border-line); border-radius:var(--radius);">No announcements currently published. Use the form on the left to post tournaments.</div>`;
      return;
    }

    container.innerHTML = news.map(item => `
      <div style="background:var(--bg-card); border:1px solid var(--border-line); border-radius:var(--radius); padding:18px;">
        <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:8px;">
          <div>
            <span class="admin-console-tag">${escapeHtml(item.category)}</span>
            <strong style="display:block; font-size:15px; color:#fff; margin-top:4px;">${escapeHtml(item.title)}</strong>
          </div>
          <button type="button" class="btn-danger" onclick="deleteNews('${item.id}')" style="padding:3px 8px; font-size:10px;">
            DELETE
          </button>
        </div>
        <p style="color:var(--text-dim); font-size:13px; line-height:1.5;">${escapeHtml(item.summary)}</p>
        <div style="margin-top:10px; font-family:var(--font-mono); font-size:11px; color:var(--text-muted); display:flex; gap:14px; flex-wrap:wrap;">
          ${item.prize ? `<span>Prize: <strong style="color:#ffd700;">${escapeHtml(item.prize)}</strong></span>` : ''}
          ${item.entryFee ? `<span>Entry: <strong>${escapeHtml(item.entryFee)}</strong></span>` : ''}
          ${item.time ? `<span>Time: <strong>${escapeHtml(item.time)}</strong></span>` : ''}
        </div>
      </div>
    `).join("");
  } catch (err) {
    container.innerHTML = `<div style="padding:20px; color:#ef4444;">Error loading news: ${err.message}</div>`;
  }
}

window.handleNewsPublish = async function(e) {
  e.preventDefault();
  const title = document.getElementById("newsTitle")?.value.trim();
  const category = document.getElementById("newsCategory")?.value;
  const prize = document.getElementById("newsPrize")?.value.trim();
  const entryFee = document.getElementById("newsEntryFee")?.value.trim();
  const time = document.getElementById("newsTime")?.value.trim();
  const summary = document.getElementById("newsSummary")?.value.trim();

  try {
    const res = await fetch(`${API_BASE_URL}/api/admin/news?_t=${Date.now()}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${adminToken}`
      },
      body: JSON.stringify({ title, category, prize, entryFee, time, summary })
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to publish announcement.");

    showToast("Announcement published! Now live on public site.");
    document.getElementById("newsPublishForm")?.reset();
    loadNews();
  } catch (err) {
    showToast("Error: " + err.message);
  }
};

window.deleteNews = async function(id) {
  if (!confirm("Are you sure you want to delete and unpublish this announcement?")) return;

  try {
    const res = await fetch(`${API_BASE_URL}/api/admin/news/${id}?_t=${Date.now()}`, {
      method: "DELETE",
      headers: { "Authorization": `Bearer ${adminToken}` }
    });

    if (!res.ok) throw new Error("Failed to delete announcement.");
    showToast("Announcement removed from public feed.");
    loadNews();
  } catch (err) {
    showToast("Error: " + err.message);
  }
};

// 11. API CONNECTION SETTINGS MODAL
window.openApiModal = function() {
  const modal = document.getElementById("modalApiSettings");
  const input = document.getElementById("apiUrlInput");
  const result = document.getElementById("apiTestResult");
  if (input) input.value = API_BASE_URL;
  if (result) result.style.display = "none";
  if (modal) modal.classList.add("open");
};

window.closeApiModal = function() {
  const modal = document.getElementById("modalApiSettings");
  if (modal) modal.classList.remove("open");
};

window.testApiConnection = async function() {
  const input = document.getElementById("apiUrlInput");
  const result = document.getElementById("apiTestResult");
  const url = input ? input.value.trim().replace(/\/+$/, "") : "";

  if (!url) {
    if (result) {
      result.textContent = "Please enter a valid API URL.";
      result.style.background = "rgba(239, 68, 68, 0.15)";
      result.style.color = "#fca5a5";
      result.style.display = "block";
    }
    return;
  }

  if (result) {
    result.textContent = "Pinging " + url + "...";
    result.style.background = "rgba(255, 255, 255, 0.05)";
    result.style.color = "#cbd5e1";
    result.style.display = "block";
  }

  try {
    const res = await fetch(`${url}/api/health?_t=${Date.now()}`);
    if (res.ok) {
      const data = await res.json();
      result.innerHTML = `<strong style="color:#10b981;">SUCCESS!</strong> Connected to backend API (uptime: ${Math.round(data.uptime || 0)}s).`;
      result.style.background = "rgba(16, 185, 129, 0.12)";
      result.style.color = "#6ee7b7";
    } else {
      throw new Error("HTTP " + res.status);
    }
  } catch (err) {
    result.innerHTML = `<strong style="color:#ef4444;">CONNECTION FAILED:</strong> ${err.message}. Make sure backend server is active and allows CORS.`;
    result.style.background = "rgba(239, 68, 68, 0.15)";
    result.style.color = "#fca5a5";
  }
};

window.saveApiSettings = function() {
  const input = document.getElementById("apiUrlInput");
  const url = input ? input.value.trim().replace(/\/+$/, "") : "";
  if (!url) return;

  API_BASE_URL = url;
  localStorage.setItem("infinity_admin_api_url", API_BASE_URL);
  closeApiModal();
  initApiConnectionStatus();
  refreshAdminData();
  showToast("API Endpoint updated: " + API_BASE_URL);
};

// 12. UTILITIES
function calculateElapsedMinutes(inTimeIso) {
  if (!inTimeIso) return 0;
  const start = new Date(inTimeIso).getTime();
  const diff = Date.now() - start;
  return diff > 0 ? Math.floor(diff / 60000) : 0;
}

function formatTimeShort(isoString) {
  if (!isoString) return "--:--";
  const d = new Date(isoString);
  return isNaN(d) ? "--:--" : d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatDateTime(isoString) {
  if (!isoString) return "--";
  const d = new Date(isoString);
  return isNaN(d) ? "--" : d.toLocaleDateString([], { month: 'short', day: 'numeric' }) + " " + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function showToast(message) {
  const toast = document.getElementById("toastMsg");
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 3200);
}
