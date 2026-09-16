const { DateTime } = require('luxon');
const { appTimeZone } = require('../config/environment');
const { AppError } = require('./AppError');

function getAppZone() {
  return appTimeZone;
}

function getTodayStart() {
  return DateTime.now().setZone(appTimeZone).startOf('day');
}

function parseLocalDate(value) {
  if (!value) return getTodayStart();
  const dt = DateTime.fromFormat(value, 'yyyy-MM-dd', { zone: appTimeZone });
  if (!dt.isValid) {
    throw new AppError(400, 'Invalid date. Expected YYYY-MM-DD.', 'INVALID_DATE');
  }
  return dt.startOf('day');
}

function getDayBounds(dateValue) {
  const start = parseLocalDate(dateValue);
  const end = start.plus({ days: 1 });
  return {
    localDate: start.toISODate(),
    start: start.toJSDate(),
    end: end.toJSDate(),
  };
}

/// Resolves list filters into an inclusive local-day bounds pair.
/// - `date` (single day) wins when provided.
/// - otherwise `from`/`to` (inclusive range) when both are provided.
/// - otherwise defaults to today.
function getRangeBounds({ date, from, to }) {
  if (date) return getDayBounds(date);
  if (from && to) {
    const start = parseLocalDate(from);
    const end = parseLocalDate(to).plus({ days: 1 });
    return { start: start.toJSDate(), end: end.toJSDate() };
  }
  return getDayBounds(undefined);
}

module.exports = { getAppZone, getTodayStart, parseLocalDate, getDayBounds, getRangeBounds };