const express = require('express');
const router = express.Router();
const QueueState = require('../models/queueState');
const Appointment = require('../models/appointment');
const Shift = require('../models/shift');
const Notification = require('../models/notification');
const { requireAuth, requireRole } = require('../auth/auth.middleware');
const { getIo } = require('../socket/io');
const { createNotification } = require('../services/notification.service');
const CANCELLED_STATUS = 'cancelled';
const TURN_APPROACH_THRESHOLD = 2;

router.use(requireAuth);

async function queueNotificationExists({ userId, shiftId, type, currentServing, nextQueueNumber, appointmentId }) {
    const query = { userId: String(userId), type };
    if (appointmentId) query['data.appointmentId'] = String(appointmentId);
    if (shiftId) query['data.shiftId'] = String(shiftId);
    if (typeof currentServing === 'number') query['data.currentServing'] = currentServing;
    if (typeof nextQueueNumber === 'number') query['data.nextQueueNumber'] = nextQueueNumber;
    const found = await Notification.exists(query);
    return Boolean(found);
}

async function notifyQueueProgress(shiftId, currentServing) {
    const activeQueue = await Appointment.find({
        shiftId,
        queueNumber: { $gt: currentServing },
        status: { $ne: CANCELLED_STATUS }
    })
        .sort({ queueNumber: 1 })
        .select({ _id: 1, patientId: 1, doctorId: 1, queueNumber: 1, date: 1, time: 1 })
        .lean();

    if (activeQueue.length === 0) return;

    const nextUp = activeQueue[0];
    const nearTurns = activeQueue.filter((apt) => apt.queueNumber <= currentServing + TURN_APPROACH_THRESHOLD + 1);

    const jobs = nearTurns.map((apt) => {
        const turnsAway = apt.queueNumber - currentServing;
        const notificationType = turnsAway <= 1 ? 'queue_turn_now' : 'queue_turn_approaching';
        const title = turnsAway <= 1 ? 'It is your turn' : 'Your turn is approaching';
        const body = turnsAway <= 1
            ? `Please proceed now. Queue number ${apt.queueNumber} is being served.`
            : `Queue number ${apt.queueNumber} is coming up soon.`;

        return queueNotificationExists({
            userId: apt.patientId,
            appointmentId: apt._id,
            type: notificationType
        }).then((exists) => {
            if (exists) return null;
            return createNotification({
                userId: apt.patientId,
                role: 'patient',
                type: notificationType,
                title,
                body,
                data: {
                    appointmentId: String(apt._id),
                    shiftId: String(shiftId),
                    queueNumber: apt.queueNumber,
                    currentServing,
                    turnsAway,
                    date: apt.date,
                    time: apt.time
                }
            });
        });
    });

    const doctorQueueProgressExists = await queueNotificationExists({
        userId: nextUp.doctorId,
        shiftId,
        type: 'queue_progress',
        currentServing,
        nextQueueNumber: nextUp.queueNumber
    });
    if (!doctorQueueProgressExists) {
        jobs.push(
            createNotification({
                userId: nextUp.doctorId,
                role: 'doctor',
                type: 'queue_progress',
                title: 'Queue Updated',
                body: `Current serving is #${currentServing}. Next patient is #${nextUp.queueNumber}.`,
                data: {
                    shiftId: String(shiftId),
                    currentServing,
                    nextQueueNumber: nextUp.queueNumber,
                    nextAppointmentId: String(nextUp._id)
                }
            })
        );
    }

    await Promise.allSettled(jobs);
}

/* --------------------------------------------------
   Start shift (get first/next patient without advancing)
-------------------------------------------------- */
router.post('/start-shift', requireRole('doctor'), async (req, res) => {
    try {
        const { shiftId } = req.body;

        if (!shiftId) {
            return res.status(400).json({ message: "shiftId is required" });
        }

        const shift = await Shift.findById(shiftId).lean();
        if (!shift) {
            return res.status(404).json({ message: "Shift not found" });
        }

        if (shift.status !== 'active') {
            return res.status(409).json({ message: "Shift is not active" });
        }

        const queue = await QueueState.findOneAndUpdate(
            { shiftId },
            { $setOnInsert: { currentServing: 0, lastQueueNumber: 0 } },
            { new: true, upsert: true }
        );

        const nextAppointment = await Appointment.findOne({
            shiftId,
            queueNumber: { $gt: queue.currentServing },
            status: { $ne: CANCELLED_STATUS }
        })
            .sort({ queueNumber: 1 })
            .lean();

        return res.json({
            message: "Shift started",
            queueState: queue,
            nextNumber: nextAppointment ? nextAppointment.queueNumber : null,
            nextAppointment
        });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: "Failed to start shift", error: error.message });
    }
});

/* --------------------------------------------------
   Doctor moves to next patient
-------------------------------------------------- */
router.post('/next', requireRole('doctor'), async (req, res) => {
    try {
        const { shiftId } = req.body;

        if (!shiftId) {
            return res.status(400).json({ message: "shiftId is required" });
        }

        const shift = await Shift.findById(shiftId).lean();
        if (!shift) {
            return res.status(404).json({ message: "Shift not found" });
        }

        if (shift.status !== 'active') {
            return res.status(409).json({ message: "Shift is not active" });
        }

        const queue = await QueueState.findOneAndUpdate(
            { shiftId },
            { $setOnInsert: { currentServing: 0, lastQueueNumber: 0 } },
            { new: true, upsert: true }
        );

        const maxRetries = 5;
        let currentServing = queue.currentServing;
        let nextAppointment = null;
        let updatedQueue = null;

        for (let attempt = 0; attempt < maxRetries; attempt += 1) {
            nextAppointment = await Appointment.findOne({
                shiftId,
                queueNumber: { $gt: currentServing },
                status: { $ne: CANCELLED_STATUS }
            })
                .sort({ queueNumber: 1 })
                .lean();

            if (!nextAppointment) {
                return res.status(409).json({
                    message: "No more patients in queue",
                    currentServing
                });
            }

            updatedQueue = await QueueState.findOneAndUpdate(
                { shiftId, currentServing },
                { $set: { currentServing: nextAppointment.queueNumber } },
                { new: true }
            );

            if (updatedQueue) break;
            const refreshed = await QueueState.findOne({ shiftId }).lean();
            currentServing = refreshed?.currentServing ?? currentServing;
        }

        if (!updatedQueue || !nextAppointment) {
            return res.status(409).json({ message: 'Queue was updated by another request, please retry' });
        }

        // Broadcast the update to all patients in this shift
        try {
            const io = getIo();
            io.to(shiftId.toString()).emit('queueUpdated', {
                shiftId: shiftId,
                currentServing: updatedQueue.currentServing
            });
        } catch (socketError) {
            console.error('Failed to emit queueUpdated event:', socketError.message);
        }

        await notifyQueueProgress(shiftId, updatedQueue.currentServing);

        return res.json({
            message: "Queue updated",
            currentServing: updatedQueue.currentServing,
            currentAppointment: nextAppointment
        });

    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: "Failed to update queue", error: error.message });
    }
});

/* --------------------------------------------------
   End shift (persist state and return it)
-------------------------------------------------- */
router.post('/end-shift', requireRole('doctor'), async (req, res) => {
    try {
        const { shiftId } = req.body;

        if (!shiftId) {
            return res.status(400).json({ message: "shiftId is required" });
        }

        const shift = await Shift.findById(shiftId).lean();
        if (!shift) {
            return res.status(404).json({ message: "Shift not found" });
        }

        const queue = await QueueState.findOne({ shiftId });

        if (!queue) {
            return res.status(404).json({ message: "Queue state not found for shift" });
        }

        return res.json({
            message: "Shift ended",
            queueState: queue
        });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: "Failed to end shift", error: error.message });
    }
});

/* --------------------------------------------------
   List queue patients (ordered by turn)
-------------------------------------------------- */
router.post('/patients', async (req, res) => {
    try {
        const { shiftId } = req.body;

        if (!shiftId) {
            return res.status(400).json({ message: "shiftId is required" });
        }

        const shift = await Shift.findById(shiftId).lean();
        if (!shift) {
            return res.status(404).json({ message: "Shift not found" });
        }

        const queue = await QueueState.findOne({ shiftId }).lean();
        const currentServing = queue ? queue.currentServing : 0;

        const list = await Appointment.find({
            shiftId,
            status: { $ne: CANCELLED_STATUS }
        })
            .sort({ queueNumber: 1 })
            .lean();

        const patients = list.map((apt) => ({
            ...apt,
            isServed: apt.queueNumber <= currentServing
        }));

        return res.json({
            message: "Queue patients",
            currentServing,
            patients
        });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: "Failed to fetch queue patients", error: error.message });
    }
});

module.exports = router;
