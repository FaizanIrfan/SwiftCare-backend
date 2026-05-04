const Notification = require('../models/notification');
const { getIo } = require('../socket/io');

function getUserRoom(userId) {
  return `user:${String(userId || '').trim()}`;
}

async function createNotification({
  userId,
  role = null,
  type = 'system',
  title,
  body,
  data = {}
}) {
  const normalizedUserId = String(userId || '').trim();
  if (!normalizedUserId) {
    throw new Error('userId is required to create notification');
  }

  const notification = await Notification.create({
    userId: normalizedUserId,
    role,
    type,
    title,
    body,
    data,
    read: false,
    readAt: null
  });

  const io = getIo();
  if (io) {
    io.to(getUserRoom(normalizedUserId)).emit('notification:new', notification);
  }

  return notification;
}

module.exports = {
  createNotification,
  getUserRoom
};
