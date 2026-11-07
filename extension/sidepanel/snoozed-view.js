// "Snoozed (n)": tabs waiting to reopen, with Wake now / Delete per row. Reads go
// through the service worker (listSnoozed); the list refreshes from
// chrome.storage.onChanged so snoozing, waking and undo all show up without wiring.
import { $, request, setStatus } from './dom.js';

const whenText = (ms) => new Date(ms).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });

function actionButton(label, cmd, id, failText) {
  const b = document.createElement('button');
  b.type = 'button';
  b.textContent = label;
  b.addEventListener('click', async () => {
    try { await request({ cmd, ids: [id] }); } catch (err) { setStatus(`${failText}: ${err.message}`); }
    await renderSnoozed();
  });
  return b;
}

function row(entry) {
  const li = document.createElement('li');
  const text = document.createElement('div');
  text.className = 'snoozedText';
  const title = document.createElement('span');
  title.textContent = entry.title || entry.url;
  title.title = entry.url;
  const when = document.createElement('span');
  when.className = 'snoozedWhen';
  when.textContent = whenText(entry.wakeAt);
  text.append(title, when);
  li.append(text, actionButton('Wake now', 'wakeSnoozed', entry.id, 'Could not wake tab'), actionButton('Delete', 'deleteSnoozed', entry.id, 'Could not delete'));
  return li;
}

export async function renderSnoozed() {
  let res;
  try { res = await request({ cmd: 'listSnoozed' }); } catch { return; } // SW asleep: keep what is shown
  const list = $('snoozedList');
  list.textContent = '';
  $('snoozedSummary').textContent = `Snoozed (${res.snoozed.length})`;
  if (!res.snoozed.length) {
    const li = document.createElement('li');
    li.className = 'hint';
    li.textContent = 'Nothing snoozed.';
    list.appendChild(li);
    return;
  }
  for (const e of res.snoozed) list.appendChild(row(e));
}

export function initSnoozedView() {
  $('snoozedPanel').addEventListener('toggle', () => { if ($('snoozedPanel').open) renderSnoozed(); });
  chrome.storage.onChanged.addListener((changes, area) => { if (area === 'local' && changes.snoozed) renderSnoozed(); });
  renderSnoozed(); // paints the count in the summary
}
