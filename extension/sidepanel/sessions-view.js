// Saved window sessions: list with restore/rename/delete, JSON export, and the
// save form. renderSessions() is exported so the bootstrap can paint it on load.
import { $, request, setStatus, confirmAction, downloadText } from './dom.js';

async function loadSessions() {
  try {
    return (await request({ cmd: 'listSessions' })).sessions || [];
  } catch {
    setStatus('Could not load sessions.');
    return null;
  }
}

export async function renderSessions() {
  // Don't wipe the shown list on a dropped/failed reply (SW asleep) — surface it.
  const sessions = await loadSessions();
  if (!sessions) return;
  const list = $('sessionList');
  list.textContent = '';
  for (const s of sessions) {
    const li = document.createElement('li');
    const label = document.createElement('span');
    label.textContent = `${s.name} (${s.tabs.length} tabs)`;
    const restoreBtn = document.createElement('button');
    restoreBtn.type = 'button';
    restoreBtn.textContent = 'Restore';
    restoreBtn.addEventListener('click', async () => {
      try {
        const { session } = await request({ cmd: 'restoreSession', id: s.sessionId });
        setStatus(session ? `Restored "${s.name}"${session.failed ? ` (${session.failed} tab${session.failed === 1 ? '' : 's'} failed to open)` : ''}.` : `Could not restore "${s.name}" (it no longer exists).`);
      } catch (err) {
        setStatus(`Could not restore "${s.name}": ${err.message}`);
      }
    });
    const renameBtn = document.createElement('button');
    renameBtn.type = 'button';
    renameBtn.textContent = 'Rename';
    renameBtn.addEventListener('click', () => {
      if (!li.contains(label)) return; // already editing this row — ignore a repeat click
      const input = document.createElement('input');
      input.type = 'text';
      input.value = s.name;
      let committed = false; // Enter fires commit, then blur fires again — run once
      const commit = async () => {
        if (committed) return;
        committed = true;
        const name = input.value.trim();
        if (name && name !== s.name) {
          try { await request({ cmd: 'renameSession', id: s.sessionId, name }); }
          catch (err) { setStatus(`Could not rename: ${err.message}`); }
        }
        renderSessions();
      };
      input.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter') {
          ev.preventDefault();
          commit();
        } else if (ev.key === 'Escape') {
          ev.preventDefault();
          committed = true;
          renderSessions();
        }
      });
      input.addEventListener('blur', commit);
      li.replaceChild(input, label);
      input.focus();
    });
    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.textContent = 'Delete';
    deleteBtn.className = 'sessionDeleteBtn';
    deleteBtn.addEventListener('click', async () => {
      const ok = await confirmAction({
        title: 'Delete session?',
        message: `Permanently delete "${s.name}" (${s.tabs.length} tabs)? This cannot be undone.`,
        confirmLabel: 'Delete',
        danger: true,
      });
      if (!ok) return;
      try {
        await request({ cmd: 'deleteSession', id: s.sessionId });
        setStatus(`Deleted session "${s.name}".`);
      } catch (err) {
        setStatus(`Could not delete: ${err.message}`);
      }
      renderSessions();
    });
    li.append(label, restoreBtn, renameBtn, deleteBtn);
    list.appendChild(li);
  }
}

export function initSessionsView() {
  $('exportSessions').addEventListener('click', async () => {
    const sessions = await loadSessions();
    if (!sessions) return;
    downloadText('browser-organizer-sessions.json', JSON.stringify(sessions, null, 2), 'application/json');
    setStatus(`Exported ${sessions.length} session${sessions.length === 1 ? '' : 's'}.`);
  });

  $('saveSessionForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const nameInput = $('sessionName');
    const keepOpen = $('keepTabsOpen').checked;
    const win = await chrome.windows.getCurrent().catch(() => null);
    try {
      await request({ cmd: 'saveSession', name: nameInput.value.trim(), close: !keepOpen, windowId: win?.id });
    } catch (err) {
      setStatus(`Could not save session: ${err.message}`);
      return;
    }
    nameInput.value = '';
    setStatus(keepOpen ? 'Session saved (tabs kept open).' : 'Session saved and tabs closed.');
    await renderSessions();
  });
}
