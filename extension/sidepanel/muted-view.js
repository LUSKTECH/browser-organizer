// "Muted & learned" management: the list of never-suggest-again keys with unmute,
// plus the reset-learning button. Reads settings directly; writes go through
// setSettings (SW-serialized).
import { $, setStatus, setSettings } from './dom.js';
import { getSettings } from '../lib/storage.js';
import { describeIgnoreKey } from './viewmodel.js';

async function renderMuted() {
  const s = await getSettings();
  const list = $('mutedList');
  list.textContent = '';
  const ignore = s.ignore || [];
  if (!ignore.length) {
    const li = document.createElement('li');
    li.className = 'hint';
    li.textContent = 'Nothing muted.';
    list.appendChild(li);
  }
  for (const key of ignore) {
    const li = document.createElement('li');
    const span = document.createElement('span');
    span.textContent = describeIgnoreKey(key);
    span.title = key;
    const unmute = document.createElement('button');
    unmute.type = 'button';
    unmute.textContent = 'Unmute';
    unmute.addEventListener('click', async () => {
      const cur = await getSettings();
      try { await setSettings({ ignore: (cur.ignore || []).filter((k) => k !== key) }); renderMuted(); }
      catch (err) { setStatus(`Unmute failed: ${err.message}`); }
    });
    li.append(span, unmute);
    list.appendChild(li);
  }
}

export function initMutedView() {
  $('mutedPanel').addEventListener('toggle', () => { if ($('mutedPanel').open) renderMuted(); });
  $('resetLearning').addEventListener('click', async () => {
    try { await setSettings({ decisions: {} }); setStatus('Learning reset.'); }
    catch (err) { setStatus(`Reset failed: ${err.message}`); }
  });
}
