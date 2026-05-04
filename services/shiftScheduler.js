const Shift = require('../models/shift');

const DEFAULT_DAYS_AHEAD = 30;

const DAY_TO_INDEX = {
  sun: 0,
  sunday: 0,
  mon: 1,
  monday: 1,
  tue: 2,
  tues: 2,
  tuesday: 2,
  wed: 3,
  weds: 3,
  wednesday: 3,
  thu: 4,
  thur: 4,
  thurs: 4,
  thursday: 4,
  fri: 5,
  friday: 5,
  sat: 6,
  saturday: 6
};

const TIME_12H_REGEX = /^(0?[1-9]|1[0-2]):([0-5]\d)\s*(AM|PM)$/i;

function normalizeStringArray(value) {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value
      .map((item) => String(item || '').trim())
      .filter(Boolean);
  }
  return [String(value).trim()].filter(Boolean);
}

function parseWeekdayIndexes(days) {
  const normalizedDays = normalizeStringArray(days);
  const indexes = new Set();

  normalizedDays.forEach((day) => {
    const key = day.toLowerCase();
    const index = DAY_TO_INDEX[key];
    if (typeof index === 'number') indexes.add(index);
  });

  return indexes;
}

function parseTimeRanges(hours) {
  const normalizedHours = normalizeStringArray(hours);
  const ranges = [];

  // Supports ["09:00 AM - 06:00 PM"] and also ["09:00 AM", "06:00 PM"]
  if (
    normalizedHours.length === 2 &&
    TIME_12H_REGEX.test(normalizedHours[0]) &&
    TIME_12H_REGEX.test(normalizedHours[1])
  ) {
    ranges.push({ startTime: normalizedHours[0], endTime: normalizedHours[1] });
    return ranges;
  }

  normalizedHours.forEach((entry) => {
    const parts = entry.split('-').map((p) => p.trim()).filter(Boolean);
    if (
      parts.length === 2 &&
      TIME_12H_REGEX.test(parts[0]) &&
      TIME_12H_REGEX.test(parts[1])
    ) {
      ranges.push({ startTime: parts[0], endTime: parts[1] });
    }
  });

  return ranges;
}

function validateDoctorSchedule(availableDays, availableHours) {
  const normalizedDays = normalizeStringArray(availableDays);
  const normalizedHours = normalizeStringArray(availableHours);

  if (normalizedDays.length === 0) {
    return {
      ok: false,
      message: 'availableDays must contain valid weekday names (e.g. Monday, Tue)'
    };
  }

  if (normalizedHours.length === 0) {
    return {
      ok: false,
      message: 'availableHours must contain 12-hour ranges (e.g. 09:00 AM - 06:00 PM)'
    };
  }

  if (normalizedDays.length !== normalizedHours.length) {
    return {
      ok: false,
      message: 'availableDays and availableHours must have the same number of entries (1:1 mapping)'
    };
  }

  const hasInvalidDayName = normalizedDays.some((day) => {
    const key = String(day || '').toLowerCase();
    return typeof DAY_TO_INDEX[key] !== 'number';
  });
  if (hasInvalidDayName) {
    return {
      ok: false,
      message: 'availableDays contains one or more invalid weekday names'
    };
  }

  const allRangesValid = normalizedHours.every((entry) => parseTimeRanges([entry]).length === 1);
  if (!allRangesValid) {
    return {
      ok: false,
      message: 'Each availableHours entry must be one range like 09:00 AM - 06:00 PM'
    };
  }

  return { ok: true };
}

function formatDate(dateObj) {
  const year = dateObj.getFullYear();
  const month = String(dateObj.getMonth() + 1).padStart(2, '0');
  const day = String(dateObj.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

async function ensureDoctorFutureShifts({
  doctorId,
  availableDays,
  availableHours,
  daysAhead = DEFAULT_DAYS_AHEAD
}) {
  const normalizedDays = normalizeStringArray(availableDays);
  const normalizedHours = normalizeStringArray(availableHours);
  const dayHourPairs = normalizedDays.map((day, index) => ({
    day,
    hours: normalizedHours[index]
  }));

  if (
    !doctorId ||
    dayHourPairs.length === 0 ||
    normalizedDays.length !== normalizedHours.length
  ) {
    return {
      created: 0,
      scheduledDays: 0,
      skipped: true
    };
  }

  const normalizedPairs = dayHourPairs
    .map((pair) => {
      const dayKey = String(pair.day || '').toLowerCase();
      const dayIndex = DAY_TO_INDEX[dayKey];
      const parsedRange = parseTimeRanges([pair.hours]);

      if (typeof dayIndex !== 'number' || parsedRange.length !== 1) return null;

      return {
        dayIndex,
        startTime: parsedRange[0].startTime,
        endTime: parsedRange[0].endTime
      };
    })
    .filter(Boolean);

  if (normalizedPairs.length === 0) {
    return {
      created: 0,
      scheduledDays: 0,
      skipped: true
    };
  }

  const ops = [];
  const base = new Date();
  base.setHours(0, 0, 0, 0);

  for (let offset = 0; offset < daysAhead; offset += 1) {
    const current = new Date(base);
    current.setDate(base.getDate() + offset);
    const pairsForDay = normalizedPairs.filter((pair) => pair.dayIndex === current.getDay());
    if (pairsForDay.length === 0) continue;
    const date = formatDate(current);
    pairsForDay.forEach(({ startTime, endTime }) => {
      ops.push({
        updateOne: {
          filter: {
            doctorId: String(doctorId),
            date,
            startTime,
            endTime
          },
          update: {
            $setOnInsert: {
              doctorId: String(doctorId),
              date,
              startTime,
              endTime,
              status: 'scheduled'
            }
          },
          upsert: true
        }
      });
    });
  }

  if (ops.length === 0) {
    return {
      created: 0,
      scheduledDays: 0,
      skipped: true
    };
  }

  const result = await Shift.bulkWrite(ops, { ordered: false });
  return {
    created: result.upsertedCount || 0,
    scheduledDays: new Set(ops.map((op) => op.updateOne.filter.date)).size,
    skipped: false
  };
}

module.exports = {
  normalizeStringArray,
  validateDoctorSchedule,
  ensureDoctorFutureShifts
};
