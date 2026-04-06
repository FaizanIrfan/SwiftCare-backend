const jwt = require('jsonwebtoken');
const Shift = require('../models/shift');
const Appointment = require('../models/appointment');
const { getUserRoom } = require('../services/notification.service');

function getUserFromHandshake(socket) {
    const authToken = socket.handshake?.auth?.token;
    const bearerToken = socket.handshake?.headers?.authorization;

    let rawToken = authToken;
    if (!rawToken && bearerToken && bearerToken.startsWith('Bearer ')) {
        rawToken = bearerToken.split(' ')[1];
    }

    if (!rawToken) return null;

    try {
        const decoded = jwt.verify(rawToken, process.env.ACCESS_TOKEN_SECRET);
        const trimmedUserId = String(decoded?.sub || '').trim();
        return {
            userId: trimmedUserId || null,
            role: decoded?.role || null
        };
    } catch {
        return null;
    }
}

module.exports = function (io) {

    io.on("connection", (socket) => {

        console.log("User connected:", socket.id);
        const authUser = getUserFromHandshake(socket);

        if (authUser?.userId) {
            socket.join(getUserRoom(authUser.userId));
        }

        socket.on("joinQueueRoom", (shiftId) => {
            const roomId = String(shiftId || '').trim();
            if (!roomId) return;
            if (!authUser?.userId) return;

            Promise.all([
                Shift.findById(roomId).lean(),
                Appointment.exists({
                    shiftId: roomId,
                    $or: [{ patientId: authUser.userId }, { doctorId: authUser.userId }]
                })
            ])
                .then(([shift, hasAppointment]) => {
                    const isAdmin = authUser.role === 'admin';
                    const isDoctorOwner = shift && String(shift.doctorId) === String(authUser.userId);
                    if (!isAdmin && !isDoctorOwner && !hasAppointment) {
                        return;
                    }

                    socket.join(roomId);
                    console.log(`Socket ${socket.id} joined room ${roomId}`);
                })
                .catch(() => {});

        });

        socket.on("joinUserRoom", (userId) => {
            const requestedUserId = String(userId || '').trim();
            if (!requestedUserId) return;

            if (!authUser || !authUser.userId || authUser.userId !== requestedUserId) {
                return;
            }

            socket.join(getUserRoom(requestedUserId));
        });

        socket.on("disconnect", () => {

            console.log("User disconnected:", socket.id);

        });

    });

};
