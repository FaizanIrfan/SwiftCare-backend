const Appointment = require('../models/appointment');
const Notification = require('../models/notification');
const { createNotification } = require('./notification.service');
const mongoose = require('mongoose');

const CHECK_INTERVAL_MS = 60 * 1000;
const SKIP_STATUSES = new Set(['cancelled', 'completed', 'done', 'no_show', 'noshow']);
const REMINDER_WINDOWS = [
  { key: '24h', minMinutes: 23 * 60, maxMinutes: 24 * 60 },
  { key: '1h', minMinutes: 50, maxMinutes: 60 }
];
const LOCK_NAME = 'notification_reminder_scheduler';
const LOCK_TTL_MS = 2 * CHECK_INTERVAL_MS;

let schedulerTimer = null;
let instanceId = `${process.pid}-${Math.random().toString(36).slice(2, 10)}`;
let disabledNoticeShown = false;

function parseAppointmentDateTime(appointment) {
  if (appointment.fullDateIso) {
    const directDate = new Date(appointment.fullDateIso);
    if (!Number.isNaN(directDate.getTime())) return directDate;
  }

  const dateStr = String(appointment.date || '').trim();
  const timeStr = String(appointment.time || '').trim();
  if (!dateStr || !timeStr) return null;

  const dateMatch = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const timeMatch = timeStr.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!dateMatch || !timeMatch) return null;

  let hour = Number(timeMatch[1]);
  const minute = Number(timeMatch[2]);
  const meridiem = timeMatch[3].toUpperCase();

  if (hour === 12) hour = 0;
  if (meridiem === 'PM') hour += 12;

  const year = Number(dateMatch[1]);
  const month = Number(dateMatch[2]) - 1;
  const day = Number(dateMatch[3]);

  return new Date(year, month, day, hour, minute, 0, 0);
}

async function reminderAlreadySent({ appointmentId, key }) {
  const exists = await Notification.exists({
    type: 'appointment_reminder',
    'data.appointmentId': String(appointmentId),
    'data.reminderKey': key
  });
  return Boolean(exists);
}

async function processAppointmentReminderWindow(windowConfig, now) {
  const minFuture = new Date(now.getTime() + windowConfig.minMinutes * 60 * 1000);
  const maxFuture = new Date(now.getTime() + windowConfig.maxMinutes * 60 * 1000);
  const appointments = await Appointment.find({
    patientId: { $exists: true, $ne: null },
    fullDateIso: {
      $gte: minFuture.toISOString(),
      $lte: maxFuture.toISOString()
    }
  }).lean();

  for (const appointment of appointments) {
    const normalizedStatus = String(appointment.status || '').trim().toLowerCase();
    if (normalizedStatus && SKIP_STATUSES.has(normalizedStatus)) continue;

    const when = parseAppointmentDateTime(appointment);
    if (!when) continue;
    if (when < now || when > maxFuture) continue;

    const minutesUntil = Math.floor((when.getTime() - now.getTime()) / 60000);
    if (minutesUntil < windowConfig.minMinutes || minutesUntil > windowConfig.maxMinutes) continue;

    const alreadySent = await reminderAlreadySent({
      appointmentId: appointment._id,
      key: windowConfig.key
    });
    if (alreadySent) continue;

    const doctorName = appointment.doctorName || 'your doctor';
    const schedule = `${appointment.date || 'upcoming date'} at ${appointment.time || 'scheduled time'}`;

    try {
      await createNotification({
        userId: appointment.patientId,
        role: 'patient',
        type: 'appointment_reminder',
        title: 'Appointment Reminder',
        body: `Reminder: You have an appointment with ${doctorName} on ${schedule}.`,
        data: {
          appointmentId: String(appointment._id),
          doctorId: appointment.doctorId,
          shiftId: appointment.shiftId,
          reminderKey: windowConfig.key,
          minutesUntil
        }
      });
    } catch (error) {
      console.error('Failed to create reminder notification', {
        appointmentId: String(appointment._id),
        patientId: String(appointment.patientId || ''),
        doctorId: String(appointment.doctorId || ''),
        reminderKey: windowConfig.key,
        error: error.message
      });
    }
  }
}

async function runReminderCycle() {
  const now = new Date();
  for (const windowConfig of REMINDER_WINDOWS) {
    await processAppointmentReminderWindow(windowConfig, now);
  }
}

async function acquireSchedulerLock() {
  if (!mongoose.connection?.db) return false;
  const locksCollection = mongoose.connection.db.collection('schedulerLocks');
  const now = new Date();
  const leaseUntil = new Date(now.getTime() + LOCK_TTL_MS);

  const result = await locksCollection.findOneAndUpdate(
    {
      _id: LOCK_NAME,
      $or: [
        { leaseUntil: { $lte: now } },
        { ownerId: instanceId }
      ]
    },
    {
      $set: {
        ownerId: instanceId,
        leaseUntil,
        updatedAt: now
      },
      $setOnInsert: { createdAt: now }
    },
    {
      upsert: true,
      returnDocument: 'after'
    }
  );

  return result?.ownerId === instanceId || result?.value?.ownerId === instanceId;
}

async function runLeaderCycle() {
  const enabled = String(process.env.NOTIFICATION_SCHEDULER_ENABLED || 'true').toLowerCase() !== 'false';
  if (!enabled) {
    if (!disabledNoticeShown) {
      console.log('Notification scheduler is disabled by NOTIFICATION_SCHEDULER_ENABLED=false');
      disabledNoticeShown = true;
    }
    return;
  }

  const isLeader = await acquireSchedulerLock();
  if (!isLeader) return;

  await runReminderCycle();
}

function startNotificationScheduler() {
  if (schedulerTimer) return;

  runLeaderCycle().catch((error) => {
    console.error('Initial notification reminder cycle failed:', error.message);
  });

  schedulerTimer = setInterval(() => {
    runLeaderCycle().catch((error) => {
      console.error('Notification reminder cycle failed:', error.message);
    });
  }, CHECK_INTERVAL_MS);
}

module.exports = {
  startNotificationScheduler
};
