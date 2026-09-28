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
    // Auto-correct any legacy URL with trailing hyphen or invalid protocol
    if (saved.includes("infinity-gamers-") || !saved.startsWith("http")) {
      saved = DEFAULT_PROD_API;
      localStorage.setItem("infinity_admin_api_url", saved);
    }
    return saved;
  }
  return DEFAULT_PROD_API;
}

let API_BASE_URL = getInitialApiUrl();
const ADMIN_STORAGE_KEY = "infinity_admin_token";
let adminToken = localStorage.getItem(ADMIN_STORAGE_KEY) || "";

let allSessions = [];
let pollInterval = null;
let liveTimerInterval = null;
let currentFilter = "all";
let currentSearch = "";
let currentDateFilter = ""; // ISO date string YYYY-MM-DD, empty = show all

// 2. INITIALIZATION
document.addEventListener("DOMContentLoaded", () => {
  initClock();
  initApiConnectionStatus();
  checkAuthAndInitView();

  // Set default API in modal input
  const apiInput = document.getElementById("apiUrlInput");
  if (apiInput) apiInput.value = API_BASE_URL;

  // Initialize date filter to today
  initSessionDateFilter();
});

// CLOCK
function initClock() {
  const clockEl = document.getElementById("adminClockText");
  let lastKnownDate = todayIso();
  const update = () => {
    if (!clockEl) return;
    const now = new Date();
    clockEl.textContent = "LIVE SYSTEM • " + now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) + " • " + now.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }).toUpperCase();

    // Auto-advance date register to new day if portal is open across midnight
    const curToday = todayIso();
    if (curToday !== lastKnownDate) {
      if (currentDateFilter === lastKnownDate) {
        currentDateFilter = curToday;
        const input = document.getElementById("sessionDateFilter");
        if (input) input.value = curToday;
        updateSessionDateLabel();
        renderSessionsTable();
      }
      lastKnownDate = curToday;
    }
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
    let res;
    try {
      res = await fetch(`${API_BASE_URL}/api/admin/login?_t=${Date.now()}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password })
      });
    } catch (networkErr) {
      // If current API threw a network error (e.g. Failed to fetch), retry against production cloud API
      if (API_BASE_URL !== DEFAULT_PROD_API) {
        API_BASE_URL = DEFAULT_PROD_API;
        localStorage.setItem("infinity_admin_api_url", API_BASE_URL);
        initApiConnectionStatus();
        res = await fetch(`${API_BASE_URL}/api/admin/login?_t=${Date.now()}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username, password })
        });
      } else {
        throw networkErr;
      }
    }

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
  const headerEditBtn = document.getElementById(`btnHeaderEditStation${num}`);

  const active = allSessions.find(s => s.station === stationName && s.status === "active");

  if (active) {
    if (headerEditBtn) {
      headerEditBtn.style.display = "inline-flex";
      headerEditBtn.onclick = () => window.editStationSession(num);
    }

    const isPaused = Boolean(active.isPaused);
    if (card) card.className = isPaused ? "station-live-card active-session paused" : "station-live-card active-session";
    if (badge) {
      if (isPaused) {
        badge.className = "station-badge paused";
        badge.textContent = "PAUSED";
      } else {
        badge.className = "station-badge occupied";
        badge.textContent = "OCCUPIED";
      }
    }

    if (playerInfo) {
      const tagSnippet = active.gamerTag ? `<span style="display:inline-block; margin-right:6px; color:var(--neon-pink); font-family:var(--font-mono); font-weight:700;">@${escapeHtml(active.gamerTag)}</span>` : '';
      playerInfo.innerHTML = `
        <strong>${escapeHtml(active.customerName)}</strong>
        <span>${tagSnippet}Phone: ${escapeHtml(active.phone || '-')}</span>
      `;
    }

    if (inTimeEl) inTimeEl.textContent = formatTimeShort(active.inTime);
    if (gameEl) {
      const extraGames = Array.isArray(active.gamesPlayed) && active.gamesPlayed.length > 1 ? ` (+${active.gamesPlayed.length - 1})` : '';
      gameEl.textContent = (active.game || "EA Sports FC 26") + extraGames;
    }

    const elapsedMins = calculateElapsedMinutes(active);
    if (elapsedEl) {
      elapsedEl.textContent = isPaused ? `${elapsedMins} MIN (PAUSED)` : `${elapsedMins} MIN`;
    }

    if (actionDiv) {
      actionDiv.innerHTML = `
        <div class="station-actions-box">
          <button type="button" class="btn-primary" onclick="openCheckoutModal('${active.id}')" style="width:100%; min-height:36px; font-size:11px; background:#10b981; color:#000; border-color:#10b981;">
            END &amp; CHECKOUT
          </button>
          <div class="station-subactions-row">
            ${isPaused ? `
              <button type="button" class="btn-subaction btn-resume" onclick="resumeSession('${active.id}')" title="Resume live game timer">
                RESUME
              </button>
            ` : `
              <button type="button" class="btn-subaction btn-pause-active" onclick="pauseSession('${active.id}')" title="Pause session timer">
                PAUSE
              </button>
            `}
            <button type="button" class="btn-subaction" onclick="openEditSessionModal('${active.id}')" title="Edit player or game details">
              EDIT SESSION
            </button>
            <button type="button" class="btn-subaction" onclick="openSwitchStationModal('${active.id}')" title="Switch station console or games">
              SWITCH
            </button>
          </div>
        </div>
      `;
    }
  } else {
    if (headerEditBtn) headerEditBtn.style.display = "none";
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

window.editStationSession = function(num) {
  const stationName = `PS5 Station ${num}`;
  const active = allSessions.find(s => s.station === stationName && s.status === "active");
  if (!active) {
    showToast(`No active session on PS5 Station ${num} to edit.`);
    return;
  }
  openEditSessionModal(active.id);
};

// REAL-TIME RUNNING TIMERS
function updateLiveStationTimers() {
  [1, 2].forEach(num => {
    const stationName = `PS5 Station ${num}`;
    const active = allSessions.find(s => s.station === stationName && s.status === "active");
    if (active) {
      const elapsedEl = document.getElementById(`elapsedStation${num}`);
      if (elapsedEl) {
        const mins = calculateElapsedMinutes(active);
        elapsedEl.textContent = active.isPaused ? `${mins} MIN (PAUSED)` : `${mins} MIN`;
      }
    }
  });
}

// 5. RENDER SESSIONS TABLE
function renderSessionsTable() {
  const tbody = document.getElementById("sessionsTableBody");
  if (!tbody) return;

  const phoneCounts = {};
  allSessions.forEach(s => {
    const p = (s.phone || '').trim();
    if (p) phoneCounts[p] = (phoneCounts[p] || 0) + 1;
  });

  let filtered = allSessions.slice();

  if (currentFilter === "active") filtered = filtered.filter(s => s.status === "active");
  if (currentFilter === "completed") filtered = filtered.filter(s => s.status === "completed");
  if (currentFilter === "repeat") {
    filtered = filtered.filter(s => {
      const p = (s.phone || '').trim();
      return p && phoneCounts[p] > 1;
    });
  }

  if (currentSearch) {
    const q = currentSearch.toLowerCase();
    filtered = filtered.filter(s => 
      (s.customerName && s.customerName.toLowerCase().includes(q)) ||
      (s.gamerTag && s.gamerTag.toLowerCase().includes(q)) ||
      (s.phone && s.phone.includes(q)) ||
      (s.game && s.game.toLowerCase().includes(q)) ||
      (s.station && s.station.toLowerCase().includes(q))
    );
  }

  // Apply date filter (skip if empty = show all)
  if (currentDateFilter) {
    const today = todayIso();
    filtered = filtered.filter(s => {
      const sessionDate = getSessionDate(s);
      if (currentDateFilter === today && s.status === "active") return true;
      return sessionDate === currentDateFilter;
    });
  }

  updateSessionDateLabel();

  if (filtered.length === 0) {
    const dateMsg = currentDateFilter ? ` for ${formatDisplayDate(currentDateFilter)}` : "";
    tbody.innerHTML = `<tr><td colspan="11" style="text-align:center; padding:36px; color:var(--text-muted);">No customer session records found${dateMsg}.</td></tr>`;
    return;
  }

  tbody.innerHTML = filtered.map(s => {
    const isActive = s.status === "active";
    const isPaused = Boolean(s.isPaused);
    const phone = (s.phone || '').trim();
    const count = phone ? phoneCounts[phone] : 0;
    const isRepeat = count > 1;

    const inTimeFormatted = formatDateTime(s.inTime);
    const outTimeFormatted = s.outTime ? formatDateTime(s.outTime) : "--";
    const duration = isActive 
      ? `${calculateElapsedMinutes(s)} MIN ${isPaused ? '(PAUSED)' : '(LIVE)'}`
      : `${s.durationMinutes || 0} MIN`;
    const amount = `Rs. ${s.amount || 0}`;

    const gamesDisplay = Array.isArray(s.gamesPlayed) && s.gamesPlayed.length > 0 
      ? s.gamesPlayed.map(g => escapeHtml(g)).join(" &bull; ") 
      : escapeHtml(s.game || "FC 26");

    let statusBadge = '';
    if (isActive) {
      if (isPaused) {
        statusBadge = `<span class="badge-status" style="border:1px solid #f59e0b; color:#fbbf24; background:rgba(245,158,11,0.15);">PAUSED</span>`;
      } else {
        statusBadge = `<span class="badge-status active">ACTIVE</span>`;
      }
    } else {
      statusBadge = `<span class="badge-status completed">COMPLETED</span>`;
    }

    return `
      <tr>
        <td>${statusBadge}</td>
        <td><strong style="color:#fff;">${escapeHtml(s.station)}</strong></td>
        <td>
          <span style="color:#fff; font-weight:600;">${escapeHtml(s.customerName)}</span>
          ${isRepeat ? `<span class="badge-repeat-cust" title="${count} visits">${count} VISITS</span>` : ''}
        </td>
        <td>
          ${s.gamerTag ? `<strong style="color:var(--neon-pink); font-family:var(--font-mono); font-size:12px;">@${escapeHtml(s.gamerTag)}</strong>` : '<span style="color:var(--text-muted); font-size:11px;">--</span>'}
        </td>
        <td><span style="font-family:var(--font-mono); font-size:12px;">${escapeHtml(s.phone || '-')}</span></td>
        <td><span style="color:var(--neon-blue); font-size:12.5px;">${gamesDisplay}</span></td>
        <td><span style="font-family:var(--font-mono); font-size:11.5px;">${inTimeFormatted}</span></td>
        <td><span style="font-family:var(--font-mono); font-size:11.5px;">${outTimeFormatted}</span></td>
        <td><span style="font-family:var(--font-mono); font-size:12px; font-weight:700; color:${isActive ? 'var(--neon-blue)' : '#cbd5e1'};">${duration}</span></td>
        <td><span style="font-family:var(--font-mono); font-size:12px; font-weight:700; color:#10b981;">${amount}</span></td>
        <td>
          <div style="display:flex; gap:6px; flex-wrap:wrap;">
            ${isActive ? `
              <button type="button" class="btn-primary" onclick="openCheckoutModal('${s.id}')" style="padding:4px 9px; min-height:26px; font-size:10px; background:#10b981; color:#000;">
                CHECKOUT
              </button>
              ${isPaused ? `
                <button type="button" class="btn-secondary" onclick="resumeSession('${s.id}')" style="padding:4px 8px; min-height:26px; font-size:10px; border-color:#10b981; color:#6ee7b7;">
                  RESUME
                </button>
              ` : `
                <button type="button" class="btn-secondary" onclick="pauseSession('${s.id}')" style="padding:4px 8px; min-height:26px; font-size:10px; border-color:#f59e0b; color:#fbbf24;">
                  PAUSE
                </button>
              `}
              <button type="button" class="btn-secondary" onclick="openEditSessionModal('${s.id}')" style="padding:4px 8px; min-height:26px; font-size:10px;">
                EDIT
              </button>
              <button type="button" class="btn-secondary" onclick="openSwitchStationModal('${s.id}')" style="padding:4px 8px; min-height:26px; font-size:10px;">
                SWITCH
              </button>
            ` : `
              <button type="button" class="btn-secondary" onclick="openReceiptModal('${s.id}')" style="padding:4px 9px; min-height:26px; font-size:10px; border-color:var(--neon-blue); color:var(--neon-blue);" title="View & Print Bill Receipt">
                RECEIPT (PDF)
              </button>
              <button type="button" class="btn-secondary" onclick="openEditBillModal('${s.id}')" style="padding:4px 9px; min-height:26px; font-size:10px; border-color:#10b981; color:#6ee7b7;" title="Edit bill details, amount, duration, or notes">
                EDIT BILL
              </button>
              <button type="button" class="btn-secondary" onclick="featureSessionInHallOfFame('${s.id}')" style="padding:4px 9px; min-height:26px; font-size:10px; border-color:var(--neon-pink); color:var(--neon-pink-light);">
                + HALL OF FAME
              </button>
            `}
            <button type="button" class="btn-danger" onclick="deleteSession('${s.id}')" style="padding:4px 8px; min-height:26px; font-size:10px;">
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

// DATE-WISE SESSION LOG HELPERS
function todayIso() {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getSessionDate(s) {
  if (!s || !s.inTime) return "";
  const d = new Date(s.inTime);
  if (isNaN(d.getTime())) return (s.inTime || "").slice(0, 10);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDisplayDate(isoDate) {
  if (!isoDate) return "";
  const d = new Date(isoDate + "T00:00:00");
  return isNaN(d.getTime()) ? isoDate : d.toLocaleDateString([], { weekday: "short", day: "numeric", month: "short", year: "numeric" }).toUpperCase();
}

function updateSessionDateLabel() {
  const label = document.getElementById("sessionDateLabel");
  if (!label) return;
  const today = todayIso();
  const dateSessions = currentDateFilter
    ? allSessions.filter(s => {
        const sDate = getSessionDate(s);
        if (currentDateFilter === today && s.status === "active") return true;
        return sDate === currentDateFilter;
      })
    : allSessions;
  const count = dateSessions.length;
  const rev = dateSessions.reduce((acc, s) => acc + (Number(s.amount) || 0), 0);

  if (currentDateFilter) {
    const isToday = currentDateFilter === today;
    const tag = isToday ? '<span style="background:rgba(0,255,157,0.18); color:var(--neon-green); font-size:10px; padding:2px 7px; border-radius:4px; font-weight:700; margin-left:6px; letter-spacing:0.5px;">TODAY</span>' : '';
    label.innerHTML = `<span style="font-weight:700; color:#fff;">${formatDisplayDate(currentDateFilter)}</span>${tag} <span style="color:var(--neon-green); font-weight:600; margin-left:8px;">(${count} Sessions • Rs. ${rev.toLocaleString()})</span>`;
  } else {
    label.innerHTML = `<span style="font-weight:700; color:#fff;">ALL DATES</span> <span style="color:var(--neon-green); font-weight:600; margin-left:8px;">(${count} Sessions • Rs. ${rev.toLocaleString()})</span>`;
  }
}

function initSessionDateFilter() {
  const input = document.getElementById("sessionDateFilter");
  const today = todayIso();
  currentDateFilter = today;
  if (input) input.value = today;
  updateSessionDateLabel();
}

window.applySessionDateFilter = function() {
  const input = document.getElementById("sessionDateFilter");
  currentDateFilter = input ? input.value : "";
  const showAllBtn = document.getElementById("btnShowAllDates");
  if (showAllBtn) showAllBtn.classList.remove("active");
  updateSessionDateLabel();
  renderSessionsTable();
};

window.goToTodaySessionDate = function() {
  const input = document.getElementById("sessionDateFilter");
  const today = todayIso();
  currentDateFilter = today;
  if (input) input.value = today;
  const showAllBtn = document.getElementById("btnShowAllDates");
  if (showAllBtn) showAllBtn.classList.remove("active");
  updateSessionDateLabel();
  renderSessionsTable();
};

window.shiftSessionDate = function(direction) {
  const input = document.getElementById("sessionDateFilter");
  const base = currentDateFilter || todayIso();
  const d = new Date(base + "T00:00:00");
  d.setDate(d.getDate() + direction);
  const newDate = d.toISOString().slice(0, 10);
  currentDateFilter = newDate;
  if (input) input.value = newDate;
  const showAllBtn = document.getElementById("btnShowAllDates");
  if (showAllBtn) showAllBtn.classList.remove("active");
  updateSessionDateLabel();
  renderSessionsTable();
};

window.showAllDates = function(btn) {
  currentDateFilter = "";
  const input = document.getElementById("sessionDateFilter");
  if (input) input.value = "";
  document.querySelectorAll(".table-filter-btn").forEach(b => b.classList.remove("active"));
  if (btn) btn.classList.add("active");
  updateSessionDateLabel();
  renderSessionsTable();
};


// 6. START NEW SESSION MODAL
window.openStartSessionModal = function(defaultStation = "PS5 Station 1") {
  const modal = document.getElementById("modalStartSession");
  const stationSelect = document.getElementById("newSessionStation");
  const repeatNotice = document.getElementById("repeatCustomerNotice");
  const form = document.getElementById("startSessionForm");

  if (form) form.reset();
  const rateInput = document.getElementById("newHourlyRate");
  if (rateInput) rateInput.value = "150";

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
    const tag = past[0].gamerTag ? ` (Tag: @${past[0].gamerTag})` : '';

    if (banner) banner.style.display = "block";
    if (details) {
      details.innerHTML = `
        <strong>${escapeHtml(past[0].customerName)}</strong>${tag} has visited <strong>${past.length} times</strong> (${totalHours} hrs verified playtime).<br>
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
  const gamerTag = (document.getElementById("newGamerTag")?.value || "").replace(/[^a-zA-Z0-9\s]/g, "").trim();
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
        gamerTag,
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

// 7. PAUSE & RESUME SESSION
window.pauseSession = async function(sessionId) {
  try {
    const res = await fetch(`${API_BASE_URL}/api/admin/sessions/${sessionId}?_t=${Date.now()}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${adminToken}`
      },
      body: JSON.stringify({ action: "pause", isPaused: true })
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to pause session.");

    showToast("Session paused. Timer stopped.");
    fetchSessions();
  } catch (err) {
    showToast("Error: " + err.message);
  }
};

window.resumeSession = async function(sessionId) {
  try {
    const res = await fetch(`${API_BASE_URL}/api/admin/sessions/${sessionId}?_t=${Date.now()}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${adminToken}`
      },
      body: JSON.stringify({ action: "resume", isPaused: false })
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to resume session.");

    showToast("Session resumed. Timer running.");
    fetchSessions();
  } catch (err) {
    showToast("Error: " + err.message);
  }
};

// 8. EDIT SESSION MODAL
window.openEditSessionModal = function(sessionId) {
  const session = allSessions.find(s => s.id === sessionId);
  if (!session) return;

  document.getElementById("editSessionId").value = session.id;
  document.getElementById("editCustomerName").value = session.customerName || "";
  document.getElementById("editCustomerPhone").value = session.phone || "";
  document.getElementById("editGamerTag").value = session.gamerTag || "";
  document.getElementById("editHourlyRate").value = session.amount || 150;
  document.getElementById("editSessionGame").value = session.game || "EA Sports FC 26";
  document.getElementById("editSessionNotes").value = session.notes || "";

  const modal = document.getElementById("modalEditSession");
  if (modal) modal.classList.add("open");
};

window.closeEditSessionModal = function() {
  const modal = document.getElementById("modalEditSession");
  if (modal) modal.classList.remove("open");
};

window.handleEditSessionSubmit = async function(e) {
  e.preventDefault();
  const id = document.getElementById("editSessionId").value;
  const customerName = document.getElementById("editCustomerName").value.trim();
  const phone = document.getElementById("editCustomerPhone").value.trim();
  const gamerTag = document.getElementById("editGamerTag").value.replace(/[^a-zA-Z0-9\s]/g, "").trim();
  const amount = Number(document.getElementById("editHourlyRate").value) || 0;
  const game = document.getElementById("editSessionGame").value;
  const notes = document.getElementById("editSessionNotes").value.trim();

  try {
    const res = await fetch(`${API_BASE_URL}/api/admin/sessions/${id}?_t=${Date.now()}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${adminToken}`
      },
      body: JSON.stringify({ customerName, phone, gamerTag, amount, rateBasis: amount, game, notes })
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to update session details.");

    showToast("Session details updated successfully.");
    closeEditSessionModal();
    fetchSessions();
  } catch (err) {
    showToast("Error: " + err.message);
  }
};

// 9. SWITCH STATION & GAMES MODAL
window.openSwitchStationModal = function(sessionId) {
  const session = allSessions.find(s => s.id === sessionId);
  if (!session) return;

  document.getElementById("switchSessionId").value = session.id;
  document.getElementById("switchCurrentCustomer").textContent = session.customerName + (session.gamerTag ? ` (@${session.gamerTag})` : '');
  document.getElementById("switchCurrentStationInfo").textContent = `Currently on: ${session.station} • Game: ${session.game || 'FC 26'}`;
  
  const played = Array.isArray(session.gamesPlayed) ? session.gamesPlayed.join(", ") : (session.game || "FC 26");
  document.getElementById("switchGamesPlayedLog").textContent = `Games played this session: ${played}`;

  // Default target station: flip to the other one
  const targetSelect = document.getElementById("targetStationSelect");
  if (targetSelect) {
    targetSelect.value = session.station === "PS5 Station 1" ? "PS5 Station 2" : "PS5 Station 1";
  }

  const modal = document.getElementById("modalSwitchStation");
  if (modal) modal.classList.add("open");
};

window.closeSwitchStationModal = function() {
  const modal = document.getElementById("modalSwitchStation");
  if (modal) modal.classList.remove("open");
};

window.handleSwitchStationSubmit = async function(e) {
  e.preventDefault();
  const id = document.getElementById("switchSessionId").value;
  const station = document.getElementById("targetStationSelect").value;
  const game = document.getElementById("targetGameSelect").value;
  const switchNote = document.getElementById("switchNotes").value.trim();

  const session = allSessions.find(s => s.id === id);
  let updatedNotes = session ? (session.notes || '') : '';
  if (switchNote) {
    updatedNotes = updatedNotes ? `${updatedNotes} | ${switchNote}` : switchNote;
  }

  try {
    const res = await fetch(`${API_BASE_URL}/api/admin/sessions/${id}?_t=${Date.now()}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${adminToken}`
      },
      body: JSON.stringify({ station, game, notes: updatedNotes })
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to switch station or game.");

    showToast(`Switched to ${station} (${game}). Multi-game session active!`);
    closeSwitchStationModal();
    fetchSessions();
  } catch (err) {
    showToast("Error: " + err.message);
  }
};

// 10. CHECKOUT / END SESSION MODAL (CUSTOM PAYABLE NUMERIC INPUT)
window.openCheckoutModal = function(sessionId) {
  const session = allSessions.find(s => s.id === sessionId);
  if (!session) return;

  const modal = document.getElementById("modalCheckout");
  document.getElementById("checkoutSessionId").value = session.id;
  document.getElementById("checkoutCustomerName").textContent = session.customerName + (session.gamerTag ? ` (@${session.gamerTag})` : '');
  document.getElementById("checkoutStation").textContent = session.station + " • " + (session.game || 'PS5 Game');
  document.getElementById("checkoutInTime").textContent = formatTimeShort(session.inTime);
  document.getElementById("checkoutOutTime").textContent = formatTimeShort(new Date().toISOString());

  const elapsedMins = Math.max(1, calculateElapsedMinutes(session));
  document.getElementById("checkoutDuration").textContent = `${elapsedMins} MIN`;

  const baseRate = Number(session.amount) || 150;
  const billAmount = Math.max(50, Math.ceil((elapsedMins / 60) * baseRate));
  
  // Set custom input payable amount
  const finalAmountInput = document.getElementById("checkoutFinalAmount");
  if (finalAmountInput) finalAmountInput.value = billAmount;

  const hintEl = document.getElementById("checkoutAmountHint");
  if (hintEl) {
    hintEl.textContent = `Suggested Rate: Rs. ${billAmount} (Rate: Rs. ${baseRate}/hr • Elapsed: ${elapsedMins} min). Enter custom amount as needed.`;
  }

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
  const amount = Number(document.getElementById("checkoutFinalAmount").value) || 0;
  const notes = document.getElementById("checkoutNotes").value.trim();

  try {
    const res = await fetch(`${API_BASE_URL}/api/admin/sessions/${sessionId}?_t=${Date.now()}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${adminToken}`
      },
      body: JSON.stringify({
        checkout: true,
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

    // Automatically prompt printable receipt
    setTimeout(() => {
      openReceiptModal(sessionId);
    }, 400);
  } catch (err) {
    showToast("Error: " + err.message);
  }
};

// 11. SHARABLE & PRINTABLE RECEIPT (PDF / WHATSAPP)
let activeReceiptData = null;

window.openReceiptModal = function(sessionId) {
  const session = allSessions.find(s => s.id === sessionId);
  if (!session) return;

  const dur = session.durationMinutes || calculateElapsedMinutes(session);
  const hours = (dur / 60).toFixed(1);
  const games = Array.isArray(session.gamesPlayed) && session.gamesPlayed.length > 0 
    ? session.gamesPlayed.join(", ") 
    : (session.game || "FC 26");

  activeReceiptData = {
    sessionId: session.id,
    receiptId: "IG-" + (session.id ? session.id.slice(-6).toUpperCase() : Math.floor(100000 + Math.random() * 900000)),
    customerName: session.customerName || "Customer",
    gamerTag: session.gamerTag || "PLAYER",
    phone: session.phone || "-",
    station: session.station || "PS5 Station 1",
    games: games,
    inTime: formatDateTime(session.inTime),
    outTime: session.outTime ? formatDateTime(session.outTime) : "IN PROGRESS",
    duration: `${dur} MIN (${hours} HRS)`,
    durationMinutes: dur,
    rateBasis: `Rs. ${session.rateBasis || session.amount || 150} / Hour`,
    totalAmount: session.amount || 150
  };

  document.getElementById("receiptNumber").textContent = `RECEIPT #${activeReceiptData.receiptId}`;
  document.getElementById("receiptCustomerName").textContent = activeReceiptData.customerName;
  document.getElementById("receiptGamerTag").textContent = `@${activeReceiptData.gamerTag}`;
  document.getElementById("receiptPhone").textContent = activeReceiptData.phone;
  document.getElementById("receiptStation").textContent = activeReceiptData.station;
  document.getElementById("receiptGames").textContent = activeReceiptData.games;
  document.getElementById("receiptTimeRange").textContent = `${formatTimeShort(session.inTime)} - ${formatTimeShort(session.outTime || new Date().toISOString())}`;
  document.getElementById("receiptDuration").textContent = activeReceiptData.duration;
  document.getElementById("receiptRateBasis").textContent = activeReceiptData.rateBasis;
  document.getElementById("receiptTotalAmount").textContent = `Rs. ${activeReceiptData.totalAmount}`;

  const modal = document.getElementById("modalReceiptPrint");
  if (modal) modal.classList.add("open");
};

window.openReceiptFromCheckout = function() {
  const sessionId = document.getElementById("checkoutSessionId")?.value;
  if (!sessionId) return;
  const session = allSessions.find(s => s.id === sessionId);
  if (!session) return;

  const customAmount = Number(document.getElementById("checkoutFinalAmount")?.value) || session.amount;
  openReceiptModal(sessionId);
  // Override amount with whatever custom value is currently in the checkout input
  document.getElementById("receiptTotalAmount").textContent = `Rs. ${customAmount}`;
  if (activeReceiptData) activeReceiptData.totalAmount = customAmount;
};

window.closeReceiptModal = function() {
  const modal = document.getElementById("modalReceiptPrint");
  if (modal) modal.classList.remove("open");
};

window.printReceiptDirectly = function() {
  window.print();
};

window.shareReceiptWhatsApp = function() {
  if (!activeReceiptData) return;
  const phoneClean = (activeReceiptData.phone || '').replace(/[^0-9]/g, '');
  const text = 
`*INFINITY GAMERS - GAMING SESSION BILL*
---------------------------------------
Receipt No: ${activeReceiptData.receiptId}
Customer: ${activeReceiptData.customerName}
Gamer Tag: @${activeReceiptData.gamerTag}
Station: ${activeReceiptData.station}
Game(s): ${activeReceiptData.games}
Duration: ${activeReceiptData.duration}
*Total Payable: Rs. ${activeReceiptData.totalAmount}*
---------------------------------------
Thank you for playing at Infinity Gamers PS5 Lounge!
Location: Thoppampatti Pirivu, CBE - 17`;

  const targetUrl = phoneClean && phoneClean.length === 10
    ? `https://api.whatsapp.com/send?phone=91${phoneClean}&text=${encodeURIComponent(text)}`
    : `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`;

  window.open(targetUrl, "_blank");
};

window.copyReceiptText = function() {
  if (!activeReceiptData) return;
  const text = 
`INFINITY GAMERS - GAMING SESSION BILL
Receipt No: ${activeReceiptData.receiptId}
Customer: ${activeReceiptData.customerName} (@${activeReceiptData.gamerTag})
Station: ${activeReceiptData.station}
Game(s): ${activeReceiptData.games}
Duration: ${activeReceiptData.duration}
Total Payable: Rs. ${activeReceiptData.totalAmount}
Status: PAID`;

  navigator.clipboard.writeText(text).then(() => {
    showToast("Receipt copied to clipboard.");
  }).catch(() => {
    showToast("Failed to copy receipt text.");
  });
};

// 12. EDIT BILL & RECEIPT DETAILS
window.openEditBillModal = function(sessionId) {
  const targetId = sessionId || (activeReceiptData ? activeReceiptData.sessionId : null);
  if (!targetId) {
    showToast("Please select a session or bill to edit.");
    return;
  }

  const session = allSessions.find(s => s.id === targetId);
  if (!session) {
    showToast("Bill session record not found.");
    return;
  }

  const billHeader = document.getElementById("editBillHeaderTitle");
  if (billHeader) {
    billHeader.textContent = "BILL #" + (session.id ? session.id.slice(-6).toUpperCase() : "RECORD");
  }

  const badgeEl = document.getElementById("editBillStatusBadge");
  if (badgeEl) {
    const isCompleted = session.status === "completed";
    badgeEl.textContent = isCompleted ? "COMPLETED" : "ACTIVE";
    badgeEl.className = isCompleted ? "station-badge vacant" : "station-badge occupied";
  }

  document.getElementById("editBillSessionId").value = session.id;
  document.getElementById("editBillCustomerName").value = session.customerName || "";
  document.getElementById("editBillGamerTag").value = session.gamerTag || "";
  document.getElementById("editBillPhone").value = session.phone || "";
  
  const stationSelect = document.getElementById("editBillStation");
  if (stationSelect) stationSelect.value = session.station || "PS5 Station 1";

  const gamesVal = (Array.isArray(session.gamesPlayed) && session.gamesPlayed.length > 0)
    ? session.gamesPlayed.join(", ")
    : (session.game || "EA Sports FC 26");
  document.getElementById("editBillGames").value = gamesVal;

  const durationVal = session.durationMinutes || calculateElapsedMinutes(session);
  document.getElementById("editBillDuration").value = durationVal;
  document.getElementById("editBillRateBasis").value = session.rateBasis || session.amount || 150;
  document.getElementById("editBillAmount").value = session.amount || 0;
  document.getElementById("editBillNotes").value = session.notes || "";

  const modal = document.getElementById("modalEditBill");
  if (modal) modal.classList.add("open");
};

window.closeEditBillModal = function() {
  const modal = document.getElementById("modalEditBill");
  if (modal) modal.classList.remove("open");
};

window.handleEditBillSubmit = async function(e) {
  e.preventDefault();
  const id = document.getElementById("editBillSessionId").value;
  const customerName = document.getElementById("editBillCustomerName").value.trim();
  const gamerTag = document.getElementById("editBillGamerTag").value.replace(/[^a-zA-Z0-9\s]/g, "").trim();
  const phone = document.getElementById("editBillPhone").value.trim();
  const station = document.getElementById("editBillStation").value;
  const gamesRaw = document.getElementById("editBillGames").value.trim();
  const durationMinutes = Number(document.getElementById("editBillDuration").value) || 1;
  const rateBasis = Number(document.getElementById("editBillRateBasis").value) || 150;
  const amount = Number(document.getElementById("editBillAmount").value) || 0;
  const notes = document.getElementById("editBillNotes").value.trim();

  const gamesArray = gamesRaw ? gamesRaw.split(",").map(g => g.trim()).filter(Boolean) : ["EA Sports FC 26"];
  const primaryGame = gamesArray[0] || "EA Sports FC 26";

  try {
    const res = await fetch(`${API_BASE_URL}/api/admin/sessions/${id}?_t=${Date.now()}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${adminToken}`
      },
      body: JSON.stringify({
        customerName,
        gamerTag,
        phone,
        station,
        game: primaryGame,
        gamesPlayed: gamesArray,
        durationMinutes,
        rateBasis,
        amount,
        notes
      })
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to update bill details.");

    // Update in local cache
    const idx = allSessions.findIndex(s => s.id === id);
    if (idx !== -1 && data.session) {
      allSessions[idx] = data.session;
    }

    showToast("Bill updated successfully.");
    closeEditBillModal();

    // Re-render UI
    renderSessionsTable();
    updateStationOverview();

    // If receipt modal was viewing this bill, refresh it in place!
    const receiptModal = document.getElementById("modalReceiptPrint");
    if (receiptModal && receiptModal.classList.contains("open")) {
      openReceiptModal(id);
    }
  } catch (err) {
    showToast("Error: " + err.message);
  }
};

function getFilteredSessionsForExport() {
  if (!currentDateFilter) return allSessions.slice();
  const today = todayIso();
  return allSessions.filter(s => {
    const sDate = getSessionDate(s);
    if (currentDateFilter === today && s.status === "active") return true;
    return sDate === currentDateFilter;
  });
}

window.exportSessionsCsv = function() {
  const exportData = getFilteredSessionsForExport();

  if (exportData.length === 0) {
    showToast("No sessions available to export.");
    return;
  }

  const headers = ["ID", "Station", "Customer Name", "Gamer Tag", "Phone", "Game(s)", "In Time", "Out Time", "Duration (Min)", "Amount (Rs)", "Status", "Notes"];
  const rows = exportData.map(s => [
    `"${s.id}"`,
    `"${s.station}"`,
    `"${(s.customerName || '').replace(/"/g, '""')}"`,
    `"${(s.gamerTag || '').replace(/"/g, '""')}"`,
    `"${s.phone || ''}"`,
    `"${(Array.isArray(s.gamesPlayed) ? s.gamesPlayed.join(', ') : (s.game || '')).replace(/"/g, '""')}"`,
    `"${s.inTime || ''}"`,
    `"${s.outTime || ''}"`,
    s.durationMinutes || 0,
    s.amount || 0,
    `"${s.status || ''}"`,
    `"${(s.notes || '').replace(/"/g, '""')}"`
  ]);

  const csvContent = [headers.join(","), ...rows.map(r => r.join(","))].join("\r\n");
  const dateSuffix = currentDateFilter ? `_${currentDateFilter}` : `_${Date.now()}`;
  downloadBlob(csvContent, `infinity_gamers_sessions${dateSuffix}.csv`, "text/csv;charset=utf-8;");
  const label = currentDateFilter ? ` for ${formatDisplayDate(currentDateFilter)}` : " (all dates)";
  showToast(`Sessions CSV exported${label}.`);
};

window.exportSessionsJson = function() {
  const exportData = getFilteredSessionsForExport();

  const jsonContent = JSON.stringify(exportData, null, 2);
  const dateSuffix = currentDateFilter ? `_${currentDateFilter}` : `_${Date.now()}`;
  downloadBlob(jsonContent, `infinity_gamers_sessions${dateSuffix}.json`, "application/json;charset=utf-8;");
  const label = currentDateFilter ? ` for ${formatDisplayDate(currentDateFilter)}` : " (all dates)";
  showToast(`Sessions JSON exported${label}.`);
};

window.exportSessionsPdf = function() {
  const exportData = getFilteredSessionsForExport();

  if (exportData.length === 0) {
    showToast("No sessions available to export.");
    return;
  }

  const printWin = window.open("", "_blank");
  if (!printWin) {
    showToast("Pop-up blocked. Please allow pop-ups to print PDF.");
    return;
  }

  const rowsHtml = exportData.map((s, idx) => `
    <tr>
      <td>${idx + 1}</td>
      <td><strong>${escapeHtml(s.station)}</strong></td>
      <td>${escapeHtml(s.customerName)}</td>
      <td>${s.gamerTag ? `@${escapeHtml(s.gamerTag)}` : '-'}</td>
      <td>${escapeHtml(s.phone || '-')}</td>
      <td>${escapeHtml(Array.isArray(s.gamesPlayed) ? s.gamesPlayed.join(', ') : (s.game || 'FC 26'))}</td>
      <td>${formatDateTime(s.inTime)}</td>
      <td>${s.outTime ? formatDateTime(s.outTime) : 'ACTIVE'}</td>
      <td>${s.durationMinutes || 0} min</td>
      <td>Rs. ${s.amount || 0}</td>
    </tr>
  `).join("");

  const totalRevenue = exportData.reduce((acc, s) => acc + (Number(s.amount) || 0), 0);
  const dateHeading = currentDateFilter ? ` — ${formatDisplayDate(currentDateFilter)}` : "";

  printWin.document.write(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Infinity Gamers - Sessions Report${currentDateFilter ? " " + currentDateFilter : ""}</title>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; padding: 24px; color: #111; }
        .header { display: flex; justify-content: space-between; border-bottom: 2px solid #111; padding-bottom: 12px; margin-bottom: 20px; }
        h1 { margin: 0; font-size: 22px; }
        p { margin: 4px 0; color: #444; font-size: 13px; }
        table { width: 100%; border-collapse: collapse; font-size: 12px; margin-top: 14px; }
        th, td { border: 1px solid #ddd; padding: 8px 10px; text-align: left; }
        th { background: #f1f5f9; font-weight: bold; }
        tr:nth-child(even) { background: #f8fafc; }
        .total-box { margin-top: 20px; text-align: right; font-size: 15px; font-weight: bold; }
        @media print { body { padding: 0; } }
      </style>
    </head>
    <body>
      <div class="header">
        <div>
          <h1>INFINITY GAMERS // CUSTOMER SESSIONS${dateHeading}</h1>
          <p>PS5 Lounge Management • Thoppampatti Pirivu, Coimbatore - 641017</p>
        </div>
        <div style="text-align:right;">
          <p>Generated: ${new Date().toLocaleString()}</p>
          <p>Total Records: ${exportData.length}</p>
        </div>
      </div>

      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>Station</th>
            <th>Customer</th>
            <th>Gamer Tag</th>
            <th>Phone</th>
            <th>Game(s)</th>
            <th>In Time</th>
            <th>Out Time</th>
            <th>Duration</th>
            <th>Amount</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml}
        </tbody>
      </table>

      <div class="total-box">
        Total Sessions: ${exportData.length} | Cumulative Value: Rs. ${totalRevenue.toLocaleString()}
      </div>

      <script>
        window.onload = function() { window.print(); };
      <\/script>
    </body>
    </html>
  `);
  printWin.document.close();
};

// 13. DELETE SESSION
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

// 14. ADMIN-CURATED PLAYERS HALL OF FAME
let currentHallOfFame = [];

async function loadLeaderboard() {
  const tbody = document.getElementById("leaderboardTableBody");
  if (!tbody) return;

  try {
    const res = await fetch(`${API_BASE_URL}/api/admin/hall-of-fame?_t=${Date.now()}`, {
      headers: { "Authorization": `Bearer ${adminToken}` }
    });

    let players = [];
    if (res.ok) {
      players = await res.json();
    } else {
      // Fallback to public endpoint
      const pubRes = await fetch(`${API_BASE_URL}/api/top-players?_t=${Date.now()}`);
      if (pubRes.ok) players = await pubRes.json();
    }

    currentHallOfFame = Array.isArray(players) ? players : [];

    if (currentHallOfFame.length === 0) {
      tbody.innerHTML = `<tr><td colspan="9" style="text-align:center; padding:32px; color:var(--text-muted);">No players selected for Hall of Fame yet. Click "+ ADD TO HALL OF FAME" above to select players.</td></tr>`;
      return;
    }

    tbody.innerHTML = currentHallOfFame.map((p, idx) => {
      let tierColor = "#8492a6";
      if (p.tier === "GRAND CHAMPION") tierColor = "#ffd700";
      else if (p.tier === "PLATINUM ELITE") tierColor = "#e5e4e2";
      else if (p.tier === "GOLD CONTENDER") tierColor = "#cd7f32";
      else if (p.tier === "DIAMOND SQUAD") tierColor = "#00d4ff";

      const points = p.loyaltyPoints !== undefined ? Number(p.loyaltyPoints) : Math.round((Number(p.totalHours) || 0) * 100);

      return `
        <tr>
          <td><strong style="font-family:var(--font-heading); color:${idx === 0 ? '#ffd700' : (idx === 1 ? '#e5e4e2' : (idx === 2 ? '#cd7f32' : '#fff'))}">#${p.rank || (idx + 1)}</strong></td>
          <td><strong style="color:var(--neon-pink); font-family:var(--font-mono); font-size:13px;">@${escapeHtml(p.gamerTag || 'GAMER')}</strong></td>
          <td><strong style="color:#fff;">${escapeHtml(p.customerName)}</strong></td>
          <td><span style="font-family:var(--font-mono); font-size:12px;">${escapeHtml(p.phone || '-')}</span></td>
          <td><span style="font-family:var(--font-mono); font-weight:700; color:var(--neon-blue);">${p.totalHours || 0} HRS</span></td>
          <td>
            <span style="font-family:var(--font-mono); font-weight:700; color:#fbbf24; background:rgba(245,158,11,0.12); border:1px solid rgba(245,158,11,0.35); padding:2px 8px; border-radius:3px; display:inline-flex; align-items:center; gap:4px;">
              ★ ${points.toLocaleString()} PTS
            </span>
          </td>
          <td><span style="font-family:var(--font-mono);">${p.sessionCount || 1}</span></td>
          <td><span style="color:#e2e8f0;">${escapeHtml(p.favoriteGame || 'FC 26')}</span></td>
          <td>
            <span class="badge-status" style="border:1px solid ${tierColor}; color:${tierColor}; background:rgba(255,255,255,0.04);">
              ${escapeHtml(p.tier || 'PRO GAMER')}
            </span>
          </td>
          <td>
            <div style="display:flex; gap:6px; flex-wrap:wrap;">
              <button type="button" class="btn-secondary" onclick="moveHallOfFameRank('${p.id}', -1)" title="Move Rank Up" style="padding:2px 7px; font-size:11px;">
                &uarr;
              </button>
              <button type="button" class="btn-secondary" onclick="moveHallOfFameRank('${p.id}', 1)" title="Move Rank Down" style="padding:2px 7px; font-size:11px;">
                &darr;
              </button>
              <button type="button" class="btn-secondary" onclick="openRedeemPointsModal('${p.id}')" title="Redeem reward or edit loyalty points" style="padding:3px 8px; font-size:10px; border-color:#f59e0b; color:#fbbf24;">
                EDIT PTS
              </button>
              <button type="button" class="btn-secondary" onclick="openEditHallOfFameModal('${p.id}')" style="padding:3px 8px; font-size:10px;">
                EDIT
              </button>
              <button type="button" class="btn-danger" onclick="deleteHallOfFamePlayer('${p.id}')" style="padding:3px 8px; font-size:10px;">
                REMOVE
              </button>
            </div>
          </td>
        </tr>
      `;
    }).join("");
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="10" style="text-align:center; padding:32px; color:#ef4444;">Error loading Hall of Fame: ${err.message}</td></tr>`;
  }
}

window.handleHofHoursChange = function() {
  const hours = Number(document.getElementById("hofTotalHours")?.value) || 0;
  const ptsInput = document.getElementById("hofLoyaltyPoints");
  if (ptsInput) {
    ptsInput.value = Math.round(hours * 100);
  }
};

window.openAddHallOfFameModal = function(prefillData = null) {
  const modal = document.getElementById("modalHallOfFamePlayer");
  const form = document.getElementById("hofPlayerForm");
  if (form) form.reset();

  document.getElementById("hofPlayerId").value = "";
  document.getElementById("hofModalTitle").textContent = "ADD PLAYER TO HALL OF FAME";

  // Populate quick pick dropdown from registered sessions
  const quickPick = document.getElementById("hofQuickPick");
  if (quickPick) {
    quickPick.innerHTML = `<option value="">-- Choose player or enter manually below --</option>`;
    const uniquePlayers = [];
    allSessions.forEach(s => {
      const key = (s.phone || s.customerName || '').trim();
      if (key && !uniquePlayers.some(u => u.key === key)) {
        uniquePlayers.push({ key, name: s.customerName, phone: s.phone, tag: s.gamerTag, game: s.game });
      }
    });
    uniquePlayers.forEach(p => {
      const opt = document.createElement("option");
      opt.value = p.key;
      opt.textContent = `${p.name} ${p.tag ? `(@${p.tag})` : ''} - ${p.phone || 'Walk-in'}`;
      quickPick.appendChild(opt);
    });
  }

  const nextRank = currentHallOfFame.length + 1;
  document.getElementById("hofRank").value = nextRank;
  document.getElementById("hofTotalHours").value = "5.0";
  document.getElementById("hofLoyaltyPoints").value = "500";
  document.getElementById("hofSessionCount").value = "1";

  if (prefillData) {
    if (prefillData.customerName) document.getElementById("hofCustomerName").value = prefillData.customerName;
    if (prefillData.gamerTag) document.getElementById("hofGamerTag").value = prefillData.gamerTag;
    if (prefillData.phone) document.getElementById("hofPhone").value = prefillData.phone;
    if (prefillData.favoriteGame) document.getElementById("hofFavoriteGame").value = prefillData.favoriteGame;
    if (prefillData.totalHours) {
      document.getElementById("hofTotalHours").value = prefillData.totalHours;
      document.getElementById("hofLoyaltyPoints").value = Math.round(Number(prefillData.totalHours) * 100);
    }
  }

  if (modal) modal.classList.add("open");
};

window.openEditHallOfFameModal = function(id) {
  const p = currentHallOfFame.find(x => x.id === id);
  if (!p) return;

  const currentPts = p.loyaltyPoints !== undefined ? Number(p.loyaltyPoints) : Math.round((Number(p.totalHours) || 0) * 100);

  document.getElementById("hofPlayerId").value = p.id;
  document.getElementById("hofModalTitle").textContent = "EDIT HALL OF FAME ENTRY";
  document.getElementById("hofRank").value = p.rank || 1;
  document.getElementById("hofGamerTag").value = p.gamerTag || "";
  document.getElementById("hofCustomerName").value = p.customerName || "";
  document.getElementById("hofPhone").value = p.phone || "";
  document.getElementById("hofTier").value = p.tier || "GRAND CHAMPION";
  document.getElementById("hofFavoriteGame").value = p.favoriteGame || "EA Sports FC 26";
  document.getElementById("hofTotalHours").value = p.totalHours || 1.0;
  document.getElementById("hofLoyaltyPoints").value = currentPts;
  document.getElementById("hofSessionCount").value = p.sessionCount || 1;
  document.getElementById("hofNotes").value = p.notes || "";

  const modal = document.getElementById("modalHallOfFamePlayer");
  if (modal) modal.classList.add("open");
};

window.closeHallOfFameModal = function() {
  const modal = document.getElementById("modalHallOfFamePlayer");
  if (modal) modal.classList.remove("open");
};

window.handleHofQuickPickChange = function() {
  const pickVal = document.getElementById("hofQuickPick")?.value;
  if (!pickVal) return;

  const matched = allSessions.filter(s => (s.phone || s.customerName || '').trim() === pickVal);
  if (matched.length > 0) {
    const first = matched[0];
    document.getElementById("hofCustomerName").value = first.customerName || "";
    document.getElementById("hofPhone").value = first.phone || "";
    if (first.gamerTag) document.getElementById("hofGamerTag").value = first.gamerTag;
    document.getElementById("hofFavoriteGame").value = first.game || "EA Sports FC 26";

    const totalMins = matched.reduce((acc, s) => acc + (Number(s.durationMinutes) || 0), 0);
    const hours = Math.max(1, Number((totalMins / 60).toFixed(1)));
    document.getElementById("hofTotalHours").value = hours;
    document.getElementById("hofLoyaltyPoints").value = Math.round(hours * 100);
    document.getElementById("hofSessionCount").value = matched.length;

    let tier = "GOLD CONTENDER";
    if (hours >= 15) tier = "GRAND CHAMPION";
    else if (hours >= 8) tier = "PLATINUM ELITE";
    document.getElementById("hofTier").value = tier;
  }
};

window.handleSaveHallOfFamePlayer = async function(e) {
  e.preventDefault();
  const id = document.getElementById("hofPlayerId")?.value;
  const rank = Number(document.getElementById("hofRank")?.value) || 1;
  const gamerTag = (document.getElementById("hofGamerTag")?.value || "").replace(/[^a-zA-Z0-9\s]/g, "").trim();
  const customerName = document.getElementById("hofCustomerName")?.value.trim() || "";
  const phone = document.getElementById("hofPhone")?.value.trim() || "";
  const tier = document.getElementById("hofTier")?.value || "GOLD CONTENDER";
  const favoriteGame = document.getElementById("hofFavoriteGame")?.value.trim() || "EA Sports FC 26";
  const totalHours = Number(document.getElementById("hofTotalHours")?.value) || 1.0;
  const loyaltyPoints = Number(document.getElementById("hofLoyaltyPoints")?.value) || Math.round(totalHours * 100);
  const sessionCount = Number(document.getElementById("hofSessionCount")?.value) || 1;
  const notes = document.getElementById("hofNotes")?.value.trim() || "";

  if (!gamerTag) {
    showToast("Please enter a gamer tag.");
    return;
  }

  const payload = { rank, gamerTag, customerName, phone, tier, favoriteGame, totalHours, loyaltyPoints, sessionCount, notes };

  try {
    let res;
    if (id) {
      res = await fetch(`${API_BASE_URL}/api/admin/hall-of-fame/${id}?_t=${Date.now()}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${adminToken}`
        },
        body: JSON.stringify(payload)
      });
    } else {
      res = await fetch(`${API_BASE_URL}/api/admin/hall-of-fame?_t=${Date.now()}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${adminToken}`
        },
        body: JSON.stringify(payload)
      });
    }

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to save Hall of Fame entry.");

    showToast(`Player @${gamerTag} saved to Hall of Fame!`);
    closeHallOfFameModal();
    loadLeaderboard();
  } catch (err) {
    showToast("Error: " + err.message);
  }
};

// 15. REDEEM REWARDS & EDIT LOYALTY POINTS MODAL
let activeRedeemPlayer = null;

window.openRedeemPointsModal = function(id) {
  const p = currentHallOfFame.find(x => x.id === id);
  if (!p) {
    showToast("Player not found in Hall of Fame.");
    return;
  }

  activeRedeemPlayer = p;
  const currentPts = p.loyaltyPoints !== undefined ? Number(p.loyaltyPoints) : Math.round((Number(p.totalHours) || 0) * 100);

  document.getElementById("redeemPlayerId").value = p.id;
  document.getElementById("redeemPlayerName").textContent = p.customerName || "Player";
  document.getElementById("redeemGamerTag").textContent = `@${p.gamerTag || 'GAMER'}`;
  document.getElementById("redeemCurrentBalance").textContent = `${currentPts.toLocaleString()} PTS`;
  document.getElementById("redeemActionType").value = "deduct";
  document.getElementById("redeemPointsAmount").value = "";
  document.getElementById("redeemNote").value = "";
  document.getElementById("lblRedeemPoints").textContent = "POINTS TO DEDUCT (REWARD REDEEMED)";
  document.getElementById("redeemProjectedBalance").textContent = `${currentPts.toLocaleString()} PTS`;

  const modal = document.getElementById("modalRedeemPoints");
  if (modal) modal.classList.add("open");
};

window.closeRedeemPointsModal = function() {
  const modal = document.getElementById("modalRedeemPoints");
  if (modal) modal.classList.remove("open");
  activeRedeemPlayer = null;
};

window.updateRedeemCalculation = function() {
  if (!activeRedeemPlayer) return;
  const currentPts = activeRedeemPlayer.loyaltyPoints !== undefined 
    ? Number(activeRedeemPlayer.loyaltyPoints) 
    : Math.round((Number(activeRedeemPlayer.totalHours) || 0) * 100);

  const action = document.getElementById("redeemActionType")?.value || "deduct";
  const amount = Number(document.getElementById("redeemPointsAmount")?.value) || 0;
  const lbl = document.getElementById("lblRedeemPoints");
  let projected = currentPts;

  if (action === "deduct") {
    if (lbl) lbl.textContent = "POINTS TO DEDUCT (REWARD REDEEMED)";
    projected = Math.max(0, currentPts - amount);
  } else if (action === "set") {
    if (lbl) lbl.textContent = "EXACT NEW BALANCE (PTS)";
    projected = Math.max(0, amount);
  } else if (action === "add") {
    if (lbl) lbl.textContent = "BONUS POINTS TO ADD";
    projected = currentPts + Math.max(0, amount);
  }

  const projEl = document.getElementById("redeemProjectedBalance");
  if (projEl) {
    projEl.textContent = `${projected.toLocaleString()} PTS`;
  }
};

window.applyRedeemPreset = function(pts, reason) {
  const actionSelect = document.getElementById("redeemActionType");
  if (actionSelect) actionSelect.value = "deduct";
  const ptsInput = document.getElementById("redeemPointsAmount");
  if (ptsInput) ptsInput.value = pts;
  const noteInput = document.getElementById("redeemNote");
  if (noteInput) noteInput.value = reason;
  updateRedeemCalculation();
};

window.handleRedeemPointsSubmit = async function(e) {
  e.preventDefault();
  if (!activeRedeemPlayer) return;

  const id = document.getElementById("redeemPlayerId")?.value;
  const action = document.getElementById("redeemActionType")?.value || "deduct";
  const amount = Number(document.getElementById("redeemPointsAmount")?.value) || 0;
  const reason = document.getElementById("redeemNote")?.value.trim() || "";

  const currentPts = activeRedeemPlayer.loyaltyPoints !== undefined 
    ? Number(activeRedeemPlayer.loyaltyPoints) 
    : Math.round((Number(activeRedeemPlayer.totalHours) || 0) * 100);

  let newPoints = currentPts;
  if (action === "deduct") {
    newPoints = Math.max(0, currentPts - amount);
  } else if (action === "set") {
    newPoints = Math.max(0, amount);
  } else if (action === "add") {
    newPoints = currentPts + Math.max(0, amount);
  }

  let noteUpdate = activeRedeemPlayer.notes || "";
  if (reason) {
    noteUpdate = (noteUpdate ? noteUpdate + " | " : "") + reason;
  }

  try {
    const res = await fetch(`${API_BASE_URL}/api/admin/hall-of-fame/${id}?_t=${Date.now()}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${adminToken}`
      },
      body: JSON.stringify({
        loyaltyPoints: newPoints,
        notes: noteUpdate
      })
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to update points.");

    showToast(`Loyalty points updated! New balance: ${newPoints.toLocaleString()} PTS.`);
    closeRedeemPointsModal();
    loadLeaderboard();
  } catch (err) {
    showToast("Error: " + err.message);
  }
};

window.deleteHallOfFamePlayer = async function(id) {
  if (!confirm("Are you sure you want to remove this player from the official Hall of Fame?")) return;

  try {
    const res = await fetch(`${API_BASE_URL}/api/admin/hall-of-fame/${id}?_t=${Date.now()}`, {
      method: "DELETE",
      headers: { "Authorization": `Bearer ${adminToken}` }
    });

    if (!res.ok) throw new Error("Failed to remove player.");
    showToast("Player removed from Hall of Fame.");
    loadLeaderboard();
  } catch (err) {
    showToast("Error: " + err.message);
  }
};

window.moveHallOfFameRank = async function(id, direction) {
  const currentIdx = currentHallOfFame.findIndex(p => p.id === id);
  if (currentIdx === -1) return;
  const targetIdx = currentIdx + direction;
  if (targetIdx < 0 || targetIdx >= currentHallOfFame.length) return;

  const currentP = currentHallOfFame[currentIdx];
  const targetP = currentHallOfFame[targetIdx];

  const currentRank = currentP.rank || (currentIdx + 1);
  const targetRank = targetP.rank || (targetIdx + 1);

  try {
    await fetch(`${API_BASE_URL}/api/admin/hall-of-fame/${currentP.id}?_t=${Date.now()}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${adminToken}`
      },
      body: JSON.stringify({ rank: targetRank })
    });

    await fetch(`${API_BASE_URL}/api/admin/hall-of-fame/${targetP.id}?_t=${Date.now()}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${adminToken}`
      },
      body: JSON.stringify({ rank: currentRank })
    });

    showToast("Rank updated.");
    loadLeaderboard();
  } catch (err) {
    showToast("Error: " + err.message);
  }
};

window.featureSessionInHallOfFame = function(sessionId) {
  const session = allSessions.find(s => s.id === sessionId);
  if (!session) return;

  switchAdminTab("tabLeaderboard", document.querySelector('[data-tab="tabLeaderboard"]'));
  const dur = session.durationMinutes || 60;
  const hours = Number((dur / 60).toFixed(1));

  openAddHallOfFameModal({
    customerName: session.customerName,
    gamerTag: session.gamerTag || "",
    phone: session.phone || "",
    favoriteGame: session.game || "EA Sports FC 26",
    totalHours: Math.max(1.0, hours)
  });
};

window.exportHallOfFameCsv = function() {
  if (currentHallOfFame.length === 0) {
    showToast("No Hall of Fame players to export.");
    return;
  }

  const headers = ["Rank", "Gamer Tag", "Customer Name", "Phone", "Verified Playtime Hours", "Sessions", "Top Title", "Tier / Badge", "Notes"];
  const rows = currentHallOfFame.map((p, idx) => [
    p.rank || (idx + 1),
    `"${(p.gamerTag || '').replace(/"/g, '""')}"`,
    `"${(p.customerName || '').replace(/"/g, '""')}"`,
    `"${p.phone || ''}"`,
    p.totalHours || 0,
    p.sessionCount || 1,
    `"${(p.favoriteGame || '').replace(/"/g, '""')}"`,
    `"${(p.tier || '').replace(/"/g, '""')}"`,
    `"${(p.notes || '').replace(/"/g, '""')}"`
  ]);

  const csvContent = [headers.join(","), ...rows.map(r => r.join(","))].join("\r\n");
  downloadBlob(csvContent, `infinity_gamers_hall_of_fame_${Date.now()}.csv`, "text/csv;charset=utf-8;");
  showToast("Hall of Fame CSV exported.");
};

window.exportHallOfFamePdf = function() {
  if (currentHallOfFame.length === 0) {
    showToast("No Hall of Fame players to export.");
    return;
  }

  const printWin = window.open("", "_blank");
  if (!printWin) {
    showToast("Pop-up blocked. Please allow pop-ups to print PDF.");
    return;
  }

  const rowsHtml = currentHallOfFame.map((p, idx) => `
    <tr>
      <td><strong>#${p.rank || (idx + 1)}</strong></td>
      <td><strong>@${escapeHtml(p.gamerTag || 'GAMER')}</strong></td>
      <td>${escapeHtml(p.customerName)}</td>
      <td>${escapeHtml(p.phone || '-')}</td>
      <td>${p.totalHours || 0} HRS</td>
      <td>${escapeHtml(p.favoriteGame || 'FC 26')}</td>
      <td>${escapeHtml(p.tier || 'PRO GAMER')}</td>
    </tr>
  `).join("");

  printWin.document.write(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Infinity Gamers - Hall of Fame Official Roster</title>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; padding: 24px; color: #111; }
        .header { display: flex; justify-content: space-between; border-bottom: 2px solid #111; padding-bottom: 12px; margin-bottom: 20px; }
        h1 { margin: 0; font-size: 22px; }
        p { margin: 4px 0; color: #444; font-size: 13px; }
        table { width: 100%; border-collapse: collapse; font-size: 13px; margin-top: 14px; }
        th, td { border: 1px solid #ddd; padding: 10px 12px; text-align: left; }
        th { background: #f1f5f9; font-weight: bold; }
        tr:nth-child(even) { background: #f8fafc; }
        @media print { body { padding: 0; } }
      </style>
    </head>
    <body>
      <div class="header">
        <div>
          <h1>INFINITY GAMERS // OFFICIAL PLAYERS HALL OF FAME</h1>
          <p>Verified Console Champions • PS5 Gaming Lounge</p>
        </div>
        <div style="text-align:right;">
          <p>Official Roster as of: ${new Date().toLocaleDateString()}</p>
        </div>
      </div>

      <table>
        <thead>
          <tr>
            <th>Rank</th>
            <th>Gamer Tag</th>
            <th>Customer Name</th>
            <th>Phone</th>
            <th>Verified Playtime</th>
            <th>Top Game</th>
            <th>Tier / Honor</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml}
        </tbody>
      </table>

      <script>
        window.onload = function() { window.print(); };
      </script>
    </body>
    </html>
  `);
  printWin.document.close();
};

function downloadBlob(content, filename, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 100);
}

// 10. NEWS & TOURNAMENTS
async function loadNews() {
  const container = document.getElementById("publishedNewsList");
  if (!container) return;

  try {
    const res = await fetch(`${API_BASE_URL}/api/news?_t=${Date.now()}`);
    if (!res.ok) throw new Error("HTTP " + res.status);
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
      result.textContent = `SUCCESS! Connected to backend API (uptime: ${Math.round(data.uptime || 0)}s).`;
      result.style.background = "rgba(16, 185, 129, 0.12)";
      result.style.color = "#6ee7b7";
    } else {
      throw new Error("HTTP " + res.status);
    }
  } catch (err) {
    result.textContent = `CONNECTION FAILED: ${err.message}. Make sure backend server is active and allows CORS.`;
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
function calculateElapsedMinutes(sessionOrIso) {
  if (!sessionOrIso) return 0;
  if (typeof sessionOrIso === "string") {
    const start = new Date(sessionOrIso).getTime();
    const diff = Date.now() - start;
    return diff > 0 ? Math.floor(diff / 60000) : 0;
  }
  const session = sessionOrIso;
  if (!session.inTime) return 0;
  const start = new Date(session.inTime).getTime();
  let pausedMs = Number(session.totalPausedMs) || 0;
  let endMs = Date.now();
  if (session.status === "completed" && session.outTime) {
    endMs = new Date(session.outTime).getTime();
  } else if (session.isPaused && session.pausedAt) {
    endMs = new Date(session.pausedAt).getTime();
  }
  const diff = endMs - start - pausedMs;
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
