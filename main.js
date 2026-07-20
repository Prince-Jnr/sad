const STORAGE_KEY = 'ledger-entries-v2';
const EDITION_KEY = 'ledger-edition';

let entries = [];
let currentFilter = 'all';
let searchQuery = '';
let currentSort = 'newest';

// ---------- DOM ----------
const entryForm = document.getElementById('entryForm');
const titleInput = document.getElementById('titleInput');
const prioritySelect = document.getElementById('prioritySelect');
const dueInput = document.getElementById('dueInput');
const categoryInput = document.getElementById('categoryInput');
const categorySuggestions = document.getElementById('categorySuggestions');
const formError = document.getElementById('formError');

const filterList = document.getElementById('filterList');
const sortSelect = document.getElementById('sortSelect');
const searchInput = document.getElementById('searchInput');

const taskList = document.getElementById('taskList');
const emptyState = document.getElementById('emptyState');

const statTotal = document.getElementById('statTotal');
const statDone = document.getElementById('statDone');
const statLeft = document.getElementById('statLeft');

const countAll = document.getElementById('countAll');
const countActive = document.getElementById('countActive');
const countCompleted = document.getElementById('countCompleted');
const countOverdue = document.getElementById('countOverdue');

const sealArc = document.getElementById('sealArc');
const sealPct = document.getElementById('sealPct');

const editionToggle = document.getElementById('editionToggle');
const editionTag = document.getElementById('editionTag');
const datelineToday = document.getElementById('datelineToday');

const clearCompletedBtn = document.getElementById('clearCompletedBtn');
const toast = document.getElementById('toast');

const SEAL_CIRCUMFERENCE = 2 * Math.PI * 42; // matches r=42 in SVG

const QUOTES = [
  '"What is written is not forgotten."',
  '"A docket cleared is a mind unburdened."',
  '"Small entries, kept faithfully, become a life in order."',
  '"The ledger does not judge — it only remembers."',
];

// ---------- Storage ----------
function saveEntries() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
}

function loadEntries() {
  const raw = localStorage.getItem(STORAGE_KEY);
  entries = raw ? JSON.parse(raw) : [];
}

function loadEdition() {
  const saved = localStorage.getItem(EDITION_KEY);
  if (saved === 'day') applyEdition('day');
  else applyEdition('night');
}

function applyEdition(mode) {
  document.body.classList.toggle('day', mode === 'day');
  editionTag.textContent = mode === 'day' ? 'Day Edition' : 'Night Edition';
  editionToggle.textContent = mode === 'day' ? '☾ Switch Edition' : '☀ Switch Edition';
  localStorage.setItem(EDITION_KEY, mode);
}

function toggleEdition() {
  const isDay = document.body.classList.contains('day');
  applyEdition(isDay ? 'night' : 'day');
}

// ---------- Utility ----------
function generateId() {
  return `entry-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function todayISO() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString().slice(0, 10);
}

function isOverdue(entry) {
  if (!entry.dueDate || entry.completed) return false;
  return entry.dueDate < todayISO();
}

function formatCreated(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function priorityRank(p) {
  return { high: 0, medium: 1, low: 2, none: 3 }[p] ?? 3;
}

function priorityLabel(p) {
  return { high: 'Urgent', medium: 'Ordinary', low: 'Minor', none: 'Unmarked' }[p] ?? 'Unmarked';
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function showToast(message) {
  toast.textContent = message;
  toast.hidden = false;
  requestAnimationFrame(() => toast.classList.add('show'));
  clearTimeout(toast._t);
  toast._t = setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => { toast.hidden = true; }, 250);
  }, 2200);
}

// ---------- CRUD ----------
function addEntry(title, priority, dueDate, category) {
  entries.unshift({
    id: generateId(),
    title: title.trim(),
    completed: false,
    createdAt: new Date().toISOString(),
    priority: priority || 'none',
    dueDate: dueDate || null,
    category: category.trim() || null,
  });
  saveEntries();
  refreshCategorySuggestions();
  render();
  showToast('Entry filed');
}

function deleteEntry(id) {
  entries = entries.filter((e) => e.id !== id);
  saveEntries();
  render();
  showToast('Entry struck from the record');
}

function toggleComplete(id) {
  const entry = entries.find((e) => e.id === id);
  if (!entry) return;
  entry.completed = !entry.completed;
  saveEntries();
  render();
  if (entry.completed && entries.length > 0 && entries.every((e) => e.completed)) {
    showToast('The docket is fully settled');
  }
}

function editEntry(id, newTitle) {
  const entry = entries.find((e) => e.id === id);
  if (!entry || !newTitle.trim()) return;
  entry.title = newTitle.trim();
  saveEntries();
  render();
  showToast('Entry amended');
}

function clearCompleted() {
  entries = entries.filter((e) => !e.completed);
  saveEntries();
  render();
  showToast('Settled entries struck from the record');
}

// ---------- Category autocomplete ----------
function refreshCategorySuggestions() {
  const cats = [...new Set(entries.map((e) => e.category).filter(Boolean))];
  categorySuggestions.innerHTML = cats.map((c) => `<option value="${escapeHtml(c)}"></option>`).join('');
}

// ---------- Filtering / Sorting / Searching ----------
function getVisibleEntries() {
  let list = entries.filter((e) => {
    if (currentFilter === 'active') return !e.completed;
    if (currentFilter === 'completed') return e.completed;
    if (currentFilter === 'overdue') return isOverdue(e);
    return true;
  });

  if (searchQuery.trim()) {
    const q = searchQuery.toLowerCase();
    list = list.filter(
      (e) =>
        e.title.toLowerCase().includes(q) ||
        (e.category && e.category.toLowerCase().includes(q))
    );
  }

  list = [...list].sort((a, b) => {
    switch (currentSort) {
      case 'oldest':
        return new Date(a.createdAt) - new Date(b.createdAt);
      case 'priority':
        return priorityRank(a.priority) - priorityRank(b.priority);
      case 'due':
        if (!a.dueDate && !b.dueDate) return 0;
        if (!a.dueDate) return 1;
        if (!b.dueDate) return -1;
        return a.dueDate.localeCompare(b.dueDate);
      case 'alpha':
        return a.title.localeCompare(b.title);
      case 'newest':
      default:
        return new Date(b.createdAt) - new Date(a.createdAt);
    }
  });

  return list;
}

// ---------- Rendering ----------
function render() {
  const visible = getVisibleEntries();
  taskList.innerHTML = '';

  if (visible.length === 0) {
    emptyState.hidden = false;
  } else {
    emptyState.hidden = true;
    visible.forEach((entry) => taskList.appendChild(buildEntryElement(entry)));
  }

  updateStats();
}

function buildEntryElement(entry) {
  const li = document.createElement('li');
  const overdue = isOverdue(entry);
  li.className = `task-item priority-${entry.priority}${entry.completed ? ' completed' : ''}`;
  li.dataset.id = entry.id;

  li.innerHTML = `
    <input type="checkbox" class="task-checkbox" ${entry.completed ? 'checked' : ''} aria-label="Mark settled" />
    <div class="task-body">
      <div class="task-title" data-role="title">${escapeHtml(entry.title)}</div>
      <div class="task-meta">
        <span class="tag-priority priority-${entry.priority}">${priorityLabel(entry.priority)}</span>
        ${entry.category ? `<span class="tag-section">${escapeHtml(entry.category)}</span>` : ''}
        <span class="tag-created">Filed ${formatCreated(entry.createdAt)}</span>
        ${entry.dueDate ? `<span class="tag-due ${overdue ? 'overdue' : ''}">Due ${entry.dueDate}${overdue ? ' — Overdue' : ''}</span>` : ''}
      </div>
    </div>
    <div class="task-actions">
      <button data-action="edit" title="Amend entry" aria-label="Amend entry">✎</button>
      <button data-action="delete" title="Strike entry" aria-label="Strike entry">✕</button>
    </div>
  `;

  li.querySelector('.task-checkbox').addEventListener('change', () => toggleComplete(entry.id));

  li.querySelector('[data-action="delete"]').addEventListener('click', () => {
    deleteEntry(entry.id);
  });

  li.querySelector('[data-action="edit"]').addEventListener('click', () => startEditing(li, entry));

  return li;
}

function startEditing(li, entry) {
  const body = li.querySelector('.task-body');
  const titleEl = body.querySelector('[data-role="title"]');

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'task-edit-input';
  input.value = entry.title;

  titleEl.replaceWith(input);
  input.focus();
  input.select();

  const finish = (commit) => {
    if (commit) editEntry(entry.id, input.value);
    else render();
  };

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') finish(true);
    if (e.key === 'Escape') finish(false);
  });
  input.addEventListener('blur', () => finish(true));
}

// ---------- Stats ----------
function updateStats() {
  const total = entries.length;
  const done = entries.filter((e) => e.completed).length;
  const left = total - done;
  const active = entries.filter((e) => !e.completed).length;
  const overdue = entries.filter((e) => isOverdue(e)).length;
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);

  statTotal.textContent = total;
  statDone.textContent = done;
  statLeft.textContent = left;

  countAll.textContent = total;
  countActive.textContent = active;
  countCompleted.textContent = done;
  countOverdue.textContent = overdue;

  const offset = SEAL_CIRCUMFERENCE - (pct / 100) * SEAL_CIRCUMFERENCE;
  sealArc.style.strokeDashoffset = offset;
  sealPct.textContent = `${pct}%`;
}

// ---------- Events ----------
entryForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const title = titleInput.value.trim();
  if (!title) {
    formError.hidden = false;
    titleInput.focus();
    return;
  }
  formError.hidden = true;
  addEntry(title, prioritySelect.value, dueInput.value, categoryInput.value);
  titleInput.value = '';
  dueInput.value = '';
  categoryInput.value = '';
  prioritySelect.value = 'medium';
  titleInput.focus();
});

titleInput.addEventListener('input', () => {
  if (titleInput.value.trim()) formError.hidden = true;
});

filterList.addEventListener('click', (e) => {
  const item = e.target.closest('.filter-item');
  if (!item) return;
  currentFilter = item.dataset.filter;
  [...filterList.children].forEach((c) => c.classList.remove('active'));
  item.classList.add('active');
  render();
});

sortSelect.addEventListener('change', (e) => {
  currentSort = e.target.value;
  render();
});

searchInput.addEventListener('input', (e) => {
  searchQuery = e.target.value;
  render();
});

document.addEventListener('keydown', (e) => {
  if (e.key === '/' && document.activeElement !== searchInput && document.activeElement !== titleInput) {
    e.preventDefault();
    searchInput.focus();
  }
});

clearCompletedBtn.addEventListener('click', () => {
  if (!entries.some((e) => e.completed)) {
    showToast('No settled entries to strike');
    return;
  }
  clearCompleted();
});

editionToggle.addEventListener('click', toggleEdition);

// ---------- Init ----------
function init() {
  loadEdition();
  loadEntries();
  refreshCategorySuggestions();

  datelineToday.textContent = new Date().toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });

  document.getElementById('footerQuote').textContent =
    QUOTES[Math.floor(Math.random() * QUOTES.length)];

  render();
}

init();
