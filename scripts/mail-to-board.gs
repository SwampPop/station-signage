/**
 * Station Board mail bridge — Google Apps Script.
 *
 * Runs as the sheet-owner account (opsscpems) on a 5-minute timer and
 * turns allowlisted email into `messages` rows: send or forward an email
 * to this account with a subject starting "BOARD:" and it's on the TV
 * within ~10 minutes (5-min mail poll + 5-min board poll).
 *
 * Subject forms:
 *   BOARD: Title here            -> normal priority
 *   BOARD HIGH: Title here       -> front of rotation
 *   BOARD URGENT: Title here     -> persistent banner
 *   (TAKEOVER is deliberately NOT allowed by email — full-screen
 *    takeovers require a deliberate sheet edit; an emailed TAKEOVER
 *    is demoted to HIGH.)
 *
 * SECURITY / PHI:
 *  - Only senders in ALLOWED_SENDERS are processed; everything else is
 *    labeled board/skipped silently (no reply to strangers).
 *  - The board is PUBLIC at its URL. The allowlist + explicit BOARD:
 *    prefix exist so only deliberately-sent content ever reaches it.
 *    NEVER auto-forward a work mailbox here. No PHI, ever.
 *  - Keep real addresses only in the Apps Script editor copy — the repo
 *    copy carries placeholders.
 *
 * SETUP (once, signed in as the sheet owner):
 *   1. Open the Station Board sheet -> Extensions -> Apps Script.
 *   2. Paste this file, edit ALLOWED_SENDERS + SENDER_NAMES.
 *   3. Run the `setup` function once and approve the authorization
 *      prompts (Gmail + Spreadsheet scopes; "unverified app" -> Advanced
 *      -> Continue is expected for a personal script).
 *   4. Test: from an allowlisted address, email this account with
 *      subject "BOARD: Test". Expect a confirmation reply, a new row in
 *      `messages`, and the slide on the board.
 */

const ALLOWED_SENDERS = [
  'someone@example.com' // REPLACE: chief / shift leads / operator addresses
];

const SENDER_NAMES = {
  'someone@example.com': 'Chief Example' // shown as the slide byline
};

const CONFIG = {
  maxTitleChars: 120,
  maxBodyChars: 500,
  timezone: 'America/Chicago',
  processedLabel: 'board/posted',
  skippedLabel: 'board/skipped',
  sendConfirmation: true
};

function setup() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'processBoardMail') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('processBoardMail').timeBased().everyMinutes(5).create();
  getOrCreateLabel_(CONFIG.processedLabel);
  getOrCreateLabel_(CONFIG.skippedLabel);
  processBoardMail(); // first pass now, so a queued test email posts
}

function processBoardMail() {
  const threads = GmailApp.search(
    'in:inbox subject:BOARD -label:board-posted -label:board-skipped', 0, 20);
  if (!threads.length) return;
  const posted = getOrCreateLabel_(CONFIG.processedLabel);
  const skipped = getOrCreateLabel_(CONFIG.skippedLabel);

  threads.forEach(function (thread) {
    const msg = thread.getMessages()[thread.getMessageCount() - 1];
    const sender = extractEmail_(msg.getFrom());
    const parsed = parseSubject_(msg.getSubject());

    if (!parsed || ALLOWED_SENDERS.indexOf(sender) < 0) {
      thread.addLabel(skipped);
      return;
    }

    const item = {
      priority: parsed.priority,
      title: parsed.title,
      body: cleanBody_(msg.getPlainBody()),
      author: SENDER_NAMES[sender] || sender.split('@')[0]
    };
    appendRow_(item);
    thread.addLabel(posted);
    thread.markRead();

    if (CONFIG.sendConfirmation) {
      msg.reply('Posted to the station board: "' + item.title +
        '" (priority: ' + item.priority + '). Appears within ~10 minutes; ' +
        'auto-expires in 14 days. To edit or remove it, open the Station ' +
        'Board sheet.');
    }
  });
}

// "Fwd: Re: BOARD URGENT: Hydrant out" -> {priority:'urgent', title:'Hydrant out'}
function parseSubject_(subject) {
  const s = String(subject || '')
    .replace(/^\s*((re|fwd?|fw)\s*:\s*)+/i, '').trim();
  const m = s.match(/^BOARD(?:\s+(HIGH|URGENT|TAKEOVER))?\s*:\s*(.+)$/i);
  if (!m) return null;
  let priority = (m[1] || 'normal').toLowerCase();
  if (priority === 'takeover') priority = 'high'; // sheet-edit only
  return { priority: priority, title: m[2].trim().slice(0, CONFIG.maxTitleChars) };
}

// What the sender typed, minus quoted chains and forwarded-header blocks.
function cleanBody_(raw) {
  let text = String(raw || '');
  const onWrote = text.search(/^On .{0,100} wrote:\s*$/m);
  if (onWrote > 0) text = text.slice(0, onWrote);
  text = text.replace(/-{4,}\s*Forwarded message\s*-{4,}\s*\n(?:.+\n){0,6}\n?/i, '');
  text = text.split('\n')
    .filter(function (l) { return l.indexOf('>') !== 0; })
    .join('\n')
    .replace(/^\s*(Get Outlook for (iOS|Android).*|Sent from my iP(hone|ad).*|Sent from Yahoo Mail.*|Sent via .*)$/gim, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return text.slice(0, CONFIG.maxBodyChars);
}

function appendRow_(item) {
  const sheet = SpreadsheetApp.getActive().getSheetByName('messages');
  if (!sheet) throw new Error('messages tab not found');
  const postedDate = Utilities.formatDate(new Date(), CONFIG.timezone, 'yyyy-MM-dd');
  // Column order matches the tab: active, priority, title, body, author,
  // posted, expires, dwell.
  sheet.appendRow(['yes', item.priority, item.title, item.body,
    item.author, postedDate, '', '']);
}

function extractEmail_(from) {
  const m = String(from || '').match(/<([^>]+)>/);
  return (m ? m[1] : String(from || '')).trim().toLowerCase();
}

function getOrCreateLabel_(name) {
  return GmailApp.getUserLabelByName(name) || GmailApp.createLabel(name);
}
