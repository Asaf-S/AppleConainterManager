/* global window, document */
'use strict';

// ─── State ────────────────────────────────────────────────────────────────────
const state = {
  currentTab: 'images',
  images: [],
  containers: [],
  volumes: [],
  systemRunning: false,
  executableFound: true,
  isLoading: false,
  selectedImages: new Set(),
  selectedContainers: new Set(),
  selectedVolumes: new Set(),
  searchImages: '',
  searchContainers: '',
  searchVolumes: '',
  showRunningOnly: false,
};

const api = window.electronAPI;

// ─── Helpers ──────────────────────────────────────────────────────────────────
function $(id) { return document.getElementById(id); }
function fmtDate(s) {
  if (!s) return '—';
  try { return new Date(s).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }); } catch { return s; }
}
function esc(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

let errorTimer;
function showError(msg) {
  const el = $('error-toast');
  el.textContent = msg;
  el.classList.add('open');
  clearTimeout(errorTimer);
  errorTimer = setTimeout(() => el.classList.remove('open'), 5000);
}

function showProgress(msg) {
  $('progress-overlay').classList.add('open');
  $('progress-msg').textContent = msg || 'Please wait…';
}
function hideProgress() { $('progress-overlay').classList.remove('open'); }

// ─── Progress events ──────────────────────────────────────────────────────────
api.onProgress((msg) => {
  if (msg && msg.trim()) $('progress-msg').textContent = msg.trim();
});

// ─── Tab management ───────────────────────────────────────────────────────────
function switchTab(tab) {
  state.currentTab = tab;
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.toggle('active', p.id === `panel-${tab}`));
}

document.querySelectorAll('.tab-btn').forEach(b => b.addEventListener('click', () => switchTab(b.dataset.tab)));

// ─── System status ────────────────────────────────────────────────────────────
async function refreshSystemStatus() {
  const res = await api.systemStatus();
  if (res.success && res.data) {
    state.systemRunning = res.data.running;
    state.executableFound = true;
  } else {
    state.systemRunning = false;
  }
  updateSystemUI();
}

function updateSystemUI() {
  const dot = $('status-dot');
  const label = $('status-label');
  const startBtn = $('start-btn');
  const stopBtn = $('stop-btn');

  dot.className = 'running-dot ' + (state.systemRunning ? 'running' : 'stopped');
  // use id-based approach
  $('status-dot').className = state.systemRunning ? 'running' : 'stopped';
  $('status-label').textContent = state.systemRunning ? 'Running' : 'Stopped';
  startBtn.style.display = state.systemRunning ? 'none' : '';
  stopBtn.style.display = state.systemRunning ? '' : 'none';

  // Show exec-missing or system-stopped overlays if needed
  $('exec-missing').classList.toggle('visible', !state.executableFound);
  $('system-stopped').classList.toggle('visible', state.executableFound && !state.systemRunning);
  $('content').style.display = (state.executableFound && state.systemRunning) ? '' : 'none';
}

$('start-btn').addEventListener('click', async () => {
  showProgress('Starting system services…');
  const res = await api.systemStart();
  hideProgress();
  if (!res.success) { showError(res.error || 'Failed to start system'); return; }
  await refreshSystemStatus();
  refreshCurrentTab();
});

$('stop-btn').addEventListener('click', async () => {
  showProgress('Stopping system services…');
  const res = await api.systemStop();
  hideProgress();
  if (!res.success) { showError(res.error || 'Failed to stop system'); return; }
  await refreshSystemStatus();
});

// ─── Search ───────────────────────────────────────────────────────────────────
$('search-images').addEventListener('input', e => { state.searchImages = e.target.value; renderImages(); });
$('search-containers').addEventListener('input', e => { state.searchContainers = e.target.value; renderContainers(); });
$('search-volumes').addEventListener('input', e => { state.searchVolumes = e.target.value; renderVolumes(); });
$('toggle-running').addEventListener('change', e => { state.showRunningOnly = e.target.checked; renderContainers(); });

// ─── IMAGES ───────────────────────────────────────────────────────────────────
async function refreshImages() {
  const res = await api.imageList();
  if (res.success) { state.images = res.data || []; state.selectedImages.clear(); }
  else showError(res.error || 'Failed to load images');
  renderImages();
  $('images-updated').textContent = 'Updated ' + new Date().toLocaleTimeString();
}

function filteredImages() {
  const q = state.searchImages.toLowerCase();
  return q ? state.images.filter(i => (i.name+i.tag+i.reference).toLowerCase().includes(q)) : state.images;
}

function renderImages() {
  const list = filteredImages();
  const tbody = $('images-tbody');
  $('images-count').textContent = `${list.length} image${list.length !== 1 ? 's' : ''}`;

  if (list.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:32px;color:var(--text-secondary)">
      ${state.images.length === 0 ? 'No images found. Pull or build an image to get started.' : 'No images match your search.'}
    </td></tr>`;
    return;
  }

  tbody.innerHTML = list.map(img => `
    <tr data-ref="${esc(img.reference)}">
      <td class="check-col"><input type="checkbox" ${state.selectedImages.has(img.reference) ? 'checked' : ''} data-ref="${esc(img.reference)}"></td>
      <td title="${esc(img.name)}">${esc(img.name)}</td>
      <td>${esc(img.tag)}</td>
      <td style="font-family:monospace;font-size:11px" title="${esc(img.digest)}">${img.digest ? img.digest.slice(7,19) : '—'}</td>
      <td>${esc(img.fullSize || '—')}</td>
      <td class="actions">
        <button class="row-btn" onclick="openCreateContainerFromImage('${esc(img.reference)}')">Run</button>
        <button class="row-btn" onclick="openSaveImageModal('${esc(img.reference)}')">Save</button>
        <button class="row-btn danger" onclick="deleteImages(['${esc(img.reference)}'])">Delete</button>
      </td>
    </tr>
  `).join('');

  tbody.querySelectorAll('input[type="checkbox"]').forEach(cb => {
    cb.addEventListener('change', () => {
      const ref = cb.dataset.ref;
      if (cb.checked) state.selectedImages.add(ref); else state.selectedImages.delete(ref);
      updateImageToolbar();
    });
  });

  updateImageToolbar();
}

function updateImageToolbar() {
  const n = state.selectedImages.size;
  $('del-images-btn').disabled = n === 0;
  $('save-images-btn').disabled = n === 0;
}

$('del-images-btn').addEventListener('click', () => {
  if (state.selectedImages.size === 0) return;
  deleteImages(Array.from(state.selectedImages));
});

$('save-images-btn').addEventListener('click', () => {
  if (state.selectedImages.size === 0) return;
  openSaveImageModal(Array.from(state.selectedImages).join(','));
});

async function deleteImages(refs) {
  if (!confirm(`Delete ${refs.length} image(s)? This cannot be undone.`)) return;
  showProgress(`Deleting images…`);
  const res = await api.imageDelete(refs);
  hideProgress();
  if (!res.success) showError(res.error || 'Failed to delete images');
  await refreshImages();
}

$('refresh-images-btn').addEventListener('click', refreshImages);

// Pull modal
$('pull-btn').addEventListener('click', () => openModal('pull-modal'));
function openModal(id) { $(id).classList.add('open'); }
function closeModal(id) { $(id).classList.remove('open'); }
document.querySelectorAll('.modal-backdrop').forEach(m => {
  m.addEventListener('click', e => { if (e.target === m) m.classList.remove('open'); });
});
document.querySelectorAll('[data-close]').forEach(b => {
  b.addEventListener('click', () => closeModal(b.dataset.close));
});

$('pull-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const ref = $('pull-ref').value.trim();
  const platform = $('pull-platform').value.trim();
  if (!ref) return;
  closeModal('pull-modal');
  showProgress(`Pulling ${ref}…`);
  const res = await api.imagePull(ref, platform || undefined);
  hideProgress();
  if (!res.success) showError(res.error || 'Failed to pull image');
  else await refreshImages();
});

// Build modal
$('build-btn').addEventListener('click', () => openModal('build-modal'));

$('build-context-btn').addEventListener('click', async () => {
  const p = await api.openFolderPicker();
  if (p) $('build-context').value = p;
});
$('build-dockerfile-btn').addEventListener('click', async () => {
  const p = await api.openFilePicker([{ name: 'Dockerfile', extensions: ['*'] }]);
  if (p) $('build-dockerfile').value = p;
});

$('build-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const contextPath = $('build-context').value.trim();
  const tag = $('build-tag').value.trim();
  if (!contextPath) { showError('Context directory is required'); return; }
  const opts = {
    contextPath,
    tag: tag || undefined,
    dockerfile: $('build-dockerfile').value.trim() || undefined,
    platforms: $('build-platforms').value.trim() || undefined,
    targetStage: $('build-target').value.trim() || undefined,
    buildArgs: collectKvList('build-args-list'),
  };
  closeModal('build-modal');
  showProgress(`Building image…`);
  const res = await api.imageBuild(opts);
  hideProgress();
  if (!res.success) showError(res.error || 'Build failed');
  else await refreshImages();
});

// Load modal
$('load-btn').addEventListener('click', () => openModal('load-modal'));
$('load-file-btn').addEventListener('click', async () => {
  const p = await api.openFilePicker([{ name: 'Tar archive', extensions: ['tar', 'tgz', 'tar.gz', '*'] }]);
  if (p) $('load-file').value = p;
});
$('load-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const tarPath = $('load-file').value.trim();
  if (!tarPath) return;
  closeModal('load-modal');
  showProgress(`Loading images from archive…`);
  const res = await api.imageLoad(tarPath);
  hideProgress();
  if (!res.success) showError(res.error || 'Failed to load images');
  else await refreshImages();
});

// Save modal
function openSaveImageModal(refs) {
  $('save-refs').value = refs;
  openModal('save-modal');
}
$('save-output-btn').addEventListener('click', async () => {
  const p = await api.saveFilePicker('images.tar');
  if (p) $('save-output').value = p;
});
$('save-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const refsRaw = $('save-refs').value.trim();
  const outputPath = $('save-output').value.trim();
  if (!refsRaw || !outputPath) return;
  const references = refsRaw.split(',').map(s => s.trim()).filter(Boolean);
  closeModal('save-modal');
  showProgress(`Saving images…`);
  const res = await api.imageSave({ references, outputPath, platform: $('save-platform').value.trim() || undefined });
  hideProgress();
  if (!res.success) showError(res.error || 'Failed to save images');
});

// ─── CONTAINERS ───────────────────────────────────────────────────────────────
async function refreshContainers() {
  const res = await api.containerList();
  if (res.success) { state.containers = res.data || []; state.selectedContainers.clear(); }
  else showError(res.error || 'Failed to load containers');
  renderContainers();
  $('containers-updated').textContent = 'Updated ' + new Date().toLocaleTimeString();
}

function filteredContainers() {
  let list = state.containers;
  if (state.showRunningOnly) list = list.filter(c => c.status === 'running');
  const q = state.searchContainers.toLowerCase();
  if (q) list = list.filter(c => (c.name+c.image+c.status).toLowerCase().includes(q));
  return list;
}

function statusBadge(status) {
  const cls = ['running','stopped','created','exited'].includes(status) ? status : 'stopped';
  return `<span class="badge ${cls}">${esc(status)}</span>`;
}

function renderContainers() {
  const list = filteredContainers();
  const tbody = $('containers-tbody');
  $('containers-count').textContent = `${list.length} container${list.length !== 1 ? 's' : ''}`;

  if (list.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:32px;color:var(--text-secondary)">
      ${state.containers.length === 0 ? 'No containers found. Run a container to get started.' : 'No containers match your search.'}
    </td></tr>`;
    return;
  }

  tbody.innerHTML = list.map(c => {
    const isRunning = c.status === 'running';
    return `
    <tr data-id="${esc(c.id)}">
      <td class="check-col"><input type="checkbox" ${state.selectedContainers.has(c.id) ? 'checked' : ''} data-id="${esc(c.id)}"></td>
      <td><a href="#" onclick="openContainerDetail('${esc(c.id)}');return false" style="color:var(--accent);text-decoration:none">${esc(c.name || c.id)}</a></td>
      <td title="${esc(c.image)}">${esc(c.image)}</td>
      <td>${esc((c.ports||[]).join(', ') || '—')}</td>
      <td>${esc(c.os || '—')}</td>
      <td>${esc(c.arch || '—')}</td>
      <td>${statusBadge(c.status)}</td>
      <td class="actions">
        ${isRunning
          ? `<button class="row-btn" onclick="stopContainer('${esc(c.id)}')">Stop</button>`
          : `<button class="row-btn" onclick="startContainer('${esc(c.id)}')">Start</button>`
        }
        <button class="row-btn danger" onclick="deleteContainers(['${esc(c.id)}'])">Delete</button>
      </td>
    </tr>`;
  }).join('');

  tbody.querySelectorAll('input[type="checkbox"]').forEach(cb => {
    cb.addEventListener('change', () => {
      const id = cb.dataset.id;
      if (cb.checked) state.selectedContainers.add(id); else state.selectedContainers.delete(id);
      updateContainerToolbar();
    });
  });
  updateContainerToolbar();
}

function updateContainerToolbar() {
  const n = state.selectedContainers.size;
  $('del-containers-btn').disabled = n === 0;
  $('stop-containers-btn').disabled = n === 0;
}

async function startContainer(name) {
  showProgress(`Starting ${name}…`);
  const res = await api.containerStart(name);
  hideProgress();
  if (!res.success) showError(res.error || 'Failed to start container');
  await refreshContainers();
}

async function stopContainer(name) {
  showProgress(`Stopping ${name}…`);
  const res = await api.containerStop(name);
  hideProgress();
  if (!res.success) showError(res.error || 'Failed to stop container');
  await refreshContainers();
}

async function deleteContainers(names) {
  if (!confirm(`Delete ${names.length} container(s)? This cannot be undone.`)) return;
  showProgress(`Deleting containers…`);
  const res = await api.containerDelete(names);
  hideProgress();
  if (!res.success) showError(res.error || 'Failed to delete containers');
  await refreshContainers();
}

$('del-containers-btn').addEventListener('click', () => {
  if (state.selectedContainers.size === 0) return;
  deleteContainers(Array.from(state.selectedContainers));
});
$('stop-containers-btn').addEventListener('click', async () => {
  if (state.selectedContainers.size === 0) return;
  for (const id of state.selectedContainers) await stopContainer(id);
});
$('refresh-containers-btn').addEventListener('click', refreshContainers);

// Create container modal
$('create-container-btn').addEventListener('click', () => openCreateContainerFromImage(''));
function openCreateContainerFromImage(imageRef) {
  $('run-image').value = imageRef || '';
  $('run-name').value = '';
  clearKvList('run-ports-list');
  clearKvList('run-envs-list');
  clearKvList('run-vols-list');
  openModal('run-modal');
}

$('run-image-picker').addEventListener('click', async () => {
  // Let user type image ref; just open local images picker via prompt for simplicity
  const ref = prompt('Enter image reference (e.g. alpine:latest):', $('run-image').value);
  if (ref) $('run-image').value = ref;
});

$('run-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const image = $('run-image').value.trim();
  if (!image) { showError('Image reference is required'); return; }
  const opts = {
    image,
    name: $('run-name').value.trim() || undefined,
    ports: collectKvList('run-ports-list').filter(Boolean),
    envs: collectKvList('run-envs-list').filter(Boolean),
    volumes: collectKvList('run-vols-list').filter(Boolean),
  };
  closeModal('run-modal');
  showProgress(`Creating container…`);
  const res = await api.containerRun(opts);
  hideProgress();
  if (!res.success) showError(res.error || 'Failed to create container');
  else await refreshContainers();
});

// Container detail modal
async function openContainerDetail(id) {
  $('detail-name').textContent = id;
  $('detail-inspect').innerHTML = '<p style="color:var(--text-secondary)">Loading…</p>';
  $('detail-logs').textContent = 'Loading…';
  switchDetailTab('inspect');
  openModal('detail-modal');

  const [inspectRes, logsRes] = await Promise.all([
    api.containerInspect(id),
    api.containerLogs(id),
  ]);

  if (inspectRes.success && inspectRes.data) {
    renderInspect(inspectRes.data);
  } else {
    $('detail-inspect').innerHTML = `<p style="color:var(--danger)">${esc(inspectRes.error || 'Failed to inspect')}</p>`;
  }

  $('detail-logs').textContent = logsRes.success ? (logsRes.data || '(no logs)') : (logsRes.error || 'Failed to load logs');
}

function switchDetailTab(tab) {
  document.querySelectorAll('.seg-btn').forEach(b => b.classList.toggle('active', b.dataset.seg === tab));
  $('detail-inspect').style.display = tab === 'inspect' ? '' : 'none';
  $('detail-logs').style.display = tab === 'logs' ? '' : 'none';
}
document.querySelectorAll('.seg-btn').forEach(b => b.addEventListener('click', () => switchDetailTab(b.dataset.seg)));

function renderInspect(data) {
  const c = Array.isArray(data) ? data[0] : data;
  if (!c) { $('detail-inspect').innerHTML = '<p style="color:var(--text-secondary)">No data</p>'; return; }

  const rows = (obj) => Object.entries(obj || {}).map(([k,v]) =>
    `<dt>${esc(k)}</dt><dd>${esc(JSON.stringify(v))}</dd>`).join('');

  $('detail-inspect').innerHTML = `
    <div class="detail-section">
      <h3>General</h3>
      <dl class="detail-grid">
        <dt>ID</dt><dd>${esc(c.id||c.name||'—')}</dd>
        <dt>Image</dt><dd>${esc(c.image||'—')}</dd>
        <dt>Status</dt><dd>${esc(c.status||'—')}</dd>
        <dt>OS/Arch</dt><dd>${esc((c.os||'—')+' / '+(c.arch||'—'))}</dd>
      </dl>
    </div>
    ${c.ports?.length ? `<div class="detail-section"><h3>Ports</h3><dl class="detail-grid">${(c.ports||[]).map(p=>`<dt></dt><dd>${esc(p)}</dd>`).join('')}</dl></div>` : ''}
    ${c.mounts?.length ? `<div class="detail-section"><h3>Mounts</h3><dl class="detail-grid">${(c.mounts||[]).map(m=>`<dt></dt><dd>${esc(JSON.stringify(m))}</dd>`).join('')}</dl></div>` : ''}
    ${c.config?.config?.Env?.length ? `<div class="detail-section"><h3>Environment</h3><dl class="detail-grid">${(c.config.config.Env||[]).map(e=>`<dt></dt><dd>${esc(e)}</dd>`).join('')}</dl></div>` : ''}
  `;
}

// ─── VOLUMES ──────────────────────────────────────────────────────────────────
async function refreshVolumes() {
  const res = await api.volumeList();
  if (res.success) { state.volumes = res.data || []; state.selectedVolumes.clear(); }
  else showError(res.error || 'Failed to load volumes');
  renderVolumes();
  $('volumes-updated').textContent = 'Updated ' + new Date().toLocaleTimeString();
}

function filteredVolumes() {
  const q = state.searchVolumes.toLowerCase();
  return q ? state.volumes.filter(v => v.name.toLowerCase().includes(q)) : state.volumes;
}

function renderVolumes() {
  const list = filteredVolumes();
  const tbody = $('volumes-tbody');
  $('volumes-count').textContent = `${list.length} volume${list.length !== 1 ? 's' : ''}`;

  if (list.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:32px;color:var(--text-secondary)">
      ${state.volumes.length === 0 ? 'No volumes found.' : 'No volumes match your search.'}
    </td></tr>`;
    return;
  }

  tbody.innerHTML = list.map(v => `
    <tr data-name="${esc(v.name)}">
      <td class="check-col"><input type="checkbox" ${state.selectedVolumes.has(v.name) ? 'checked' : ''} data-name="${esc(v.name)}"></td>
      <td>${esc(v.name)}</td>
      <td>${esc(v.driver || '—')}</td>
      <td>${esc(v.size || '—')}</td>
      <td>${fmtDate(v.created)}</td>
      <td class="actions">
        <button class="row-btn danger" onclick="deleteVolumes(['${esc(v.name)}'])">Delete</button>
      </td>
    </tr>
  `).join('');

  tbody.querySelectorAll('input[type="checkbox"]').forEach(cb => {
    cb.addEventListener('change', () => {
      const name = cb.dataset.name;
      if (cb.checked) state.selectedVolumes.add(name); else state.selectedVolumes.delete(name);
      updateVolumeToolbar();
    });
  });
  updateVolumeToolbar();
}

function updateVolumeToolbar() {
  $('del-volumes-btn').disabled = state.selectedVolumes.size === 0;
}

async function deleteVolumes(names) {
  if (!confirm(`Delete ${names.length} volume(s)? This cannot be undone.`)) return;
  showProgress(`Deleting volumes…`);
  const res = await api.volumeDelete(names);
  hideProgress();
  if (!res.success) showError(res.error || 'Failed to delete volumes');
  await refreshVolumes();
}

$('del-volumes-btn').addEventListener('click', () => {
  if (state.selectedVolumes.size === 0) return;
  deleteVolumes(Array.from(state.selectedVolumes));
});
$('refresh-volumes-btn').addEventListener('click', refreshVolumes);

$('create-volume-btn').addEventListener('click', () => {
  $('vol-name').value = '';
  $('vol-size').value = '';
  clearKvList('vol-labels-list');
  openModal('volume-modal');
});

$('volume-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = $('vol-name').value.trim();
  if (!name) { showError('Volume name is required'); return; }
  const opts = {
    name,
    size: $('vol-size').value.trim() || undefined,
    labels: collectKvList('vol-labels-list').filter(Boolean),
  };
  closeModal('volume-modal');
  showProgress(`Creating volume ${name}…`);
  const res = await api.volumeCreate(opts);
  hideProgress();
  if (!res.success) showError(res.error || 'Failed to create volume');
  else await refreshVolumes();
});

// ─── Settings ─────────────────────────────────────────────────────────────────
$('settings-btn').addEventListener('click', async () => {
  const settings = await api.getSettings();
  $('exec-path').value = settings.executablePath || '';
  await checkExecPath();
  openModal('settings-modal');
});

$('exec-path').addEventListener('input', checkExecPath);

async function checkExecPath() {
  const p = $('exec-path').value.trim();
  if (!p) { $('exec-status').textContent = ''; return; }
  const ok = await api.executableExists(p);
  $('exec-status').className = 'exec-status ' + (ok ? 'ok' : 'fail');
  $('exec-status').textContent = ok ? '✓ Found' : '✗ Not found';
}

$('exec-browse-btn').addEventListener('click', async () => {
  const p = await api.openFilePicker([{ name: 'Executable', extensions: ['*'] }]);
  if (p) { $('exec-path').value = p; await checkExecPath(); }
});

$('settings-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const settings = { executablePath: $('exec-path').value.trim() };
  await api.setSettings(settings);
  closeModal('settings-modal');
  await refreshSystemStatus();
  if (state.systemRunning) refreshCurrentTab();
});

// ─── Key-value list helpers ───────────────────────────────────────────────────
function collectKvList(listId) {
  const list = $(listId);
  return Array.from(list.querySelectorAll('input')).map(i => i.value.trim());
}

function clearKvList(listId) {
  $(listId).innerHTML = '';
}

function addKvRow(listId, placeholder, value) {
  const list = $(listId);
  const row = document.createElement('div');
  row.className = 'kv-row';
  row.innerHTML = `
    <input type="text" placeholder="${esc(placeholder)}" value="${esc(value||'')}">
    <button type="button" class="remove-btn" title="Remove">×</button>
  `;
  row.querySelector('.remove-btn').addEventListener('click', () => row.remove());
  list.appendChild(row);
}

// Wire up "Add" buttons
document.querySelectorAll('[data-add-kv]').forEach(btn => {
  btn.addEventListener('click', () => {
    addKvRow(btn.dataset.addKv, btn.dataset.placeholder || 'value', '');
  });
});

// ─── Refresh current tab ──────────────────────────────────────────────────────
function refreshCurrentTab() {
  if (state.currentTab === 'images') refreshImages();
  else if (state.currentTab === 'containers') refreshContainers();
  else if (state.currentTab === 'volumes') refreshVolumes();
}

// ─── Init ─────────────────────────────────────────────────────────────────────
async function init() {
  await refreshSystemStatus();
  if (state.executableFound && state.systemRunning) {
    await Promise.all([refreshImages(), refreshContainers(), refreshVolumes()]);
  }
}

init();
