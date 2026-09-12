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

module.exports = { getAppZone, getTodayStart, parseLocalDate, getDayBounds };