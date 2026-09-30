// Host page for a SignatureAPI ceremony embedded in an <iframe>.
//
// "Sign document" asks the demo server for a test envelope, frames its ceremony,
// and confirms the result on the server. A ceremony URL created elsewhere can be
// pasted into the field or passed as ?url= instead, and on a static host, where
// there is no demo server, that is all the page offers.

const CEREMONY_ORIGIN = 'https://sign.signatureapi.com';
const LANGUAGES = ['en', 'es', 'fr', 'it', 'pt', 'de', 'zh', 'hu', 'nl'];

const frame = document.getElementById('ceremony');
const input = document.getElementById('url-input');
const signButton = document.getElementById('sign-document');
const startError = document.getElementById('start-error');
const againButton = document.getElementById('again');
const views = { start: document.getElementById('start'), ceremony: frame, result: document.getElementById('result') };

// Set while a ceremony is open. envelopeId stays null for a pasted URL: there
// is no envelope this page can ask the server about.
let signing = false;
let envelopeId = null;

function show(name) {
  for (const [key, element] of Object.entries(views)) element.hidden = key !== name;
}

// A ceremony URL needs embedded=true to be framed and event_delivery=message to
// report how it ended. Anything else loads as typed.
function embeddedUrl(url) {
  const parsed = URL.parse(url);
  if (!parsed || parsed.origin !== CEREMONY_ORIGIN) return url;
  for (const [key, value] of [['embedded', 'true'], ['event_delivery', 'message']]) {
    if (!parsed.searchParams.has(key)) url += (url.includes('?') ? '&' : '?') + key + '=' + value;
  }
  return url;
}

function openCeremony(url) {
  signing = true;
  frame.src = embeddedUrl(url);
  show('ceremony');
}

function closeCeremony() {
  signing = false;
  frame.src = 'about:blank';
}

// --- Starting -------------------------------------------------------------

async function start() {
  closeCeremony();
  show('start');
  startError.hidden = true;
  signButton.disabled = true;
  signButton.textContent = 'Preparing document…';
  try {
    const language = navigator.language.slice(0, 2).toLowerCase();
    const response = await fetch('ceremonies', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ language: LANGUAGES.includes(language) ? language : 'en' }),
    });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || 'The demo server returned ' + response.status);
    envelopeId = body.envelopeId;
    // The URL is a bearer credential: it goes into the iframe and nowhere else.
    input.value = '';
    history.replaceState(null, '', location.pathname);
    openCeremony(body.ceremonyUrl);
  } catch (error) {
    startError.textContent = 'Couldn’t create the envelope: ' + error.message;
    startError.hidden = false;
  } finally {
    signButton.disabled = false;
    signButton.textContent = 'Sign document';
  }
}

function load(url) {
  if (!url) return;
  if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
  envelopeId = null;
  input.value = url;
  history.replaceState(null, '', location.pathname + '?url=' + url);
  openCeremony(url);
}

function backToStart() {
  closeCeremony();
  history.replaceState(null, '', location.pathname);
  show('start');
}

// --- Events ---------------------------------------------------------------

// The ceremony posts with target origin "*", so checking the sender is this
// page's job: the message must come from the ceremony's origin and from this
// iframe's window. Anything else could be another frame or script faking it.
window.addEventListener('message', (event) => {
  if (event.origin !== CEREMONY_ORIGIN || event.source !== frame.contentWindow) {
    if (signing) logEvent('Ignored a message from ' + event.origin, true);
    return;
  }
  const { type, error_type: errorType } = event.data || {};
  logEvent(errorType ? type + ' · ' + errorType : String(type));
  if (signing) ceremonyEnded(type, errorType);
});

function ceremonyEnded(type, errorType) {
  switch (type) {
    case 'ceremony.completed':
      closeCeremony();
      if (envelopeId) confirmSignature(envelopeId);
      else showResult('success', '✓', 'Ceremony completed', 'The ceremony reported that signing finished. This URL was pasted, so there is no envelope to confirm here.');
      break;
    case 'ceremony.canceled':
      closeCeremony();
      showResult('neutral', '✕', 'Signing canceled', 'Nothing was signed. You can start again whenever you like.');
      break;
    case 'ceremony.declined':
      closeCeremony();
      showResult('neutral', '✕', 'Document rejected', 'The approver rejected the document.');
      break;
    case 'ceremony.failed':
      closeCeremony();
      showResult('danger', '!', 'Couldn’t open the document', explanation(errorType));
      break;
    // Unknown types are logged and otherwise ignored: new ones can appear.
  }
}

// Branch on error_type. error_message is English text for logs, not for signers.
function explanation(errorType) {
  switch (errorType) {
    case 'unauthorized': return 'This signing link is no longer valid. Start again to get a new one.';
    case 'already_completed': return 'This document has already been signed.';
    case 'not_available': return 'This document is no longer available for signing.';
    case 'invalid_link': return 'This is not a complete signing link.';
    default: return 'The signing session couldn’t be completed. Start again to get a new link.';
  }
}

// ceremony.completed is a UI signal. The envelope on the server is the proof,
// and its status can take a moment to catch up.
async function confirmSignature(id) {
  showResult('pending', '', 'Confirming signature…', 'Checking with SignatureAPI.');
  let problem = 'SignatureAPI hasn’t confirmed the signature yet. It usually takes a few seconds.';
  try {
    for (let attempt = 0; attempt < 12; attempt++) {
      const response = await fetch('envelopes/' + id);
      if (!response.ok) throw new Error('The demo server returned ' + response.status);
      const envelope = await response.json();
      if (id !== envelopeId) return;
      if (envelope.recipients.some((r) => r.key === 'signer' && r.status === 'completed')) {
        showResult('success', '✓', 'Document signed', 'SignatureAPI confirmed the signature. The signed PDF is ready.');
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }
  } catch (error) {
    problem = error.message;
  }
  if (id === envelopeId) showResult('warning', '!', 'Signature not confirmed yet', problem);
}

// --- Rendering ------------------------------------------------------------

function showResult(tone, symbol, title, message) {
  const pending = tone === 'pending';
  const badge = document.getElementById('result-badge');
  badge.className = 'badge ' + tone;
  badge.textContent = symbol;
  document.getElementById('result-title').textContent = title;
  document.getElementById('result-message').textContent = message;
  document.querySelector('#result .actions').hidden = pending;
  againButton.textContent = tone === 'success' ? 'Sign another document' : 'Try again';
  show('result');
}

function logEvent(text, rejected = false) {
  const item = document.createElement('li');
  if (rejected) item.className = 'rejected';
  const label = document.createElement('code');
  label.textContent = text;
  const time = document.createElement('time');
  time.textContent = new Date().toLocaleTimeString();
  item.append(label, time);
  const list = document.getElementById('events');
  list.prepend(item);
  while (list.children.length > 20) list.lastChild.remove();
  document.getElementById('no-events').hidden = true;
}

// The demo server answers "health" next to this page. A static host doesn't,
// and everything that would call the server then stays hidden.
async function detectServer() {
  let hasServer = false;
  try {
    const response = await fetch('health');
    hasServer = response.ok && (await response.json()).ok === true;
  } catch {
    // No server, or an answer that isn't the server's.
  }
  for (const element of document.querySelectorAll('.needs-server')) element.hidden = !hasServer;

  const hint = document.getElementById('start-hint');
  if (hasServer) {
    hint.textContent = 'Creates a test envelope with SignatureAPI and opens it for signing on this page.';
    return;
  }
  const code = (text) => Object.assign(document.createElement('code'), { textContent: text });
  hint.replaceChildren('Paste a ceremony URL to open it here. Its ', code('embeddable_in'), ' must include ', code(location.origin), '.');
}

// --- Wiring ---------------------------------------------------------------

signButton.addEventListener('click', start);
againButton.addEventListener('click', start);
document.getElementById('back').addEventListener('click', backToStart);
document.getElementById('go').addEventListener('click', () => load(input.value.trim()));
input.addEventListener('keydown', (e) => { if (e.key === 'Enter') load(input.value.trim()); });

detectServer();

// Take everything after "url=" raw, so unencoded "&" in the target URL survives.
const match = location.search.match(/[?&]url=(.*)$/);
load(match ? decodeURIComponent(match[1]) : null);
