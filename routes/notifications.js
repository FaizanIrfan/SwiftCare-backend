const express = require('express');
const Notification = require('../models/notification');
const DeviceToken = require('../models/deviceToken');
const { requireAuth } = require('../auth/auth.middleware');
const { createNotification } = require('../services/notification.service');

const router = express.Router();

function getRequestUser(req) {
  const userId = String(req.user?.sub || '').trim();
  if (!userId) {
    const error = new Error('missing userId');
    error.name = 'InvalidUserContextError';
    throw error;
  }
  return {
    userId,
    role: req.user?.role || null
  };
}

function withRequestUser(handler) {
  return async (req, res) => {
    try {
      return await handler(req, res, getRequestUser(req));
    } catch (error) {
      if (error?.name === 'InvalidUserContextError') {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      console.error(error);
      return res.status(500).json({ error: 'Internal server error' });
    }
  };
}

router.use(requireAuth);

/* --------------------------------------------------
   Get notifications for signed-in user
-------------------------------------------------- */
router.get('/', withRequestUser(async (req, res, { userId }) => {
  try {
    const page = Math.max(Number(req.query.page) || 1, 1);
    const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100);
    const unreadOnly = String(req.query.unreadOnly || '').toLowerCase() === 'true';
    const type = String(req.query.type || '').trim();

    const query = { userId };
    if (unreadOnly) query.read = false;
    if (type) query.type = type;

    const [items, total] = await Promise.all([
      Notification.find(query)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      Notification.countDocuments(query)
    ]);

    return res.json({
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 1,
      items
    });
  } catch (error) {
    return res.status(500).json({
      error: 'Failed to fetch notifications',
      details: error.message
    });
  }
}));

/* --------------------------------------------------
   Get unread count for signed-in user
-------------------------------------------------- */
router.get('/unread-count', withRequestUser(async (req, res, { userId }) => {
  try {
    const unreadCount = await Notification.countDocuments({
      userId,
      read: false
    });

    return res.json({ unreadCount });
  } catch (error) {
    return res.status(500).json({
      error: 'Failed to fetch unread count',
      details: error.message
    });
  }
}));

/* --------------------------------------------------
   Mark one notification as read
-------------------------------------------------- */
router.patch('/:id/read', withRequestUser(async (req, res, { userId }) => {
  try {
    const notification = await Notification.findOneAndUpdate(
      { _id: req.params.id, userId },
      { read: true, readAt: new Date() },
      { new: true }
    );

    if (!notification) {
      return res.status(404).json({ error: 'Notification not found' });
    }

    return res.json(notification);
  } catch (error) {
    return res.status(400).json({
      error: 'Failed to mark notification as read',
      details: error.message
    });
  }
}));

/* --------------------------------------------------
   Mark all notifications as read for signed-in user
-------------------------------------------------- */
router.patch('/read-all', withRequestUser(async (req, res, { userId }) => {
  try {
    const result = await Notification.updateMany(
      { userId, read: false },
      { $set: { read: true, readAt: new Date() } }
    );

    return res.json({
      updatedCount: result.modifiedCount
    });
  } catch (error) {
    return res.status(500).json({
      error: 'Failed to mark all notifications as read',
      details: error.message
    });
  }
}));

/* --------------------------------------------------
   Register/update notification device token
-------------------------------------------------- */
router.post('/devices', withRequestUser(async (req, res, { userId, role }) => {
  try {
    const token = String(req.body.token || '').trim();
    const platform = String(req.body.platform || '').trim().toLowerCase();

    if (!token || !platform) {
      return res.status(400).json({
        error: 'token and platform are required'
      });
    }

    const updated = await DeviceToken.findOneAndUpdate(
      { userId, token },
      {
        userId,
        role,
        token,
        platform,
        isActive: true,
        lastSeenAt: new Date()
      },
      { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true }
    );

    return res.status(201).json(updated);
  } catch (error) {
    return res.status(400).json({
      error: 'Failed to register device token',
      details: error.message
    });
  }
}));

/* --------------------------------------------------
   Deactivate notification device token
-------------------------------------------------- */
router.post('/devices/deactivate', withRequestUser(async (req, res, { userId }) => {
  try {
    const token = String(req.body.token || '').trim();

    if (!token) {
      return res.status(400).json({ error: 'token is required' });
    }

    const result = await DeviceToken.findOneAndUpdate(
      { userId, token },
      { isActive: false, lastSeenAt: new Date() },
      { new: true }
    );

    if (!result) {
      return res.status(404).json({ error: 'Device token not found' });
    }

    return res.json(result);
  } catch (error) {
    return res.status(400).json({
      error: 'Failed to deactivate device token',
      details: error.message
    });
  }
}));

/* --------------------------------------------------
   Debug endpoint to trigger one test notification
-------------------------------------------------- */
router.post('/test', withRequestUser(async (req, res, { userId, role }) => {
  try {
    const isProd = String(process.env.NODE_ENV || '').toLowerCase() === 'production';
    if (isProd && role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const rawData = req.body.data;
    const data = (rawData && typeof rawData === 'object' && !Array.isArray(rawData)) ? rawData : {};
    const allowedKeys = ['appointmentId', 'doctorId', 'patientId', 'shiftId', 'type', 'meta'];
    const sanitizedData = {};
    for (const key of allowedKeys) {
      if (Object.prototype.hasOwnProperty.call(data, key)) {
        sanitizedData[key] = data[key];
      }
    }
    if (JSON.stringify(sanitizedData).length > 2000) {
      return res.status(400).json({ error: 'data payload too large' });
    }

    const notification = await createNotification({
      userId,
      role,
      type: 'system_test',
      title: req.body.title || 'Test notification',
      body: req.body.body || 'SwiftCare notifications are working.',
      data: sanitizedData
    });

    return res.status(201).json(notification);
  } catch (error) {
    return res.status(400).json({
      error: 'Failed to send test notification',
      details: error.message
    });
  }
}));

module.exports = router;
