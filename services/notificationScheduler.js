const Appointment = require('../models/appointment');
const Notification = require('../models/notification');
const Shift = require('../models/shift');
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

  try {
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
  } catch (error) {
    if (error.code === 11000) {
      return false; // Another instance created the lock first
    }
    throw error;
  }
}

function parseShiftEndDateTime(shift) {
  const dateStr = String(shift.date || '').trim();
  const timeStr = String(shift.endTime || '').trim();
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

function parseShiftStartDateTime(shift) {
  const dateStr = String(shift.date || '').trim();
  const timeStr = String(shift.startTime || '').trim();
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

async function runStatusUpdateCycle() {
  const now = new Date();

  // 1. Shifts: turn 'scheduled' to 'ended' if endTime has passed
  try {
    const scheduledShifts = await Shift.find({ status: 'scheduled' }).lean();
    const shiftsToUpdate = [];
    
    for (const shift of scheduledShifts) {
      const endDateTime = parseShiftEndDateTime(shift);
      if (endDateTime && now >= endDateTime) {
        shiftsToUpdate.push(shift._id);
      }
    }

    if (shiftsToUpdate.length > 0) {
      await Shift.updateMany(
        { _id: { $in: shiftsToUpdate } },
        { $set: { status: 'ended' } }
      );
    }
  } catch (error) {
    console.error('Error auto-updating shifts:', error.message);
  }

  // 1.5 Shifts: turn 'active' to 'cancelled' if current date > shift date
  try {
    const activeShifts = await Shift.find({ status: 'active' }).lean();
    const activeShiftsToCancel = [];

    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const localTodayStr = `${year}-${month}-${day}`;

    for (const shift of activeShifts) {
      if (!shift.date) continue;
      
      const shiftDateStr = String(shift.date).trim();
      if (localTodayStr > shiftDateStr) {
        activeShiftsToCancel.push(shift._id);
      }
    }

    if (activeShiftsToCancel.length > 0) {
      await Shift.updateMany(
        { _id: { $in: activeShiftsToCancel } },
        { $set: { status: 'ended' } }
      );
    }
  } catch (error) {
    console.error('Error auto-cancelling active shifts:', error.message);
  }

  // 2. Appointments: turn 'pending' to 'cancelled' if current date > appointment date
  try {
    const pendingAppointments = await Appointment.find({ status: 'pending' }).lean();
    const appointmentsToUpdate = [];
    
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const localTodayStr = `${year}-${month}-${day}`;

    for (const appt of pendingAppointments) {
      if (!appt.date) continue;
      
      const apptDateStr = String(appt.date).trim();
      if (localTodayStr > apptDateStr) {
        appointmentsToUpdate.push(appt._id);
      }
    }

    if (appointmentsToUpdate.length > 0) {
      await Appointment.updateMany(
        { _id: { $in: appointmentsToUpdate } },
        { $set: { status: 'cancelled' } }
      );
    }
  } catch (error) {
    console.error('Error auto-cancelling appointments:', error.message);
  }

  // 3. Detect shifts that should have started but remain 'scheduled' and notify
  try {
    const scheduledShiftsForStart = await Shift.find({ status: 'scheduled' }).lean();
    for (const shift of scheduledShiftsForStart) {
      const startDateTime = parseShiftStartDateTime(shift);
      if (!startDateTime) continue;
      if (now < startDateTime) continue;

      const alreadyNotified = await Notification.exists({ type: 'shift_late', 'data.shiftId': String(shift._id) });
      if (alreadyNotified) continue;

      const scheduleLabel = `${shift.date || 'upcoming date'} at ${shift.startTime || 'start time'}`;
      const doctorName = shift.doctorName || 'your doctor';

      // Notify doctor
      try {
        if (shift.doctorId) {
          await createNotification({
            userId: shift.doctorId,
            role: 'doctor',
            type: 'shift_late',
            title: 'You are late for your shift',
            body: `You are late for your shift on ${scheduleLabel}. Patients are waiting. Please attend or update your status.`,
            data: {
              shiftId: String(shift._id),
              date: shift.date,
              startTime: shift.startTime
            }
          });
        }
      } catch (err) {
        console.error('Failed to notify doctor about late shift', { shiftId: String(shift._id), error: err.message });
      }

      // Notify patients who have appointments in this shift
      try {
        const appointments = await Appointment.find({ shiftId: shift._id, status: { $ne: 'cancelled' } }).select({ patientId: 1, date: 1, time: 1 }).lean();
        const patientIds = new Set();
        for (const appt of appointments) {
          if (appt.patientId) patientIds.add(String(appt.patientId));
        }

        const jobs = [];
        for (const patientId of patientIds) {
          jobs.push(createNotification({
            userId: patientId,
            role: 'patient',
            type: 'shift_late',
            title: 'Doctor Running Late',
            body: `Reminder: ${doctorName} is running a little late for the shift scheduled on ${scheduleLabel}. Please wait a little longer.`,
            data: {
              shiftId: String(shift._id),
              date: shift.date,
              startTime: shift.startTime
            }
          }));
        }

        await Promise.allSettled(jobs);
      } catch (err) {
        console.error('Failed to notify patients about late shift', { shiftId: String(shift._id), error: err.message });
      }
    }
  } catch (error) {
    console.error('Error checking for late shifts:', error.message);
  }
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
  await runStatusUpdateCycle();
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
