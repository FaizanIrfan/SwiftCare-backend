const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const Doctor = require('../models/doctor');
const Facility = require('../models/facility');
const Appointment = require('../models/appointment');
const Review = require('../models/review');
const Shift = require('../models/shift');
const { requireAuth } = require('../auth/auth.middleware');
const {
  validateDoctorSchedule,
  ensureDoctorFutureShifts
} = require('../services/shiftScheduler');

/* --------------------------------------------------
   Read all doctors
-------------------------------------------------- */

router.get('/', async (req, res) => {
  const doctors = await Doctor.find().sort({ createdAt: -1 }).lean();
  res.json(doctors);
});

/* --------------------------------------------------
   Nearby doctor
-------------------------------------------------- */

router.get('/nearby', requireAuth, async (req, res) => {
  try {
    const { lat, lng } = req.query;
    const parsedLat = Number.parseFloat(lat);
    const parsedLng = Number.parseFloat(lng);

    if (
      !Number.isFinite(parsedLat) ||
      !Number.isFinite(parsedLng) ||
      parsedLat < -90 ||
      parsedLat > 90 ||
      parsedLng < -180 ||
      parsedLng > 180
    ) {
      return res.status(400).json({ error: 'lat and lng are required valid coordinates' });
    }

    const doctors = await Doctor.find({
      'location.geo': {
        $near: {
          $geometry: {
            type: "Point",
            coordinates: [parsedLng, parsedLat]
          },
          $maxDistance: 5000
        }
      }
    });

    res.json(doctors);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/* --------------------------------------------------
   Read single doctor
-------------------------------------------------- */

router.get('/:id', async (req, res) => {
  const d = await Doctor.findById(req.params.id);
  if (!d) return res.status(404).json({ error: "Doctor not found" });
  res.json(d);
});

/* --------------------------------------------------
   Delete doctor
-------------------------------------------------- */

router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const actorRole = req.user?.role;
    if (actorRole !== 'admin') {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: 'Invalid doctor ID format' });
    }

    const doctor = await Doctor.findById(id);
    if (!doctor) {
      return res.status(404).json({ error: 'Doctor not found' });
    }

    const [facilityResult, appointmentResult, reviewResult, shiftResult, deletedDoctor] = await Promise.all([
      Facility.updateMany(
        { doctorList: id },
        { $pull: { doctorList: id } }
      ),
      Appointment.deleteMany({ doctorId: id }),
      Review.deleteMany({ doctorId: id }),
      Shift.deleteMany({ doctorId: id }),
      Doctor.deleteOne({ _id: id })
    ]);

    return res.json({
      success: true,
      message: 'Doctor deleted successfully',
      deletedDoctorCount: deletedDoctor.deletedCount || 0,
      cleanedUp: {
        facilitiesUpdated: facilityResult.modifiedCount || 0,
        appointmentsDeleted: appointmentResult.deletedCount || 0,
        reviewsDeleted: reviewResult.deletedCount || 0,
        shiftsDeleted: shiftResult.deletedCount || 0,
      }
    });
  } catch (e) {
    console.error('Error deleting doctor:', e);
    return res.status(500).json({ error: 'Failed to delete doctor', details: e.message });
  }
});

/* --------------------------------------------------
   Update doctor
-------------------------------------------------- */

router.put('/:id', requireAuth, async (req, res) => {
  try {
    const actorUserId = String(req.user?.sub || '').trim();
    const actorRole = req.user?.role;
    if (actorRole !== 'admin' && actorUserId !== String(req.params.id)) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const currentDoctor = await Doctor.findById(req.params.id);
    if (!currentDoctor) return res.status(404).json({ error: 'Doctor not found' });

    const payload = { ...req.body };
    delete payload._id;
    if (actorRole !== 'admin') {
      delete payload.credentials;
      delete payload.accountStatus;
      delete payload.location;
    }

    const hasScheduleInput = Object.prototype.hasOwnProperty.call(payload, 'schedule');

    if (hasScheduleInput) {
      if (!payload.schedule || typeof payload.schedule !== 'object' || Array.isArray(payload.schedule)) {
        return res.status(400).json({ error: 'schedule must be an object' });
      }

      const incomingScheduleDays = payload.schedule.availableDays;
      const incomingScheduleHours = payload.schedule.availableHours;

      const mergedDays = incomingScheduleDays ?? currentDoctor.schedule?.availableDays ?? [];
      const mergedHours = incomingScheduleHours ?? currentDoctor.schedule?.availableHours ?? [];

      const scheduleValidation = validateDoctorSchedule(mergedDays, mergedHours);
      if (!scheduleValidation.ok) {
        return res.status(400).json({ error: scheduleValidation.message });
      }
      payload.schedule = {
        availableDays: incomingScheduleDays ?? currentDoctor.schedule?.availableDays ?? [],
        availableHours: incomingScheduleHours ?? currentDoctor.schedule?.availableHours ?? []
      };
    }

    // Go all-in: apply any provided doctor fields directly.
    currentDoctor.set(payload);

    const updated = await currentDoctor.save();

    const scheduleSync = await ensureDoctorFutureShifts({
      doctorId: updated._id.toString(),
      availableDays: updated.schedule?.availableDays,
      availableHours: updated.schedule?.availableHours
    });

    res.json({
      ...updated.toObject(),
      scheduleSync
    });
  } catch (e) {
    console.error(e);
    const isValidationError =
      e instanceof mongoose.Error.ValidationError ||
      e instanceof mongoose.Error.CastError;
    const statusCode = isValidationError ? 400 : 500;
    res.status(statusCode).json({
      error: isValidationError ? 'Invalid request parameters' : 'Internal server error'
    });
  }
});

/* --------------------------------------------------
   Create doctor shifts (for upcoming 30 days)
-------------------------------------------------- */
function canManageDoctorShift(req, doctorId) {
  const actorUserId = String(req.user?.sub || '').trim();
  const actorRole = req.user?.role;
  if (actorRole === 'admin') return true;
  return actorRole === 'doctor' && actorUserId === String(doctorId);
}

router.post('/generate-shifts', requireAuth, async (req, res) => {
  try {
    const { doctorId, availableDays, availableHours } = req.body;

    if (!doctorId || !availableDays || !availableHours) {
      return res.status(400).json({
        message: 'doctorId, availableDays, and availableHours are required'
      });
    }

    if (!canManageDoctorShift(req, doctorId)) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    const doctor = await Doctor.findById(doctorId).lean();
    if (!doctor) {
      return res.status(404).json({ message: 'Doctor not found' });
    }

    await ensureDoctorFutureShifts({
      doctorId: doctorId,
      availableDays: availableDays,
      availableHours: availableHours
    });

    return res.status(201).json({
      message: 'Shifts for 30 days are created'
    });
  } catch (error) {
    if (error && error.code === 11000) {
      return res.status(409).json({
        message: 'Shifts already exist for this slot'
      });
    }
    console.error(error);
    return res.status(500).json({ message: 'Failed to create shifts' });
  }
});

module.exports = router;