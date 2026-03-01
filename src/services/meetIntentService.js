function parseMonthName(text) {
  const map = {
    january: 1,
    february: 2,
    march: 3,
    april: 4,
    may: 5,
    june: 6,
    july: 7,
    august: 8,
    september: 9,
    october: 10,
    november: 11,
    december: 12
  };
  const lower = text.toLowerCase();
  for (const [name, m] of Object.entries(map)) {
    if (lower.includes(name)) return m;
  }
  return null;
}

function parseYMD(text) {
  const m = text.match(/\b(20\d{2})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])\b/);
  if (!m) return null;
  return { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) };
}

function parseDMYLong(text) {
  const lower = text.toLowerCase();
  const monthAlternation =
    "(january|february|march|april|may|june|july|august|september|october|november|december)";

  const dmy = lower.match(new RegExp(`\\b([0-2]?\\d|3[01])(st|nd|rd|th)?\\s+${monthAlternation}\\s*,?\\s*(20\\d{2})\\b`, "i"));
  if (dmy) {
    return {
      day: Number(dmy[1]),
      month: parseMonthName(dmy[3]),
      year: Number(dmy[4])
    };
  }

  const mdy = lower.match(new RegExp(`\\b${monthAlternation}\\s+([0-2]?\\d|3[01])(st|nd|rd|th)?\\s*,?\\s*(20\\d{2})\\b`, "i"));
  if (mdy) {
    return {
      month: parseMonthName(mdy[1]),
      day: Number(mdy[2]),
      year: Number(mdy[4])
    };
  }

  return null;
}

function parseTime(text) {
  const hmAmPm = text.match(/\b(1[0-2]|0?[1-9]):([0-5]\d)\s?(am|pm)\b/i);
  if (hmAmPm) {
    let hour = Number(hmAmPm[1]);
    const minute = Number(hmAmPm[2]);
    const meridiem = hmAmPm[3].toLowerCase();
    if (meridiem === "pm" && hour !== 12) hour += 12;
    if (meridiem === "am" && hour === 12) hour = 0;
    return { hour, minute };
  }

  const m = text.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/);
  if (m) return { hour: Number(m[1]), minute: Number(m[2]) };

  const ampm = text.match(/\b(1[0-2]|0?[1-9])\s?(am|pm)\b/i);
  if (!ampm) return null;
  let hour = Number(ampm[1]);
  if (ampm[2].toLowerCase() === "pm" && hour !== 12) hour += 12;
  if (ampm[2].toLowerCase() === "am" && hour === 12) hour = 0;
  return { hour, minute: 0 };
}

export function extractExactDateTime(text) {
  const date = parseYMD(text) || parseDMYLong(text);
  const time = parseTime(text);
  if (!date || !time) return null;
  const start = new Date(date.year, date.month - 1, date.day, time.hour, time.minute, 0, 0);
  if (Number.isNaN(start.getTime())) return null;
  return {
    startAt: start,
    endAt: new Date(start.getTime() + 30 * 60 * 1000)
  };
}

export function meetClarificationPrompt() {
  return "I can schedule that meet. Please share exact date, time, and year (example: 2026-03-02 17:30).";
}
