const Appointment = require('../models/appointment');
const QueueState = require('../models/queueState');
const Shift = require('../models/shift');
const { getIo } = require('../socket/io');
const { EVENTS } = require('../socket/events');
const { getUserRoom } = require('./notification.service');
const {
  SLOT_MINUTES,
  buildSlotIndexMap,
  attachQueueNumbers
} = require('./queueSlots');

const CANCELLED_STATUS = 'cancelled';

function normalizeClientStatus(status) {
  const normalized = String(status || '').trim().toLowerCase();
  if (!normalized) return '';
  if (normalized === 'in-progress') return 'in_progress';
  return normalized;
}

function toSerializableAppointment(appointment) {
  if (!appointment) return null;
  const raw = typeof appointment.toObject === 'function'
    ? appointment.toObject()
    : { ...appointment };
  if (raw.status) {
    raw.status = normalizeClientStatus(raw.status);
  }
  return raw;
}

function buildAppointmentPayload(appointment, { previousStatus } = {}) {
  const payloadAppointment = toSerializableAppointment(appointment);
  const shiftId = payloadAppointment?.shiftId
    ? String(payloadAppointment.shiftId)
    : '';
  const patientId = payloadAppointment?.patientId
    ? String(payloadAppointment.patientId)
    : '';
  const doctorId = payloadAppointment?.doctorId
    ? String(payloadAppointment.doctorId)
    : '';

  return {
    appointment: payloadAppointment,
    appointmentId: payloadAppointment?._id?.toString() ?? payloadAppointment?.id?.toString() ?? '',
    shiftId,
    patientId,
    doctorId,
    status: normalizeClientStatus(payloadAppointment?.status),
    previousStatus: normalizeClientStatus(previousStatus),
    updatedAt: new Date().toISOString()
  };
}

async function buildShiftQueueSnapshot(shiftId) {
  const [queue, shift, patients] = await Promise.all([
    QueueState.findOne({ shiftId }).lean(),
    Shift.findById(shiftId).lean(),
    Appointment.find({
      shiftId,
      status: { $ne: CANCELLED_STATUS }
    }).lean()
  ]);

  const currentServing = queue ? queue.currentServing : 0;
  if (!shift) {
    return {
      shiftId: String(shiftId),
      currentServing,
      totalPatients: patients.length,
      patients
    };
  }

  const { slotIndexByTime } = buildSlotIndexMap(
    shift.startTime,
    shift.endTime,
    SLOT_MINUTES
  );
  const orderedPatients = attachQueueNumbers(patients, slotIndexByTime)
    .sort((a, b) => a.queueNumber - b.queueNumber);

  return {
    shiftId: String(shiftId),
    currentServing,
    totalPatients: orderedPatients.length,
    patients: orderedPatients
  };
}

async function emitShiftBookingUpdated(shiftId) {
  try {
    const io = getIo();
    const snapshot = await buildShiftQueueSnapshot(shiftId);
    io.to(String(shiftId)).emit(EVENTS.BOOKING_UPDATED, snapshot);
  } catch (error) {
    console.error('Failed to emit bookingUpdated event:', error.message);
  }
}

function emitQueueUpdated({ shiftId, currentServing, currentAppointment }) {
  if (!shiftId) return;
  try {
    const io = getIo();
    io.to(String(shiftId)).emit(EVENTS.QUEUE_UPDATED, {
      shiftId: String(shiftId),
      currentServing: Number(currentServing) || 0,
      currentAppointment: toSerializableAppointment(currentAppointment),
      updatedAt: new Date().toISOString()
    });
  } catch (error) {
    console.error('Failed to emit queueUpdated event:', error.message);
  }
}

function emitAppointmentEvent(eventName, appointment, { previousStatus } = {}) {
  if (!appointment) return;
  const payload = buildAppointmentPayload(appointment, { previousStatus });

  try {
    const io = getIo();
    if (!io) return;
    if (payload.shiftId) {
      io.to(payload.shiftId).emit(eventName, payload);
    }
    if (payload.patientId) {
      io.to(getUserRoom(payload.patientId)).emit(eventName, payload);
    }
    if (payload.doctorId) {
      io.to(getUserRoom(payload.doctorId)).emit(eventName, payload);
    }
  } catch (error) {
    console.error(`Failed to emit ${eventName} event:`, error.message);
  }
}

module.exports = {
  EVENTS,
  emitShiftBookingUpdated,
  emitQueueUpdated,
  emitAppointmentEvent,
  buildShiftQueueSnapshot,
  normalizeClientStatus
};
