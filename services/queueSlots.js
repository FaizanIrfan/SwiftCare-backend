const SLOT_MINUTES = 10;

function normalizeTimeLabel(time) {
  return String(time || '').trim().toUpperCase();
}

function parse12HourTimeToMinutes(timeStr) {
  if (!timeStr || typeof timeStr !== 'string') return null;
  const match = timeStr.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!match) return null;

  let hours = Number(match[1]);
  const minutes = Number(match[2]);
  const meridiem = match[3].toUpperCase();

  if (hours < 1 || hours > 12 || minutes < 0 || minutes > 59) return null;

  if (hours === 12) hours = 0;
  if (meridiem === 'PM') hours += 12;

  return (hours * 60) + minutes;
}

function minutesTo12HourTime(totalMinutes) {
  const hours24 = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const meridiem = hours24 >= 12 ? 'PM' : 'AM';
  const hours12 = (hours24 % 12) || 12;

  return `${String(hours12).padStart(2, '0')}:${String(minutes).padStart(2, '0')} ${meridiem}`;
}

function buildSlots(startTime, endTime, slotMinutes = SLOT_MINUTES) {
  const start = parse12HourTimeToMinutes(startTime);
  const end = parse12HourTimeToMinutes(endTime);

  if (start === null || end === null || end <= start) {
    return [];
  }

  const slots = [];
  for (let t = start; t + slotMinutes <= end; t += slotMinutes) {
    slots.push(minutesTo12HourTime(t));
  }
  return slots;
}

function buildSlotIndexMap(startTime, endTime, slotMinutes = SLOT_MINUTES) {
  const slots = buildSlots(startTime, endTime, slotMinutes);
  const slotIndexByTime = {};

  slots.forEach((slot, index) => {
    slotIndexByTime[normalizeTimeLabel(slot)] = index + 1;
  });

  return { slots, slotIndexByTime };
}

function getQueueNumberForTime(time, slotIndexByTime) {
  if (!slotIndexByTime) return null;
  const key = normalizeTimeLabel(time);
  const value = slotIndexByTime[key];
  return Number.isInteger(value) ? value : null;
}

function attachQueueNumbers(appointments, slotIndexByTime) {
  if (!Array.isArray(appointments)) return [];
  return appointments.map((appointment) => {
    const computed = getQueueNumberForTime(appointment.time, slotIndexByTime);
    if (Number.isInteger(computed)) {
      return { ...appointment, queueNumber: computed };
    }

    const fallback = Number.isInteger(appointment.queueNumber)
      ? appointment.queueNumber
      : 0;
    return { ...appointment, queueNumber: fallback };
  });
}

module.exports = {
  SLOT_MINUTES,
  normalizeTimeLabel,
  buildSlots,
  buildSlotIndexMap,
  getQueueNumberForTime,
  attachQueueNumbers
};
