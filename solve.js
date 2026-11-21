// A fast drop-in for csv-reader 1.0.0 (make.fun): run(input) returns exactly
// {columns, rows, errors} for {text, header}, the same answer the reference
// reader gives for every input, broken or not, but much faster.
//
// The reference walks the text one character at a time, building every field
// one character at a time. This reader instead works on whole slices:
//  - a record with no quote at all is split in one C++ call (String split),
//    with lone CRs counted as stray_cr and dropped per field;
//  - a record that holds a quote is read field by field, but each field is
//    still sliced, never built char by char: the next delimiter is found
//    with indexOf (also C++), doubled quotes ("") are spliced in as one
//    literal quote, and CRLF / lone CR inside quotes each become one LF;
//  - line numbers are kept exactly: every LF, CRLF and lone CR inside a
//    quoted field counts, as do the line breaks between records.
//
// The error policy is the reference's own, field for field:
//  - stray_cr: a CR outside quotes, not followed by LF, is dropped;
//  - quote_junk: characters after a closing quote, up to the next comma or
//    line break, are appended to the field as they stand;
//  - unterminated_quote: a quote that never closes is a literal character
//    and the text after it is read again as an unquoted field;
//  - short_row / long_row: rows are padded with "" or cut to the first
//    record's width, with fields / extra recorded;
//  - a line left with no characters is no record (its stray_cr errors stay);
//  - a U+FEFF at the very start is dropped; fields stay strings, never
//    trimmed or converted.

/** How a field ended: at a comma, at a line break, or at the end. */
const COMMA = 0;
const LINE_BREAK = 1;
const END = 2;

/** Count occurrences of the one-character string `ch` in `s`. */
function countChar(s, ch) {
  let k = 0;
  let i = -1;
  while ((i = s.indexOf(ch, i + 1)) !== -1) k++;
  return k;
}

/** csv-reader 1.0.0's answer for one case's input. */
export function run(input) {
  const text = String(input.text);
  const header = input.header === true;
  const n = text.length;
  const errors = [];
  const rows = [];
  let columns = null;
  let width = -1;
  let pos = text.charCodeAt(0) === 0xfeff ? 1 : 0;
  let line = 1;
  // The record being read: the line it starts on and the index in rows it
  // takes (null: the header).
  let recordLine = 1;
  let recordRow = null;
  // How the last field read ended, and how many characters the last
  // unquoted read kept (not counting the value it started with).
  let ended = END;
  let added = 0;

  function err(code) {
    errors.push({ code, line: recordLine, row: recordRow });
  }

  // Normalise one quoted segment [a, b): each CRLF and each lone CR becomes
  // one LF, and `line` moves past every line break in it.
  function normSegment(a, b) {
    const seg = text.slice(a, b);
    if (seg.indexOf('\r') === -1) {
      line += countChar(seg, '\n');
      return seg;
    }
    const norm = seg.replace(/\r\n?/g, '\n');
    line += countChar(norm, '\n');
    return norm;
  }

  // Split an unquoted run (no LF, no quote) on commas. Every CR in it is a
  // stray CR: one stray_cr error each, dropped from the value. (A CR just
  // before the run's line break is a CRLF, not stray: the caller strips it
  // from the run first.)
  function splitUnquoted(body) {
    if (body.indexOf('\r') === -1) return body.split(',');
    const fields = body.split(',');
    for (let i = 0; i < fields.length; i++) {
      const f = fields[i];
      if (f.indexOf('\r') !== -1) {
        const k = countChar(f, '\r');
        for (let j = 0; j < k; j++) err('stray_cr');
        fields[i] = f.replace(/\r/g, '');
      }
    }
    return fields;
  }

  // Read unquoted characters onto `value` up to the next comma or line
  // break. A CR not followed by LF is dropped (stray_cr). Sets `ended`
  // and `added`, and returns the field.
  //
  // Only two searches run on the open text: the next comma and the next LF.
  // A CR can only hide inside the slice between here and that delimiter (a
  // CR followed by LF is the line break itself, and any other CR in the
  // slice is stray), so the slice itself is checked for CRs instead of
  // searching the whole rest of the text for one.
  function readUnquoted(value) {
    added = 0;
    let iComma = text.indexOf(',', pos);
    let iLf = text.indexOf('\n', pos);
    if (iComma === -1) iComma = Infinity;
    if (iLf === -1) iLf = Infinity;
    const m = Math.min(iComma, iLf);
    let chunk;
    if (m === Infinity) {
      chunk = text.slice(pos);
      pos = n;
      ended = END;
    } else {
      chunk = text.slice(pos, m);
      if (m === iComma) {
        pos = m + 1;
        ended = COMMA;
      } else {
        pos = m + 1;
        line += 1;
        ended = LINE_BREAK;
      }
    }
    if (chunk.indexOf('\r') === -1) {
      added += chunk.length;
      return value + chunk;
    }
    // The chunk holds CRs: every one is stray, except a trailing one just
    // before an LF, which is the CRLF line break.
    const isCRLF = m !== Infinity && m === iLf && chunk.charCodeAt(chunk.length - 1) === 13;
    let k = countChar(chunk, '\r');
    if (isCRLF) k -= 1;
    for (let j = 0; j < k; j++) err('stray_cr');
    chunk = chunk.replace(/\r/g, '');
    added += chunk.length;
    return value + chunk;
  }

  // Read a quoted field whose opening quote is at pos.
  function readQuoted() {
    const open = pos;
    const openLine = line;
    pos += 1; // past the opening quote
    let parts = null;
    let segStart = pos;
    for (;;) {
      const q = text.indexOf('"', pos);
      if (q === -1) {
        // The quote never closes: it is a literal character, and the text
        // after it is read again as an unquoted field.
        pos = open + 1;
        line = openLine;
        err('unterminated_quote');
        return readUnquoted('"');
      }
      if (text.charCodeAt(q + 1) === 34) {
        // A doubled quote: one literal quote.
        if (parts === null) parts = [];
        parts.push(normSegment(segStart, q));
        parts.push('"');
        pos = q + 2;
        segStart = pos;
        continue;
      }
      // The closing quote.
      const seg = normSegment(segStart, q);
      let value;
      if (parts === null) {
        value = seg;
      } else {
        parts.push(seg);
        value = parts.join('');
      }
      pos = q + 1;
      if (pos >= n) {
        ended = END;
        return value;
      }
      const c = text.charCodeAt(pos);
      if (c === 44) {
        pos += 1;
        ended = COMMA;
        return value;
      }
      if (c === 10) {
        pos += 1;
        line += 1;
        ended = LINE_BREAK;
        return value;
      }
      if (c === 13 && text.charCodeAt(pos + 1) === 10) {
        pos += 2;
        line += 1;
        ended = LINE_BREAK;
        return value;
      }
      // What follows the closing quote is appended as it stands, up to the
      // next comma or line break.
      const junk = readUnquoted(value);
      if (added > 0) err('quote_junk');
      return junk;
    }
  }

  while (true) {
    // Lines with no characters are no records.
    while (pos < n) {
      const c = text.charCodeAt(pos);
      if (c === 10) {
        pos += 1;
        line += 1;
      } else if (c === 13 && text.charCodeAt(pos + 1) === 10) {
        pos += 2;
        line += 1;
      } else {
        break;
      }
    }
    if (pos >= n) break;

    recordLine = line;
    recordRow = header && columns === null ? null : rows.length;

    let fields;
    let quoted = false;
    // Fast path: the record ends at the next LF (or the end of the text)
    // and holds no quote, so no field is quoted and no quoted field spans
    // lines. Split it in one call.
    const lineEnd = text.indexOf('\n', pos);
    const recEnd = lineEnd === -1 ? n : lineEnd;
    // The next quote at or after pos: inside this record it means a quoted
    // field, past it (or none at all) the record holds no quote. Checking
    // this first avoids slicing records that take the slow path anyway.
    const q = text.indexOf('"', pos);
    if (q === -1 || q >= recEnd) {
      let body = text.slice(pos, recEnd);
      if (lineEnd !== -1 && body.length > 0 && body.charCodeAt(body.length - 1) === 13) {
        body = body.slice(0, -1); // CRLF: the CR belongs to the line break
      }
      fields = splitUnquoted(body);
      pos = lineEnd === -1 ? n : lineEnd + 1;
      if (lineEnd !== -1) line += 1;
      ended = lineEnd === -1 ? END : LINE_BREAK;
    } else {
      // Slow path: field by field, quoted fields included.
      fields = [];
      do {
        quoted = text.charCodeAt(pos) === 34;
        fields.push(quoted ? readQuoted() : readUnquoted(''));
      } while (ended === COMMA);
    }

    // A line that held only stray CRs is left with no characters: no record
    // (its stray_cr errors stay).
    if (fields.length === 1 && fields[0] === '' && !quoted) continue;

    if (width < 0) width = fields.length;
    if (header && columns === null) {
      columns = fields;
      continue;
    }
    if (fields.length < width) {
      errors.push({ code: 'short_row', line: recordLine, row: recordRow, fields: fields.length });
      while (fields.length < width) fields.push('');
    } else if (fields.length > width) {
      errors.push({ code: 'long_row', line: recordLine, row: recordRow, extra: fields.splice(width) });
    }
    rows.push(fields);
  }
  return { columns: header ? (columns ?? []) : null, rows, errors };
}
