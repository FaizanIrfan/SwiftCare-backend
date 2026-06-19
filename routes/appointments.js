const express = require('express');
const router = express.Router();
const Appointment = require('../models/appointment');
const Patient = require('../models/patient');
const QueueState = require('../models/queueState');
const Shift = require('../models/shift');
const { requireAuth } = require('../auth/auth.middleware');
const { createNotification } = require('../services/notification.service');
const { getAdminUserIds } = require('../services/notification.targets');
const {
  EVENTS,
  emitShiftBookingUpdated,
  emitQueueUpdated,
  emitAppointmentEvent
} = require('../services/realtimeEvents');
const {
  SLOT_MINUTES,
  normalizeTimeLabel,
  buildSlots,
  buildSlotIndexMap,
  getQueueNumberForTime
} = require('../services/queueSlots');

const CANCELLED_STATUS = 'cancelled';
const IN_PROGRESS_STATUS = 'in-progress';
const ACTIVE_STATUSES = ['pending', 'in-progress', 'completed'];
const ALLOWED_STATUSES = [...ACTIVE_STATUSES, CANCELLED_STATUS];

function normalizeIsoDate(value) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

function normalizeDateOnly(value) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

function parsePagination(value, fallback, { min = 1, max = 100 } = {}) {
  const parsed = Number.parseInt(String(value ?? fallback), 10);
  if (!Number.isInteger(parsed)) return null;
  if (parsed < min) return null;
  return Math.min(parsed, max);
}

function normalizeStatusInput(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'in_progress') return 'in-progress';
  return normalized;
}

async function syncQueueStateWithInProgressAppointment(appointment) {
  const queueNumber = Number(appointment?.queueNumber);
  const shiftId = appointment?.shiftId;

  if (!shiftId || !Number.isInteger(queueNumber) || queueNumber <= 0) {
    return null;
  }

  return QueueState.findOneAndUpdate(
    { shiftId },
    { $set: { currentServing: queueNumber } },
    { new: true, upsert: true }
  ).lean();
}

async function createAppointmentNotifications(appointment) {
  const appointmentId = String(appointment._id);
  const doctorName = appointment.doctorName || 'your doctor';
  const patientName = appointment.bookingFor || 'a patient';
  const scheduleLabel = `${appointment.date || 'upcoming date'} at ${appointment.time || 'scheduled time'}`;
  const adminUserIds = getAdminUserIds();

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
    }),
    ...adminUserIds.map((adminUserId) =>
      createNotification({
        userId: adminUserId,
        role: 'admin',
        type: 'appointment_created',
        title: 'New Appointment Created',
        body: `${patientName} booked an appointment with ${doctorName} for ${scheduleLabel}.`,
        data: {
          appointmentId,
          doctorId: appointment.doctorId,
          patientId: appointment.patientId,
          shiftId: appointment.shiftId
        }
      })
    )
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
   2. Get available slot and patients before that slot
-------------------------------------------------- */

router.get('/slot', async (req, res) => {
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

    const normalizedShiftDate = normalizeDateOnly(shift.date);
    const normalizedQueryDate = normalizeDateOnly(date);
    if (!normalizedShiftDate || !normalizedQueryDate || normalizedShiftDate !== normalizedQueryDate) {
      return res.status(400).json({ message: 'Given date does not match shift date' });
    }

    if (shift.status === 'ended') {
      return res.json({
        doctorId,
        date: normalizedQueryDate,
        shiftId,
        nextAvailableTime: null,
        patientsBefore: 0
      });
    }

    const allSlots = buildSlots(shift.startTime, shift.endTime, SLOT_MINUTES);
    const bookedAppointments = await Appointment.find({
      doctorId,
      date: normalizedQueryDate,
      shiftId,
      status: { $ne: CANCELLED_STATUS }
    })
      .select({ time: 1, _id: 0 })
      .lean();

    const bookedSet = new Set(
      bookedAppointments.map((a) => normalizeTimeLabel(a.time))
    );

    const freeSlots = allSlots.filter((slot) => !bookedSet.has(normalizeTimeLabel(slot)));
    
    const nextAvailableTime = freeSlots.length > 0 ? freeSlots[0] : null;
    const patientsBefore = nextAvailableTime ? allSlots.indexOf(nextAvailableTime) : allSlots.length;

    return res.json({
      doctorId,
      date: normalizedQueryDate,
      shiftId,
      nextAvailableTime,
      patientsBefore
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

    const normalizedShiftDate = normalizeDateOnly(shift.date);
    const normalizedAppointmentDate = normalizeDateOnly(appointmentData.date);
    if (!normalizedShiftDate || !normalizedAppointmentDate || normalizedShiftDate !== normalizedAppointmentDate) {
      return res.status(400).json({
        message: 'Appointment date must match shift date'
      });
    }

    const { slots: shiftSlots, slotIndexByTime } = buildSlotIndexMap(
      shift.startTime,
      shift.endTime,
      SLOT_MINUTES
    );
    const normalizedRequestedTime = normalizeTimeLabel(appointmentData.time);
    const allowedSet = new Set(shiftSlots.map(normalizeTimeLabel));

    if (!allowedSet.has(normalizedRequestedTime)) {
      return res.status(400).json({
        message: 'Selected time is outside doctor shift or not on 10-minute boundary'
      });
    }

    const queueNumber = getQueueNumberForTime(appointmentData.time, slotIndexByTime);
    if (!queueNumber) {
      return res.status(400).json({
        message: 'Selected time is outside doctor shift or not on 10-minute boundary'
      });
    }

    const queueState = await QueueState.findOne({ shiftId: appointmentData.shiftId }).lean();
    if (queueState && queueState.currentServing >= queueNumber) {
      return res.status(409).json({
        message: 'Selected time has already passed in the queue'
      });
    }
    const normalizedIncomingStatus = normalizeStatusInput(appointmentData.status || 'pending');
    const finalStatus = ALLOWED_STATUSES.includes(normalizedIncomingStatus)
      ? normalizedIncomingStatus
      : 'pending';

    const newAppointment = new Appointment({
      ...appointmentData,
      date: normalizedAppointmentDate,
      status: finalStatus,
      queueNumber
    });

    const saved = await newAppointment.save();
    const appointment = saved.toObject();
    emitAppointmentEvent(EVENTS.APPOINTMENT_CREATED, appointment);
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
    const normalizedStatus = normalizeStatusInput(status);
    if (!ALLOWED_STATUSES.includes(normalizedStatus)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    const existing = await Appointment.findById(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Appointment not found' });
    const actorUserId = String(req.user?.sub || '').trim();
    const actorRole = req.user?.role;
    // Doctors and admins can update any appointment; patients can only cancel their own
    const isDoctor = actorRole === 'admin' || String(existing.doctorId) === actorUserId;
    const isPatient = String(existing.patientId) === actorUserId && actorRole === 'patient';
    const canUpdate = isDoctor || isPatient;
    if (!canUpdate) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const previousStatus = normalizeStatusInput(existing.status);
    existing.status = normalizedStatus;

    if (hasConsultationNotes) {
      existing.consultationNotes = consultationNotes ?? '';
    } else if (typeof existing.consultationNotes !== 'string') {
      existing.consultationNotes = '';
    }

    const updated = await existing.save();
    const updatedPayload = updated.toObject();

    await createAppointmentStatusNotifications(updatedPayload, previousStatus);

    if (normalizedStatus === IN_PROGRESS_STATUS) {
      const queue = await syncQueueStateWithInProgressAppointment(updatedPayload);
      if (queue) {
        emitQueueUpdated({
          shiftId: updated.shiftId,
          currentServing: queue.currentServing,
          currentAppointment: updatedPayload
        });
      }
    }

    const wasCancelled = previousStatus === CANCELLED_STATUS;
    const isCancelled = normalizedStatus === CANCELLED_STATUS;
    if (isCancelled || (wasCancelled && !isCancelled)) {
      await emitShiftBookingUpdated(updated.shiftId);
    }

    if (previousStatus !== normalizedStatus) {
      emitAppointmentEvent(EVENTS.APPOINTMENT_UPDATED, updatedPayload, {
        previousStatus
      });

      if (normalizedStatus === CANCELLED_STATUS) {
        emitAppointmentEvent(EVENTS.APPOINTMENT_CANCELLED, updatedPayload, {
          previousStatus
        });
      }

      if (normalizedStatus === IN_PROGRESS_STATUS) {
        emitAppointmentEvent(EVENTS.CONSULTATION_STARTED, updatedPayload, {
          previousStatus
        });
      }

      if (normalizedStatus === 'completed') {
        emitAppointmentEvent(EVENTS.CONSULTATION_ENDED, updatedPayload, {
          previousStatus
        });
      }
    }

    res.json(updated);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

/* --------------------------------------------------
   Get single appointment by id
-------------------------------------------------- */
router.get('/:id', async (req, res) => {
  try {
    const appointment = await Appointment.findById(req.params.id).lean();
    if (!appointment) return res.status(404).json({ error: 'Appointment not found' });

    const actorUserId = String(req.user?.sub || '').trim();
    const actorRole = req.user?.role;

    if (actorRole !== 'admin' && actorRole !== 'doctor' && String(appointment.patientId) !== actorUserId) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    return res.json(appointment);
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: e.message });
  }
});

/* --------------------------------------------------
   Generic update appointment (partial)
-------------------------------------------------- */
router.put('/:id', async (req, res) => {
  try {
    const existing = await Appointment.findById(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Appointment not found' });

    const actorUserId = String(req.user?.sub || '').trim();
    const actorRole = req.user?.role;
    const isDoctor = actorRole === 'admin' || String(existing.doctorId) === actorUserId;
    const isPatient = String(existing.patientId) === actorUserId && actorRole === 'patient';
    const canUpdate = isDoctor || isPatient;
    if (!canUpdate) return res.status(403).json({ error: 'Forbidden' });

    const previousStatus = String(existing.status || '').trim().toLowerCase();

    // Apply allowed updates from body (shallow merge)
    const updatable = ['doctorId','patientId','date','time','type','bookingFor','patientName','doctorName','doctorSpecialty','age','gender','shiftId'];
    updatable.forEach((k) => {
      if (Object.prototype.hasOwnProperty.call(req.body, k)) existing[k] = req.body[k];
    });

    // If status provided, handle via status flow
    if (Object.prototype.hasOwnProperty.call(req.body, 'status')) {
      const normalized = String(req.body.status || '').trim().toLowerCase();
      if (ALLOWED_STATUSES.includes(normalized)) {
        existing.status = normalized;
      }
    }

    const updated = await existing.save();

    // Notify if status changed
    await createAppointmentStatusNotifications(updated.toObject(), previousStatus);

    if (String(updated.status || '').trim().toLowerCase() === IN_PROGRESS_STATUS) {
      await syncQueueStateWithInProgressAppointment(updated.toObject());
    }

    // Emit booking update if cancellation toggled
    const wasCancelled = previousStatus === CANCELLED_STATUS;
    const isCancelled = String(updated.status || '').trim() === CANCELLED_STATUS;
    if (isCancelled || (wasCancelled && !isCancelled)) {
      await emitShiftBookingUpdated(updated.shiftId);
    }

    return res.json(updated);
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: e.message });
  }
});

/* --------------------------------------------------
   Delete appointment (mark cancelled)
-------------------------------------------------- */
router.delete('/:id', async (req, res) => {
  try {
    const existing = await Appointment.findById(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Appointment not found' });

    const actorUserId = String(req.user?.sub || '').trim();
    const actorRole = req.user?.role;
    // allow admin or the patient who owns the appointment
    if (actorRole !== 'admin' && String(existing.patientId) !== actorUserId) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const previousStatus = String(existing.status || '').trim().toLowerCase();
    if (previousStatus !== CANCELLED_STATUS) {
      existing.status = CANCELLED_STATUS;
      await existing.save();
      await createAppointmentStatusNotifications(existing.toObject(), previousStatus);
      await emitShiftBookingUpdated(existing.shiftId);
    }

    return res.json({ message: 'Appointment cancelled' });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: e.message });
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
