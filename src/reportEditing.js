// Inline prose editing + edited-HTML capture for the report preview.
//
// These run inside the sandboxed report iframe (see ReportBuilder), against EVERY
// report — including ones generated before this feature existed — rather than
// depending on the report's own HTML to carry the edit logic. wireProseEditing
// adds a ✎ / ✓ toggle to the narrative sections; serializeReport captures the
// current (edited) DOM as clean HTML for Download and autosave.
//
// They are written as plain, self-contained ES5-style functions (no closures over
// module scope, no imports) for two reasons:
//   1. they can be unit-tested directly against a DOM stub (see reportEditing.test.js), and
//   2. they can be serialised with `.toString()` and injected into the iframe.
// Keep them dependency-free so both of those keep working.

// Headings whose following prose should be editable. Data-heavy sections
// (Period Snapshot, tables, charts) are intentionally excluded so figures can't
// be hand-edited.
export const EDITABLE_HEADINGS = ['executive summary', 'key insights', 'comparison analysis'];

export function wireProseEditing(doc) {
  var TARGETS = { 'executive summary': 1, 'key insights': 1, 'comparison analysis': 1 };

  // The editable region for a heading: an existing .editable-prose wrapper if the
  // report already has one, otherwise the run of <p> siblings, wrapped on the fly.
  function boxFor(h) {
    var nb = h.nextElementSibling;
    if (!nb) return null;
    if (nb.classList && nb.classList.contains('editable-prose')) return nb;
    if (nb.tagName === 'P') {
      var ps = [], n = nb;
      while (n && n.tagName !== 'H2') {
        if (n.tagName === 'P') ps.push(n);
        else if (ps.length) break;
        n = n.nextElementSibling;
      }
      if (!ps.length) return null;
      var box = doc.createElement('div');
      box.className = 'swanky-editable';
      ps[0].parentNode.insertBefore(box, ps[0]);
      for (var j = 0; j < ps.length; j++) box.appendChild(ps[j]);
      return box;
    }
    return null;
  }

  var heads = doc.querySelectorAll('h2');
  for (var i = 0; i < heads.length; i++) {
    var h = heads[i];
    if (!TARGETS[(h.textContent || '').trim().toLowerCase()]) continue;
    if (h.querySelector('button')) continue; // already wired (e.g. an in-report editor)
    var box = boxFor(h);
    if (!box) continue;
    (function (h, box) {
      var btn = doc.createElement('button');
      btn.type = 'button';
      btn.className = 'swanky-edit-btn';
      btn.title = 'Edit this section';
      btn.textContent = '✎'; // ✎
      btn.style.cssText = 'float:right;background:none;border:none;cursor:pointer;font-size:14px;color:#b8b8b8;padding:0 0 0 10px;line-height:1;font-weight:400';
      btn.onmouseenter = function () { if (!box.isContentEditable) btn.style.color = '#6b6b6b'; };
      btn.onmouseleave = function () { btn.style.color = box.isContentEditable ? '#0a0a0a' : '#b8b8b8'; };
      btn.onclick = function () {
        var on = box.isContentEditable;
        box.contentEditable = on ? 'false' : 'true';
        box.style.outline = on ? '' : '1px dashed #ccc';
        box.style.outlineOffset = on ? '' : '8px';
        btn.textContent = on ? '✎' : '✓'; // ✎ / ✓
        btn.style.color = on ? '#b8b8b8' : '#0a0a0a';
        if (!on) box.focus();
      };
      h.insertBefore(btn, h.firstChild);
    })(h, box);
  }
}

// Strip the app-only scaffolding from a CLONE of the report root, leaving the clean
// report plus the user's content edits. Mutates and returns the passed node.
// Removes: the injected nodes we tagged with data-swanky (CSP meta, cursor style,
// print style, relay/edit scripts), the ✎ edit buttons, the contenteditable flags,
// and any leftover dashed editing outline. Exported so it can be unit-tested.
export function cleanReportClone(root) {
  root.querySelectorAll('[data-swanky]').forEach(function (n) { n.remove(); });
  root.querySelectorAll('.swanky-edit-btn').forEach(function (n) { n.remove(); });
  root.querySelectorAll('[contenteditable]').forEach(function (n) { n.removeAttribute('contenteditable'); });
  root.querySelectorAll('[style]').forEach(function (n) {
    if (/outline/i.test(n.getAttribute('style') || '')) {
      n.style.outline = '';
      n.style.outlineOffset = '';
      if (!n.getAttribute('style')) n.removeAttribute('style');
    }
  });
  return root;
}

// Serialize the live report DOM to a clean, self-contained HTML string that
// reflects the user's on-screen edits — used for both Download and autosave.
export function serializeReport(doc) {
  var clone = doc.documentElement.cloneNode(true);
  cleanReportClone(clone);
  return '<!DOCTYPE html>\n' + clone.outerHTML;
}
