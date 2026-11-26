// Bookmark backups: the snapshots taken automatically before runs that delete or move bookmarks.
// List, download (JSON or a bookmarks.html any browser can import), and restore into a new folder.
import { $, request, setStatus, confirmAction, downloadText } from './dom.js';

function button(label, onClick) {
  const b = document.createElement('button');
  b.type = 'button';
  b.textContent = label;
  b.addEventListener('click', onClick);
  return b;
}

async function download(id, format) {
  try {
    const { text, name } = await request({ cmd: 'getBackup', id, format });
    downloadText(name, text, format === 'html' ? 'text/html' : 'application/json');
    setStatus(`Downloaded ${name}.`);
  } catch (err) {
    setStatus(`Could not download the backup: ${err.message}`);
  }
}

async function restore(b) {
  const when = new Date(b.ts).toLocaleString();
  const ok = await confirmAction({
    title: 'Restore this backup?',
    message: `Adds a new "Restored" folder to Other bookmarks with all ${b.count} bookmarks from ${when}. Nothing you have now is changed or removed.`,
    confirmLabel: 'Restore',
  });
  if (!ok) return;
  try {
    const { created, label } = await request({ cmd: 'restoreBackup', id: b.id });
    setStatus(`Restored ${created} bookmarks from ${label} into Other bookmarks.`);
  } catch (err) {
    setStatus(`Could not restore the backup: ${err.message}`);
  }
}

export async function renderBackups() {
  let backups;
  try {
    backups = (await request({ cmd: 'listBackups' })).backups || [];
  } catch {
    setStatus('Could not load bookmark backups.'); // keep what's shown
    return;
  }
  const list = $('backupList');
  list.textContent = '';
  $('backupEmpty').hidden = backups.length > 0;
  for (const b of backups) {
    const li = document.createElement('li');
    const label = document.createElement('span');
    label.textContent = `${new Date(b.ts).toLocaleString()} (${b.count} bookmarks)`;
    li.append(label, button('JSON', () => download(b.id, 'json')), button('bookmarks.html', () => download(b.id, 'html')), button('Restore', () => restore(b)));
    list.appendChild(li);
  }
}

async function backupNow() {
  const b = $('backupNow');
  b.disabled = true;
  try {
    const { count, unchanged, ts } = await request({ cmd: 'backupNow' });
    setStatus(unchanged ? `No changes since the last backup (${new Date(ts).toLocaleString()}).` : `Backup saved (${count} bookmarks).`);
    await renderBackups();
  } catch (err) {
    setStatus(`Could not save a backup: ${err.message}`);
  } finally {
    b.disabled = false;
  }
}

export function initBackupView() {
  $('backupNow').addEventListener('click', backupNow);
  $('backupPanel').addEventListener('toggle', () => { if ($('backupPanel').open) renderBackups(); });
  // A backup taken by an apply (or removed by the daily prune) while the section is open shows up without reopening it.
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.bookmarkSnapshots && $('backupPanel').open) renderBackups();
  });
}
