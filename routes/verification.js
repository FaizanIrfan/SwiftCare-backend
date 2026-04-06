const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const Doctor = require('../models/doctor');
const { requireAuth } = require('../auth/auth.middleware');
const {
    normalizeStringArray,
    validateDoctorSchedule,
    ensureDoctorFutureShifts
} = require('../services/shiftScheduler');

// Create uploads directory if it doesn't exist
const uploadDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

// Multer config
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
        cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({
    storage: storage,
    limits: { fileSize: 1024 * 1024 }, // 1MB size limit
    fileFilter: (req, file, cb) => {
        const allowedTypes = ['image/png', 'image/jpeg', 'application/pdf'];
        if (allowedTypes.includes(String(file.mimetype || '').toLowerCase())) {
            return cb(null, true);
        }
        return cb(new Error('Invalid file type'), false);
    }
});

const adminOnly = (req, res, next) => {
    if (req.user?.role !== 'admin') {
        return res.status(403).json({ error: 'Forbidden' });
    }
    return next();
};

const safeParse = (value, fallback, field, res) => {
    if (!value) return fallback;
    try {
        return JSON.parse(value);
    } catch {
        res.status(400).json({ error: `${field} must be valid JSON` });
        return null;
    }
};

// Helper to construct normalized file url
const getFileUrl = (req, file) => {
    if (!file) return null;
    return `/uploads/${file.filename}`;
};

/* --------------------------------------------------
   List doctors for verification
-------------------------------------------------- */

router.get('/', requireAuth, async (req, res) => {
    try {
        const { registered, verificationStatus } = req.query;
        const query = {};
        if (typeof registered === 'string') {
            if (registered === 'true') query['accountStatus.registered'] = true;
            if (registered === 'false') query['accountStatus.registered'] = false;
        }
        if (verificationStatus) query['accountStatus.verificationStatus'] = verificationStatus;
        const doctors = await Doctor.find(query).sort({ createdAt: -1 }).lean();
        res.json(doctors);
    } catch (err) {
        res.status(500).json({ error: 'Server error loading doctors' });
    }
});

/* --------------------------------------------------
   Submit Verification Request
-------------------------------------------------- */

router.post('/submit', requireAuth, upload.fields([
    { name: 'profilePic', maxCount: 1 },
    { name: 'cnicFront', maxCount: 1 },
    { name: 'cnicBack', maxCount: 1 },
    { name: 'degreeCert', maxCount: 1 },
    { name: 'regCert', maxCount: 1 },
    { name: 'otherCerts', maxCount: 5 }
]), async (req, res) => {
    try {
        const { doctorId } = req.body;

        if (!doctorId) {
            return res.status(400).json({ error: 'doctorId is required' });
        }

        const actorUserId = String(req.user?.sub || '').trim();
        const actorRole = req.user?.role;
        if (actorRole !== 'admin' && actorUserId !== String(doctorId)) {
            return res.status(403).json({ error: 'Forbidden' });
        }

        const doctor = await Doctor.findById(doctorId);
        if (!doctor) return res.status(404).json({ error: 'Doctor not found' });

        // Parse JSON strings from form data
        const identification = safeParse(req.body.identification, {}, 'identification', res);
        if (!identification) return;
        const professionalInfo = safeParse(req.body.professionalInfo, {}, 'professionalInfo', res);
        if (!professionalInfo) return;
        const scheduleInfo = safeParse(req.body.schedule, {}, 'schedule', res);
        if (!scheduleInfo) return;

        // Get file URLs
        const files = req.files || {};
        const profilePic = files['profilePic'] ? getFileUrl(req, files['profilePic'][0]) : null;
        const cnicFront = files['cnicFront'] ? getFileUrl(req, files['cnicFront'][0]) : null;
        const cnicBack = files['cnicBack'] ? getFileUrl(req, files['cnicBack'][0]) : null;
        const degreeCert = files['degreeCert'] ? getFileUrl(req, files['degreeCert'][0]) : null;
        const regCert = files['regCert'] ? getFileUrl(req, files['regCert'][0]) : null;
        const otherCerts = files['otherCerts'] ? files['otherCerts'].map(f => getFileUrl(req, f)) : [];

        // Update the doctor document
        doctor.image = profilePic || doctor.image;
        doctor.identification = {
            ...(doctor.identification || {}),
            ...identification
        };
        if (cnicFront != null) doctor.identification.cnicFront = cnicFront;
        if (cnicBack != null) doctor.identification.cnicBack = cnicBack;
        doctor.professionalInfo = {
            ...doctor.professionalInfo,
            degree: professionalInfo.degree || doctor.professionalInfo?.degree,
            registrationNumber: professionalInfo.registrationNumber || doctor.professionalInfo?.registrationNumber
        };
        doctor.verificationDocuments = {
            ...(doctor.verificationDocuments || {}),
            ...(degreeCert ? { degreeCert } : {}),
            ...(regCert ? { regCert } : {}),
            ...(otherCerts.length > 0 ? { otherCerts } : {})
        };

        if (scheduleInfo && Array.isArray(scheduleInfo.availableDays)) {
            doctor.schedule = doctor.schedule || {};
            doctor.schedule.availableDays = normalizeStringArray(scheduleInfo.availableDays);
        }
        if (scheduleInfo && Object.prototype.hasOwnProperty.call(scheduleInfo, 'availableHours')) {
            doctor.schedule = doctor.schedule || {};
            doctor.schedule.availableHours = normalizeStringArray(scheduleInfo.availableHours);
        }

        const scheduleValidation = validateDoctorSchedule(
            doctor.schedule?.availableDays,
            doctor.schedule?.availableHours
        );
        if (!scheduleValidation.ok) {
            return res.status(400).json({ error: scheduleValidation.message });
        }

        doctor.accountStatus = doctor.accountStatus || {};
        doctor.accountStatus.verificationStatus = 'submitted';
        doctor.accountStatus.registered = true;

        await doctor.save();

        const scheduleSync = await ensureDoctorFutureShifts({
            doctorId: doctor._id.toString(),
            availableDays: doctor.schedule?.availableDays,
            availableHours: doctor.schedule?.availableHours
        });

        res.json({ message: 'Verification submitted successfully', doctor, scheduleSync });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error during verification submission' });
    }
});

/* --------------------------------------------------
   Update verification status (flex endpoint)
-------------------------------------------------- */

router.put('/:id', requireAuth, adminOnly, async (req, res) => {
    try {
        const { status, registered } = req.body;
        const update = {};
        if (typeof status === 'string') {
            update['accountStatus.verificationStatus'] = status;
            if (status === 'approved') {
                update['accountStatus.registered'] = true;
            }
        }
        if (typeof registered === 'boolean') {
            if (status === 'approved' && registered === false) {
                return res.status(400).json({ error: 'approved status requires registered=true' });
            }
            update['accountStatus.registered'] = registered;
        }

        if (!Object.keys(update).length) {
            return res.status(400).json({ error: 'No updates provided' });
        }

        const updated = await Doctor.findByIdAndUpdate(
            req.params.id,
            update,
            { new: true }
        );

        if (!updated) return res.status(404).json({ error: 'Doctor not found' });
        res.json(updated);
    } catch (err) {
        console.error(err);
        res.status(400).json({ error: 'Failed to update verification status' });
    }
});

/* --------------------------------------------------
   Admin Actions: Approve / Reject
-------------------------------------------------- */

// (Usually these would be protected by an admin middleware)
router.put('/:id/approve', requireAuth, adminOnly, async (req, res) => {
    try {
        const doctor = await Doctor.findById(req.params.id);
        if (!doctor) return res.status(404).json({ error: 'Doctor not found' });

        doctor.accountStatus = doctor.accountStatus || {};
        doctor.accountStatus.verificationStatus = 'approved';
        doctor.accountStatus.registered = true;
        await doctor.save();

        res.json({ message: 'Doctor approved successfully', doctor });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error approving doctor' });
    }
});

router.put('/:id/reject', requireAuth, adminOnly, async (req, res) => {
    try {
        const doctor = await Doctor.findById(req.params.id);
        if (!doctor) return res.status(404).json({ error: 'Doctor not found' });

        doctor.accountStatus = doctor.accountStatus || {};
        doctor.accountStatus.verificationStatus = 'rejected';
        await doctor.save();

        res.json({ message: 'Doctor rejected successfully', doctor });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error rejecting doctor' });
    }
});

/* --------------------------------------------------
   Multer error handler
-------------------------------------------------- */

router.use((err, req, res, next) => {
    if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({ error: 'File too large (max 1MB)' });
        }
        return res.status(400).json({ error: err.message });
    }
    if (err && err.message === 'Invalid file type') {
        return res.status(400).json({ error: err.message });
    }
    return next(err);
});

module.exports = router;
