const express = require('express');
const router = express.Router();
const Appointment = require('../models/appointment');
const Patient = require('../models/patient');
const QueueState = require('../models/queueState');
const Shift = require('../models/shift');
const { requireAuth } = require('../auth/auth.middleware');
const { getIo } = require('../socket/io');
const { createNotification } = require('../services/notification.service');

const SLOT_MINUTES = 10;
const CANCELLED_STATUS = 'cancelled';
const ACTIVE_STATUSES = ['pending', 'completed'];
const ALLOWED_STATUSES = [...ACTIVE_STATUSES, CANCELLED_STATUS];

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

function normalizeTimeLabel(time) {
  return String(time || '').trim().toUpperCase();
}

function normalizeIsoDate(value) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

function parsePagination(value, fallback, { min = 1, max = 100 } = {}) {
  const parsed = Number.parseInt(String(value ?? fallback), 10);
  if (!Number.isInteger(parsed)) return null;
  if (parsed < min) return null;
  return Math.min(parsed, max);
}

async function buildShiftQueueSnapshot(shiftId) {
  const queue = await QueueState.findOne({ shiftId }).lean();
  const currentServing = queue ? queue.currentServing : 0;
  const patients = await Appointment.find({
    shiftId,
    status: { $ne: CANCELLED_STATUS }
  })
    .sort({ queueNumber: 1 })
    .lean();

  return {
    shiftId: String(shiftId),
    currentServing,
    totalPatients: patients.length,
    patients
  };
}

async function emitShiftBookingUpdated(shiftId) {
  try {
    const io = getIo();
    const snapshot = await buildShiftQueueSnapshot(shiftId);
    io.to(String(shiftId)).emit('bookingUpdated', snapshot);
  } catch (error) {
    console.error('Failed to emit bookingUpdated event:', error.message);
  }
}

async function createAppointmentNotifications(appointment) {
  const appointmentId = String(appointment._id);
  const doctorName = appointment.doctorName || 'your doctor';
  const patientName = appointment.bookingFor || 'a patient';
  const scheduleLabel = `${appointment.date || 'upcoming date'} at ${appointment.time || 'scheduled time'}`;

  await Promise.allSettled([
    createNotification({
      userId: appointment.patientId,
      role: 'patient',
      type: 'appointment_created',
      title: 'Appointment Confirmed',
      body: `Your appointment with ${doctorName} is booked for ${scheduleLabel}.`,
      data: {
        appointmentId,
        doctorId: appointment.doctorId,
        shiftId: appointment.shiftId
      }
    }),
    createNotification({
      userId: appointment.doctorId,
      role: 'doctor',
      type: 'appointment_created',
      title: 'New Appointment Booked',
      body: `${patientName} booked an appointment for ${scheduleLabel}.`,
      data: {
        appointmentId,
        patientId: appointment.patientId,
        shiftId: appointment.shiftId
      }
    })
  ]);
}

async function createAppointmentStatusNotifications(updated, previousStatus) {
  const normalizedStatus = String(updated.status || '').trim();
  const appointmentId = String(updated._id);
  const scheduleLabel = `${updated.date || 'upcoming date'} at ${updated.time || 'scheduled time'}`;
  const doctorName = updated.doctorName || 'your doctor';

  if (!normalizedStatus || normalizedStatus === previousStatus) return;

  await Promise.allSettled([
    createNotification({
      userId: updated.patientId,
      role: 'patient',
      type: 'appointment_status_changed',
      title: 'Appointment Status Updated',
      body: `Your appointment with ${doctorName} on ${scheduleLabel} is now ${normalizedStatus}.`,
      data: {
        appointmentId,
        status: normalizedStatus,
        doctorId: updated.doctorId,
        shiftId: updated.shiftId
      }
    }),
    createNotification({
      userId: updated.doctorId,
      role: 'doctor',
      type: 'appointment_status_changed',
      title: 'Appointment Status Changed',
      body: `Appointment #${updated.queueNumber || '-'} on ${scheduleLabel} is now ${normalizedStatus}.`,
      data: {
        appointmentId,
        status: normalizedStatus,
        patientId: updated.patientId,
        shiftId: updated.shiftId
      }
    })
  ]);
}

router.use(requireAuth);

/* --------------------------------------------------
   1. Get all shifts for a doctor
-------------------------------------------------- */
router.get('/doctor/:doctorId', async (req, res) => {
  try {
    const { doctorId } = req.params;

    if (!doctorId) {
      return res.status(400).json({ message: 'doctorId is required' });
    }

    const shifts = await Shift.find({ doctorId })
      .sort({ date: -1, startTime: 1 })
      .lean();

    return res.json(shifts);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Failed to fetch shifts' });
  }
});

/* --------------------------------------------------
   2. Get available slots for a doctor on a date/shift
-------------------------------------------------- */
router.get('/available-slots', async (req, res) => {
  try {
    const { doctorId, date, shiftId } = req.query;

    if (!doctorId || !date || !shiftId) {
      return res.status(400).json({
        message: 'doctorId, date, and shiftId are required'
      });
    }

    const shift = await Shift.findById(shiftId).lean();
    if (!shift) {
      return res.status(404).json({ message: 'Shift not found' });
    }

    if (String(shift.doctorId) !== String(doctorId)) {
      return res.status(400).json({ message: 'This shift does not belong to the given doctorId' });
    }

    const normalizedShiftDate = normalizeIsoDate(shift.date);
    const normalizedQueryDate = normalizeIsoDate(date);
    if (!normalizedShiftDate || !normalizedQueryDate || normalizedShiftDate !== normalizedQueryDate) {
      return res.status(400).json({ message: 'Given date does not match shift date' });
    }

    if (shift.status === 'ended') {
      return res.json({
        doctorId,
        date,
        shiftId,
        slotDurationMinutes: SLOT_MINUTES,
        totalSlots: 0,
        bookedSlots: [],
        freeSlots: []
      });
    }

    const allSlots = buildSlots(shift.startTime, shift.endTime, SLOT_MINUTES);
    const bookedAppointments = await Appointment.find({
      doctorId,
      date,
      shiftId,
      status: { $ne: CANCELLED_STATUS }
    })
      .select({ time: 1, _id: 0 })
      .lean();

    const bookedSet = new Set(
      bookedAppointments.map((a) => normalizeTimeLabel(a.time))
    );

    const freeSlots = allSlots.filter((slot) => !bookedSet.has(normalizeTimeLabel(slot)));
    const bookedSlots = allSlots.filter((slot) => bookedSet.has(normalizeTimeLabel(slot)));

    return res.json({
      doctorId,
      date,
      shiftId,
      slotDurationMinutes: SLOT_MINUTES,
      totalSlots: allSlots.length,
      bookedSlots,
      freeSlots
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      message: 'Failed to fetch available slots',
      error: error.message
    });
  }
});

/* --------------------------------------------------
   3. Create appointment
-------------------------------------------------- */
router.post('/', async (req, res) => {
  let rollbackExpectedQueueNumber = null;
  try {
    const appointmentData = req.body;
    const actorUserId = String(req.user?.sub || '').trim();
    const actorRole = req.user?.role;

    if (!appointmentData.patientId) {
      return res.status(400).json({
        message: 'patientId is required'
      });
    }

    if (!appointmentData.shiftId) {
      return res.status(400).json({
        message: 'shiftId is required for queue tracking'
      });
    }

    if (!appointmentData.doctorId || !appointmentData.date || !appointmentData.time) {
      return res.status(400).json({
        message: 'doctorId, date, and time are required'
      });
    }

    if (actorRole !== 'admin' && String(appointmentData.patientId) !== actorUserId) {
      return res.status(403).json({ message: 'Forbidden: patientId must match authenticated user' });
    }

    const patientExists = await Patient.exists({
      _id: appointmentData.patientId
    });

    if (!patientExists) {
      return res.status(404).json({
        message: 'Patient not found'
      });
    }

    const shift = await Shift.findById(appointmentData.shiftId).lean();
    if (!shift) {
      return res.status(404).json({
        message: 'Shift not found'
      });
    }

    if (shift.status === 'ended') {
      return res.status(409).json({
        message: 'Shift has ended'
      });
    }

    if (String(shift.doctorId) !== String(appointmentData.doctorId)) {
      return res.status(400).json({
        message: 'shiftId does not belong to this doctorId'
      });
    }

    const normalizedShiftDate = normalizeIsoDate(shift.date);
    const normalizedAppointmentDate = normalizeIsoDate(appointmentData.date);
    if (!normalizedShiftDate || !normalizedAppointmentDate || normalizedShiftDate !== normalizedAppointmentDate) {
      return res.status(400).json({
        message: 'Appointment date must match shift date'
      });
    }

    const shiftSlots = buildSlots(shift.startTime, shift.endTime, SLOT_MINUTES);
    const normalizedRequestedTime = normalizeTimeLabel(appointmentData.time);
    const allowedSet = new Set(shiftSlots.map(normalizeTimeLabel));

    if (!allowedSet.has(normalizedRequestedTime)) {
      return res.status(400).json({
        message: 'Selected time is outside doctor shift or not on 10-minute boundary'
      });
    }

    const queue = await QueueState.findOneAndUpdate(
      { shiftId: appointmentData.shiftId },
      {
        $inc: { lastQueueNumber: 1 },
        $setOnInsert: { currentServing: 0, lastQueueNumber: 0 }
      },
      { new: true, upsert: true }
    );

    const queueNumber = queue.lastQueueNumber;
    rollbackExpectedQueueNumber = queueNumber;
    const normalizedIncomingStatus = String(appointmentData.status || 'pending').trim().toLowerCase();
    const finalStatus = ALLOWED_STATUSES.includes(normalizedIncomingStatus)
      ? normalizedIncomingStatus
      : 'pending';

    const newAppointment = new Appointment({
      ...appointmentData,
      status: finalStatus,
      queueNumber
    });

    const saved = await newAppointment.save();
    const appointment = saved.toObject();
    await emitShiftBookingUpdated(appointmentData.shiftId);
    await createAppointmentNotifications(appointment);

    return res.status(201).json({
      ...appointment,
      message: 'Appointment created successfully',
      queueNumber
    });

  } catch (error) {
    console.error(error);
    if (error && error.code === 11000) {
      try {
        await QueueState.updateOne(
          {
            shiftId: req.body?.shiftId,
            lastQueueNumber: rollbackExpectedQueueNumber
          },
          { $inc: { lastQueueNumber: -1 } }
        );
      } catch (rollbackError) {
        console.error('Failed to rollback queue increment after duplicate appointment:', rollbackError);
      }
      return res.status(409).json({
        message: 'Selected slot is already booked',
        error: error.message
      });
    }

    return res.status(500).json({
      message: 'Failed to create appointment',
      error: error.message
    });
  }
});

/* --------------------------------------------------
   Read appointments
-------------------------------------------------- */

router.get('/', async (req, res) => {
  try {
    const page = parsePagination(req.query.page, 1, { min: 1, max: 100000 });
    const limit = parsePagination(req.query.limit, 20, { min: 1, max: 100 });

    if (page === null || limit === null) {
      return res.status(400).json({ error: 'Invalid page or limit' });
    }

    const actorUserId = String(req.user?.sub || '').trim();
    const actorRole = req.user?.role;
    const query = {};

    if (actorRole !== 'admin' && actorRole !== 'doctor') {
      query.patientId = actorUserId;
    } else if (actorRole === 'doctor') {
      query.doctorId = actorUserId;
    }

    const [list, totalCount] = await Promise.all([
      Appointment.find(query)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      Appointment.countDocuments(query)
    ]);

    return res.json({
      page,
      limit,
      totalCount,
      items: list
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Failed to fetch appointments' });
  }
});

/* --------------------------------------------------
   Update appointment status
-------------------------------------------------- */

router.put('/:id/status', async (req, res) => {
  try {
    const { status, consultationNotes } = req.body;
    const hasConsultationNotes = Object.prototype.hasOwnProperty.call(req.body, 'consultationNotes');
    if (!status) return res.status(400).json({ error: 'Status is required' });
    const normalizedStatus = String(status).trim().toLowerCase();
    if (!ALLOWED_STATUSES.includes(normalizedStatus)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    const existing = await Appointment.findById(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Appointment not found' });
    const actorUserId = String(req.user?.sub || '').trim();
    const actorRole = req.user?.role;
    const canUpdate = actorRole === 'admin' || String(existing.doctorId) === actorUserId;
    if (!canUpdate) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const previousStatus = String(existing.status || '').trim().toLowerCase();
    existing.status = normalizedStatus;

    if (hasConsultationNotes) {
      existing.consultationNotes = consultationNotes ?? '';
    } else if (typeof existing.consultationNotes !== 'string') {
      existing.consultationNotes = '';
    }

    const updated = await existing.save();

    await createAppointmentStatusNotifications(updated.toObject(), previousStatus);

    const wasCancelled = previousStatus === CANCELLED_STATUS;
    const isCancelled = normalizedStatus === CANCELLED_STATUS;
    if (isCancelled || (wasCancelled && !isCancelled)) {
      await emitShiftBookingUpdated(updated.shiftId);
    }

    res.json(updated);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

/* --------------------------------------------------
   Get doctor's all appointments
-------------------------------------------------- */

router.get('/doctor/:doctorId/patients', async (req, res) => {
  try {
    const actorUserId = String(req.user?.sub || '').trim();
    const actorRole = req.user?.role;
    if (actorRole !== 'admin' && actorUserId !== String(req.params.doctorId)) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const appointments = await Appointment
      .find({ doctorId: req.params.doctorId })
      .sort({ createdAt: -1 })
      .lean();

    const patientMap = new Map();

    appointments.forEach((apt) => {
      if (!patientMap.has(apt.patientId)) {
        patientMap.set(apt.patientId, {
          id: apt.patientId,
          name: apt.patientName || apt.bookingFor || 'Unknown Patient',
          age: apt.age || 'N/A',
          gender: apt.gender || 'N/A',
          blood: 'N/A',
          location: 'N/A',
          time: apt.time,
          lastBooking: apt.date,
          totalVisits: 1
        });
      } else {
        const existing = patientMap.get(apt.patientId);
        existing.totalVisits += 1;
      }
    });

    res.json(Array.from(patientMap.values()));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;