// Undo surfaces: the transient toast shown right after an apply, and the full
// undo-history dialog. Both are pure DOM over the SW's undo log, with no shared
// panel state — so plan-view (after apply) and tabs-view (after bulk close) can
// both call showUndoToast() without coupling.
import { $, send, setStatus } from './dom.js';
import { groupUndoByRun, actionLabel } from './viewmodel.js';

let toastTimer = null;
export async function showUndoToast() {
  const res = await send({ cmd: 'getUndo' });
  if (!res || !res.ok) return;
  const runs = groupUndoByRun(res.entries);
  const toast = $('undoToast');
  if (!runs.length) { toast.hidden = true; return; }
  const latest = runs[0];
  toast.textContent = '';
  const msg = document.createElement('span');
  msg.textContent = `Applied ${latest.entries.length} change${latest.entries.length === 1 ? '' : 's'}.`;
  const undoBtn = document.createElement('button');
  undoBtn.type = 'button';
  undoBtn.textContent = 'Undo';
  undoBtn.addEventListener('click', async () => {
    await send({ cmd: 'undo', undoIds: latest.entries.map((e) => e.undoId) });
    setStatus(`Reverted ${latest.entries.length}.`);
    toast.hidden = true;
  });
  toast.append(msg, undoBtn);
  toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.hidden = true; }, 8000);
}

// The undo-history dialog: every applied run, each expandable to its entries,
// with per-run undo and a per-entry checked-subset undo on close.
export function initUndoHistory() {
  $('showUndo').addEventListener('click', async () => {
    const undoRes = await send({ cmd: 'getUndo' });
    if (!undoRes || !undoRes.ok) { setStatus('Could not load undo history.'); return; }
    const runs = groupUndoByRun(undoRes.entries);
    const list = $('undoList');
    list.textContent = '';
    const dlg = $('undoDialog');
    for (const run of runs) {
      const runLi = document.createElement('li');
      runLi.className = 'undoRun';

      const header = document.createElement('div');
      header.className = 'undoRunHeader';
      const ts = document.createElement('span');
      ts.textContent = new Date(run.ts).toLocaleString();
      const undoRunBtn = document.createElement('button');
      undoRunBtn.type = 'button';
      undoRunBtn.textContent = 'Undo this run';
      undoRunBtn.addEventListener('click', async () => {
        await send({ cmd: 'undo', undoIds: run.entries.map((e) => e.undoId) });
        setStatus(`Reverted ${run.entries.length}.`);
        dlg.close();
      });
      header.append(ts, undoRunBtn);
      runLi.appendChild(header);

      const entryList = document.createElement('ul');
      for (const e of run.entries) {
        const li = document.createElement('li');
        const label = document.createElement('label');
        const cb = document.createElement('input');
        cb.type = 'checkbox'; cb.value = e.undoId;
        label.append(cb, ` ${e.label || actionLabel(e.action)}`);
        li.appendChild(label);
        entryList.appendChild(li);
      }
      runLi.appendChild(entryList);
      list.appendChild(runLi);
    }
    dlg.showModal();
    dlg.querySelector('#closeUndo').onclick = async () => {
      const undoIds = [...list.querySelectorAll('input:checked')].map((c) => c.value);
      if (undoIds.length) { await send({ cmd: 'undo', undoIds }); setStatus(`Reverted ${undoIds.length}.`); }
      dlg.close();
    };
  });
}
