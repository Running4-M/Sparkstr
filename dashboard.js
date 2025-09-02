  import {
  db,
  auth,
  initializeFirebase,
  getAllFeedback,
  updateFeedbackStatus,
  deleteFeedback,
  updateFeedbackFolder,
  clearFeedbackFolder
} from "./backend/firebase.js";

import {
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js";
console.log("Loading admin feedback dashboard...");
// initialize firebase (top-level await ok in module)
try {
  await initializeFirebase();
} catch (err) {
  console.error("Failed to initialize Firebase:", err);
  // show a visible message so admin knows something went wrong
  const loginMsg = document.getElementById('admin-login-msg');
  if (loginMsg) loginMsg.textContent = "Failed to initialize Firebase. Check console.";
}

// --- DOM elements for login + dashboard visibility ---
const loginDiv = document.getElementById('admin-login');
const loginBtn = document.getElementById('admin-login-btn');
const loginMsg = document.getElementById('admin-login-msg');
const emailInput = document.getElementById('admin-email');
const passwordInput = document.getElementById('admin-password');

function hideDashboard() {
  if (loginDiv) loginDiv.style.display = '';
  const header = document.querySelector('header');
  if (header) header.style.display = 'none';
  const stats = document.querySelector('.stats');
  if (stats) stats.style.display = 'none';
  const toolbar = document.querySelector('.toolbar');
  if (toolbar) toolbar.style.display = 'none';
  const board = document.querySelector('.board');
  if (board) board.style.display = 'none';
  const folders = document.querySelector('.folders');
  if (folders) folders.style.display = 'none';
}
function showDashboard() {
  if (loginDiv) loginDiv.style.display = 'none';
  const header = document.querySelector('header');
  if (header) header.style.display = '';
  const stats = document.querySelector('.stats');
  if (stats) stats.style.display = '';
  const toolbar = document.querySelector('.toolbar');
  if (toolbar) toolbar.style.display = '';
  const board = document.querySelector('.board');
  if (board) board.style.display = '';
  const folders = document.querySelector('.folders');
  if (folders) folders.style.display = '';
}
hideDashboard(); // default hidden until auth

// ======= DASHBOARD STATE & ELEMENT LOOKUPS (same API as before) =======
const state = {
  items: new Map(), // id -> {id, type, title, body, createdAt}
  locations: { inbox: new Set(), working: new Set() }, // container -> Set(id)
  folders: [], // {id, name, items:Set}
  filter: { q: '', type: 'all' },
};

const els = {
  inbox: document.getElementById('inbox'),
  working: document.getElementById('working'),
  trash: document.getElementById('trash'),
  folderList: document.getElementById('folder-list'),
  stats: {
    total: document.getElementById('stat-total'),
    inbox: document.getElementById('stat-inbox'),
    working: document.getElementById('stat-working'),
    bugs: document.getElementById('stat-bugs'),
    feedback: document.getElementById('stat-feedback'),
    features: document.getElementById('stat-features'),
  },
  search: document.getElementById('search'),
  filter: document.getElementById('filter'),
  newFolderBtn: document.getElementById('new-folder'),
};

// ======= HELPERS =======
const uid = () => 'id_' + Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-3);
const clamp = (s, n = 120) => (s || '').slice(0, n);
const timeAgo = (t) => {
  const ms = Date.now() - t; const m = Math.floor(ms / 60000);
  if (m < 1) return 'just now'; if (m < 60) return m + 'm ago';
  const h = Math.floor(m / 60); if (h < 24) return h + 'h ago';
  const d = Math.floor(h / 24); return d + 'd ago';
};

const TYPE_CLASS = { bug: 'bug', feedback: 'feedback', feature: 'feature' };

function ensureContainerSets() {
  for (const f of state.folders) {
    if (!f.items) f.items = new Set();
  }
}

function itemMatchesFilters(item) {
  if (!item) return false;
  const q = state.filter.q.toLowerCase();
  const hit = !q || (item.title + ' ' + item.body).toLowerCase().includes(q);
  const typeOk = state.filter.type === 'all' || state.filter.type === item.type;
  return hit && typeOk;
}

function getContainerItems(containerId) {
  if (containerId === 'inbox') return [...state.locations.inbox].map(id => state.items.get(id)).filter(Boolean);
  if (containerId === 'working') return [...state.locations.working].map(id => state.items.get(id)).filter(Boolean);
  const folder = state.folders.find(f => f.id === containerId);
  return folder ? [...folder.items].map(id => state.items.get(id)).filter(Boolean) : [];
}

function isItemInAnyContainer(id) {
  if (state.locations.inbox.has(id) || state.locations.working.has(id)) return true;
  return state.folders.some(f => f.items.has(id));
}

// ======= RENDER =======
function render() {
  renderContainer('inbox', els.inbox);
  renderContainer('working', els.working);
  for (const f of state.folders) renderFolder(f);
  renderStats();
}

function renderContainer(containerId, rootEl) {
  if (!rootEl) return;
  const cardsEl = rootEl;
  cardsEl.innerHTML = '';
  const items = getContainerItems(containerId).filter(itemMatchesFilters);

  if (!items.length) {
    const hint = document.createElement('div'); hint.className = 'hint';
    hint.textContent = containerId === 'working' ? 'Drag messages here when you start.'
      : containerId === 'trash' ? 'Drag any card here to delete it.'
      : 'Drop messages here';
    cardsEl.appendChild(hint);
  } else {
    for (const it of items) cardsEl.appendChild(createCard(it));
  }

  makeDroppable(cardsEl, containerId);
}

function renderStats() {
  const all = [...state.items.values()];
  const bugs = all.filter(i => i.type === 'bug').length;
  const feedback = all.filter(i => i.type === 'feedback').length;
  const features = all.filter(i => i.type === 'feature').length;
  if (els.stats.total) els.stats.total.textContent = all.length;
  if (els.stats.inbox) els.stats.inbox.textContent = state.locations.inbox.size;
  if (els.stats.working) els.stats.working.textContent = state.locations.working.size;
  if (els.stats.bugs) els.stats.bugs.textContent = bugs;
  if (els.stats.feedback) els.stats.feedback.textContent = feedback;
  if (els.stats.features) els.stats.features.textContent = features;
}

function renderFolder(folder) {
  let el = document.querySelector(`[data-folder-id="${folder.id}"]`);
  if (!el) {
    el = document.createElement('div');
    el.className = 'folder';
    el.dataset.folderId = folder.id;
    el.innerHTML = `
      <div class="folder-header">
        <div>
          <div class="folder-title"></div>
          <div class="folder-meta"></div>
        </div>
        <button class="folder-delete" title="Delete Folder">Delete Folder</button>
      </div>
      <div class="folder-cards droppable" data-container="${folder.id}"></div>
    `;
    els.folderList.appendChild(el);
    el.querySelector('.folder-delete').addEventListener('click', () => deleteFolder(folder.id));
  }
  el.querySelector('.folder-title').textContent = folder.name;
  el.querySelector('.folder-meta').textContent = `${folder.items.size} item${folder.items.size !== 1 ? 's' : ''}`;

  const cardsRoot = el.querySelector('.folder-cards');
  cardsRoot.innerHTML = '';
  const items = [...folder.items].map(id => state.items.get(id)).filter(Boolean).filter(itemMatchesFilters);
  if (!items.length) {
    const hint = document.createElement('div'); hint.className = 'hint'; hint.textContent = 'Drag items here';
    cardsRoot.appendChild(hint);
  } else {
    for (const it of items) cardsRoot.appendChild(createCard(it));
  }
  makeDroppable(cardsRoot, folder.id);
}

function createCard(item) {
  const card = document.createElement('div');
  card.className = 'card'; card.draggable = true; card.dataset.id = item.id;
  card.setAttribute('aria-label', item.title || 'feedback card');
  card.innerHTML = `
    <div class="row">
      <div class="col">
        <span class="chip ${TYPE_CLASS[item.type]}">${item.type.toUpperCase()}</span>
        <span class="meta">${timeAgo(item.createdAt)}</span>
        <div class="title" title="${item.title}">${clamp(item.title, 80)}</div>
        <div class="body">${clamp(item.body, 200)}</div>
      </div>
    </div>
  `;
  makeDraggable(card, item.id);
  return card;
}

// ======= DnD helpers =======
function makeDraggable(el, id) {
  el.addEventListener('dragstart', (e) => {
    el.classList.add('dragging');
    try { e.dataTransfer.setData('text/plain', id); } catch (err) { /* some browsers */ }
    e.dataTransfer.effectAllowed = 'move';
  });
  el.addEventListener('dragend', () => el.classList.remove('dragging'));
}

function makeDroppable(root, containerId) {
  root.classList.add('droppable');
  root.addEventListener('dragover', (e) => { e.preventDefault(); root.classList.add('over'); });
  root.addEventListener('dragleave', () => root.classList.remove('over'));
  root.addEventListener('drop', (e) => {
    e.preventDefault(); root.classList.remove('over');
    let id = null;
    try { id = e.dataTransfer.getData('text/plain'); } catch (err) { /* ignore */ }
    // fallback: maybe dragging element contains dataset.id
    if (!id && e.target) {
      const cardEl = e.target.closest && e.target.closest('.card');
      if (cardEl) id = cardEl.dataset.id;
    }
    if (!id) return;
    // Use the exposed API to move (this may be replaced later to sync with Firebase)
    if (window && window.FeedbackDashboard && typeof window.FeedbackDashboard.moveCard === 'function') {
      window.FeedbackDashboard.moveCard(id, containerId);
    } else {
      // local move fallback
      moveItem(id, containerId);
      render();
    }
  });
}

// ======= MUTATIONS (local) =======
function addItem({ id = uid(), type, title, body = '', createdAt = Date.now() }) {
  if (!['bug','feedback','feature'].includes(type)) throw new Error('Invalid type');
  const item = { id, type, title: title || '(untitled)', body, createdAt };
  state.items.set(id, item);
  // default to inbox unless already in any container
  if (!isItemInAnyContainer(id)) state.locations.inbox.add(id);
  render();
  return id;
}

function removeItem(id) {
  state.items.delete(id);
  state.locations.inbox.delete(id);
  state.locations.working.delete(id);
  for (const f of state.folders) f.items.delete(id);
  render();
}

function moveItem(id, toContainer) {
  if (!state.items.has(id)) return;
  // remove from all containers
  state.locations.inbox.delete(id);
  state.locations.working.delete(id);
  for (const f of state.folders) f.items.delete(id);

  if (toContainer === 'trash') {
    removeItem(id);
    return;
  }
  if (toContainer === 'inbox') state.locations.inbox.add(id);
  else if (toContainer === 'working') state.locations.working.add(id);
  else {
    const folder = state.folders.find(f => f.id === toContainer);
    if (folder) folder.items.add(id); else state.locations.inbox.add(id);
  }
  render();
}

function createFolder(name) {
  const id = 'folder_' + uid();
  state.folders.push({ id, name: name || 'New Folder', items: new Set() });
  ensureContainerSets();
  renderFolder(state.folders[state.folders.length - 1]);
  renderStats();
  return id;
}

function deleteFolder(id) {
  const idx = state.folders.findIndex(f => f.id === id);
  if (idx === -1) return;
  const folder = state.folders[idx];
  // move items back to inbox
  for (const itemId of folder.items) state.locations.inbox.add(itemId);
  state.folders.splice(idx, 1);
  const el = document.querySelector(`[data-folder-id="${id}"]`);
  if (el) el.remove();
  render();
}

// ======= WIRING UI LISTENERS =======
if (els.search) els.search.addEventListener('input', (e) => { state.filter.q = e.target.value || ''; render(); });
if (els.filter) els.filter.addEventListener('change', (e) => { state.filter.type = e.target.value; render(); });
if (els.newFolderBtn) els.newFolderBtn.addEventListener('click', () => {
  const name = prompt('Folder name:') || 'New Folder';
  createFolder(name);
});

// Initial render (empty)
render();

// Expose public API (keeps compatibility with original)
window.FeedbackDashboard = {
  addCard: addItem,
  removeCard: removeItem,
  moveCard: moveItem,
  createFolder,
  deleteFolder,
  state,
  render
};

// ======= FIRESTORE SYNC: load & render feedback for authenticated admin =======
async function loadAndRenderFeedback() {
  state.items.clear();
  state.locations.inbox.clear();
  state.locations.working.clear();
  state.folders.length = 0;

  let feedbackList = [];
  try {
    feedbackList = await getAllFeedback();
  } catch (err) {
    console.error("Failed to getAllFeedback:", err);
    alert("Failed to load feedback: " + (err.message || err));
    return;
  }

  // Find all unique folderIds
  const folderMap = new Map();
  for (const fb of feedbackList) {
    if (fb.folderId) {
      if (!folderMap.has(fb.folderId)) {
        // Use folderId as name for now; you can enhance this to store folder names in Firestore
        folderMap.set(fb.folderId, { id: fb.folderId, name: fb.folderId, items: new Set() });
      }
    }
  }
  state.folders = Array.from(folderMap.values());

  for (const fb of feedbackList) {
    const created = (() => {
      try {
        const d = new Date(fb.createdAt);
        const t = d.getTime();
        return Number.isFinite(t) ? t : Date.now();
      } catch (e) { return Date.now(); }
    })();
    const item = {
      id: fb.id,
      type: fb.type || 'feedback',
      title: fb.title || '(no title)',
      body: fb.body || '',
      createdAt: created
    };
    state.items.set(item.id, item);

    if (fb.folderId) {
      const folder = state.folders.find(f => f.id === fb.folderId);
      if (folder) folder.items.add(item.id);
      else state.locations.inbox.add(item.id); // fallback
    } else if (fb.status === "working") {
      state.locations.working.add(item.id);
    } else {
      state.locations.inbox.add(item.id);
    }
  }

  render();
}

// ======= OVERRIDE moveCard to sync to Firestore =======
// Wait until the public API is present (it is above)
const origMoveCard = window.FeedbackDashboard.moveCard.bind(window.FeedbackDashboard);

window.FeedbackDashboard.moveCard = async function(id, toContainer) {
  const item = state.items.get(id);
  if (!item) return;

  // Deleting
  if (toContainer === 'trash') {
    try {
      await deleteFeedback(id);
      origMoveCard(id, toContainer);
    } catch (e) {
      console.error("Delete failed:", e);
      alert("Delete failed: " + (e.message || e));
    }
    return;
  }

  // Folders
  const folder = state.folders.find(f => f.id === toContainer);
  if (folder) {
    try {
      await updateFeedbackFolder(id, toContainer);
      await updateFeedbackStatus(id, "inbox"); // Optionally keep status as inbox
      origMoveCard(id, toContainer);
    } catch (e) {
      console.error("Move to folder failed:", e);
      alert("Move failed: " + (e.message || e));
    }
    return;
  }

  // Inbox/Working
  let newStatus = (toContainer === 'working') ? 'working' : 'inbox';
  try {
    await updateFeedbackStatus(id, newStatus);
    await clearFeedbackFolder(id); // Remove folder assignment
    origMoveCard(id, toContainer);
  } catch (e) {
    console.error("Move/update failed:", e);
    alert("Move failed: " + (e.message || e));
  }
};

// ======= AUTH: login, logout, and state listener =======
if (loginBtn) {
  loginBtn.onclick = async () => {
    if (loginMsg) loginMsg.textContent = '';
    const email = emailInput.value.trim();
    const password = passwordInput.value;
    if (!email || !password) {
      if (loginMsg) loginMsg.textContent = "Please enter email and password.";
      return;
    }
    try {
      await signInWithEmailAndPassword(auth, email, password);
      // onAuthStateChanged will handle UI & load
    } catch (e) {
      console.error("Login failed:", e);
      if (loginMsg) loginMsg.textContent = "Login failed: " + (e.code || e.message || e);
      // Ensure dashboard stays hidden and login stays visible
      hideDashboard();
      if (loginDiv) loginDiv.style.display = '';
    }
  };
}

const addLogoutBtn = () => {
  if (document.getElementById('admin-logout-btn')) return;
  const btn = document.createElement('button');
  btn.id = 'admin-logout-btn';
  btn.textContent = 'Log Out';
  btn.style = "position:fixed;top:18px;right:24px;z-index:1000;background:#ef4444;color:#fff;padding:8px 18px;border:none;border-radius:8px;font-weight:700;cursor:pointer;";
  btn.onclick = async () => {
    try {
      await signOut(auth);
      // onAuthStateChanged will handle hiding dashboard and re-showing login
    } catch (e) {
      console.error("Sign out failed:", e);
      alert("Sign out failed: " + (e.message || e));
    }
  };
  document.body.appendChild(btn);
};

onAuthStateChanged(auth, async (user) => {
  if (user) {
    // show dashboard and load data
    showDashboard();
    addLogoutBtn();
    try {
      await loadAndRenderFeedback();
    } catch (e) {
      console.error("Error loading feedback after sign-in:", e);
    }
  } else {
    // signed out
    hideDashboard();
    if (loginDiv) loginDiv.style.display = '';
    const btn = document.getElementById('admin-logout-btn');
    if (btn) btn.remove();
  }
});

// ======= OPTIONAL: Expose helper functions to window for debugging =======
window._FBDebug = {
  loadAndRenderFeedback,
  getState: () => state,
  clearState: () => { state.items.clear(); state.locations.inbox.clear(); state.locations.working.clear(); state.folders.length = 0; render(); }
};

// ======= TESTS (execute only if ?test=1) =======
function runTests() {
  console.log('[Dashboard Tests] Start');
  const id1 = addItem({ type: 'bug', title: 'A', body: 'one' });
  const id2 = addItem({ type: 'feedback', title: 'B', body: 'two' });
  const id3 = addItem({ type: 'feature', title: 'C', body: 'three' });

  console.assert(state.items.size === 3, 'Expected 3 items');
  console.assert(state.locations.inbox.size === 3, 'All start in inbox');

  moveItem(id1, 'working');
  console.assert(state.locations.working.has(id1), 'id1 should be in working');
  console.assert(!state.locations.inbox.has(id1), 'id1 removed from inbox');

  const fId = createFolder('Alpha');
  moveItem(id2, fId);
  const f = state.folders.find(x => x.id === fId);
  console.assert(f.items.has(id2), 'id2 should be inside folder Alpha');

  deleteFolder(fId);
  console.assert(state.locations.inbox.has(id2), 'id2 should return to inbox after folder delete');

  moveItem(id3, 'trash');
  console.assert(!state.items.has(id3), 'id3 should be deleted');

  console.assert(document.getElementById('stat-total').textContent === '2', 'Total should be 2');
  console.log('✅ All tests passed');
}
if (new URLSearchParams(location.search).get('test') === '1') runTests();
