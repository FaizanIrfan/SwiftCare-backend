const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const Shift = require('../models/shift');
const Doctor = require('../models/doctor');
const { requireAuth } = require('../auth/auth.middleware');

function canManageDoctorShift(req, doctorId) {
  const actorUserId = String(req.user?.sub || '').trim();
  const actorRole = req.user?.role;
  if (actorRole === 'admin') return true;
  return actorRole === 'doctor' && actorUserId === String(doctorId);
}

router.use(requireAuth);

/* --------------------------------------------------
   Get all shifts for a doctor
-------------------------------------------------- */
router.get('/doctor/:doctorId', async (req, res) => {
  try {
    const { doctorId } = req.params;

    if (!doctorId) {
      return res.status(400).json({ message: 'doctorId is required' });
    }

    if (!canManageDoctorShift(req, doctorId)) {
      return res.status(403).json({ message: 'Forbidden' });
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
   Create a shift (scheduled)
-------------------------------------------------- */
router.post('/', async (req, res) => {
  try {
    const { doctorId, date, startTime, endTime } = req.body;

    if (!doctorId || !date || !startTime || !endTime) {
      return res.status(400).json({
        message: 'doctorId, date, startTime, and endTime are required'
      });
    }

    if (!canManageDoctorShift(req, doctorId)) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    const shift = await Shift.create({
      doctorId,
      date,
      startTime,
      endTime,
      status: 'scheduled'
    });

    return res.status(201).json({
      message: 'Shift created',
      shift
    });
  } catch (error) {
    if (error && error.code === 11000) {
      return res.status(409).json({
        message: 'Shift already exists for this slot'
      });
    }
    console.error(error);
    return res.status(500).json({ message: 'Failed to create shift' });
  }
});

/* --------------------------------------------------
   Get active shift for a doctor
-------------------------------------------------- */
router.get('/active', async (req, res) => {
  try {
    const { doctorId } = req.query;

    if (!doctorId) {
      return res.status(400).json({ message: 'doctorId is required' });
    }
    if (!canManageDoctorShift(req, doctorId)) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    const shift = await Shift.findOne({ doctorId, status: 'active' }).lean();

    if (!shift) {
      return res.status(404).json({ message: 'No active shift found' });
    }

    return res.json(shift);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Failed to fetch active shift' });
  }
});

/* --------------------------------------------------
   Get upcoming shifts (optional date filter)
-------------------------------------------------- */
router.get('/upcoming', async (req, res) => {
  try {
    const { doctorId, date } = req.query;

    if (!doctorId) {
      return res.status(400).json({ message: 'doctorId is required' });
    }
    const actorRole = req.user?.role;
    const actorUserId = String(req.user?.sub || '').trim();
    const isDoctorOwner = actorRole === 'doctor' && actorUserId === String(doctorId);
    const canView = actorRole === 'admin' || actorRole === 'patient' || isDoctorOwner;

    if (!canView) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    const query = { doctorId, status: 'scheduled' };
    if (date) query.date = date;

    const shifts = await Shift.find(query)
      .sort({ date: 1, startTime: 1 })
      .lean();

    return res.json(shifts);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Failed to fetch upcoming shifts' });
  }
});

/* --------------------------------------------------
   Generate next 30 days of shifts from schedule
-------------------------------------------------- */
router.post('/generate-next', async (req, res) => {
  try {
    const actorUserId = String(req.user?.sub || '').trim();
    const actorRole = req.user?.role;
    const requestedDoctorId = String(req.body?.doctorId || actorUserId).trim();
    const days = Number.parseInt(String(req.body?.days || 30), 10);

    if (!Number.isInteger(days) || days < 1 || days > 60) {
      return res.status(400).json({ message: 'days must be between 1 and 60' });
    }

    if (!canManageDoctorShift(req, requestedDoctorId)) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    const doctor = await Doctor.findById(requestedDoctorId).lean();
    if (!doctor) {
      return res.status(404).json({ message: 'Doctor not found' });
    }

    const schedule = doctor.schedule || {};
    const availableDays = Array.isArray(schedule.availableDays) ? schedule.availableDays : [];
    const availableHours = Array.isArray(schedule.availableHours) ? schedule.availableHours : [];

    if (availableDays.length === 0 || availableHours.length === 0) {
      return res.status(400).json({ message: 'Doctor schedule is not set' });
    }

    const lastShift = await Shift.findOne({ doctorId: requestedDoctorId })
      .sort({ date: -1 })
      .lean();

    const startFrom = lastShift?.date ? new Date(lastShift.date) : new Date();
    if (Number.isNaN(startFrom.getTime())) {
      return res.status(400).json({ message: 'Invalid last shift date' });
    }

    startFrom.setHours(0, 0, 0, 0);
    startFrom.setDate(startFrom.getDate() + 1);

    const dayNameSet = new Set(availableDays.map((d) => String(d).trim().toLowerCase()));
    const shiftDocs = [];

    for (let i = 0; i < days; i++) {
      const date = new Date(startFrom);
      date.setDate(startFrom.getDate() + i);
      const dayName = date.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();

      if (!dayNameSet.has(dayName)) continue;

      for (const hourRange of availableHours) {
        const [startTime, endTime] = String(hourRange).split('-').map((t) => t.trim());
        if (!startTime || !endTime) continue;

        shiftDocs.push({
          doctorId: requestedDoctorId,
          date: date.toISOString(),
          startTime,
          endTime,
          status: 'scheduled'
        });
      }
    }

    if (shiftDocs.length === 0) {
      return res.json({
        message: 'No shifts to generate for the selected range',
        createdCount: 0,
        totalCandidates: 0
      });
    }

    let createdCount = 0;
    try {
      const created = await Shift.insertMany(shiftDocs, { ordered: false });
      createdCount = created.length;
    } catch (error) {
      if (error?.writeErrors) {
        createdCount = error?.result?.result?.nInserted || error?.insertedDocs?.length || 0;
      } else {
        console.error(error);
        return res.status(500).json({ message: 'Failed to generate shifts' });
      }
    }

    return res.json({
      message: 'Shift generation completed',
      createdCount,
      totalCandidates: shiftDocs.length,
      daysGenerated: days,
      doctorId: requestedDoctorId,
      actorRole
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Failed to generate shifts' });
  }
});

/* --------------------------------------------------
   Start shift
-------------------------------------------------- */
router.post('/start', async (req, res) => {
  try {
    const { shiftId } = req.body;

    if (!shiftId) {
      return res.status(400).json({ message: 'shiftId is required' });
    }
    if (!mongoose.Types.ObjectId.isValid(String(shiftId))) {
      return res.status(400).json({ message: 'Invalid shiftId' });
    }

    const shift = await Shift.findById(shiftId).lean();
    if (!shift) {
      return res.status(404).json({ message: 'Shift not found' });
    }
    if (!canManageDoctorShift(req, shift.doctorId)) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    if (shift.status === 'ended') {
      return res.status(409).json({ message: 'Shift has already ended' });
    }

    const activated = await Shift.findOneAndUpdate(
      { _id: shiftId, status: 'scheduled' },
      { $set: { status: 'active' } },
      { new: true }
    );

    if (!activated) {
      return res.status(409).json({ message: 'Another shift is already active or shift cannot be started' });
    }

    return res.json({
      message: 'Shift started',
      shift: activated
    });
  } catch (error) {
    if (error && error.code === 11000) {
      return res.status(409).json({ message: 'Another shift is already active for this doctor' });
    }
    console.error(error);
    return res.status(500).json({ message: 'Failed to start shift' });
  }
});

/* --------------------------------------------------
   End shift
-------------------------------------------------- */
router.post('/end', async (req, res) => {
  try {
    const { shiftId } = req.body;

    if (!shiftId) {
      return res.status(400).json({ message: 'shiftId is required' });
    }
    if (!mongoose.Types.ObjectId.isValid(String(shiftId))) {
      return res.status(404).json({ message: 'Shift not found' });
    }

    const shiftBefore = await Shift.findById(shiftId).lean();
    if (!shiftBefore) {
      return res.status(404).json({ message: 'Shift not found' });
    }
    if (!canManageDoctorShift(req, shiftBefore.doctorId)) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    const shift = await Shift.findOneAndUpdate(
      { _id: shiftId, status: 'active' },
      { status: 'ended' },
      { new: true }
    );

    if (!shift) {
      return res.status(400).json({ message: `Shift ${shiftId} cannot be ended from status ${shiftBefore.status}` });
    }

    return res.json({
      message: 'Shift ended',
      shift
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Failed to end shift' });
  }
});

module.exports = router;
