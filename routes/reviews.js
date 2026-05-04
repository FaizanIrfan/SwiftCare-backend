const express = require('express');
const router = express.Router();
const Review = require('../models/review');
const Patient = require('../models/patient');
const Doctor = require('../models/doctor');
const { requireAuth } = require('../auth/auth.middleware');
const { createNotification } = require('../services/notification.service');
const { getAdminUserIds } = require('../services/notification.targets');

/* --------------------------------------------------
   Add review
-------------------------------------------------- */
router.post('/', requireAuth, async (req, res) => {
  try {
    const reviewData = {
      doctorId: req.body.doctorId,
      patientId: req.body.patientId,
      rating: req.body.rating,
      comment: req.body.comment
    };

    if (!reviewData.patientId) {
      return res.status(400).json({
        message: 'patientId is required'
      });
    }
    if (!reviewData.doctorId) {
      return res.status(400).json({
        message: 'doctorId is required'
      });
    }

    const patientExists = await Patient.exists({
      _id: reviewData.patientId
    });

    if (!patientExists) {
      return res.status(404).json({
        message: `Patient not found`
      });
    }

    const doctorExists = await Doctor.exists({
      _id: reviewData.doctorId
    });

    if (!doctorExists) {
      return res.status(404).json({
        message: 'Doctor not found'
      });
    }

    const newReview = new Review(reviewData);

    await newReview.save();

    const adminUserIds = getAdminUserIds();
    await Promise.allSettled(
      adminUserIds.map((adminUserId) =>
        createNotification({
          userId: adminUserId,
          role: 'admin',
          type: 'feedback_moderation',
          title: 'New Feedback Needs Moderation',
          body: `A new review has been submitted for doctor ${reviewData.doctorId}.`,
          data: {
            reviewId: String(newReview._id),
            doctorId: reviewData.doctorId,
            patientId: reviewData.patientId,
            rating: reviewData.rating
          }
        })
      )
    );

    return res.status(201).json({
      message: "Review added successfully"
    });

  } catch (error) {
    console.error(error);
    return res.status(400).json({
      message: 'Failed to add review',
      error: error.message
    });
  }
});

/* --------------------------------------------------
   Read reviews
-------------------------------------------------- */
router.get('/', async (req, res) => {
  try {
    const page = Math.max(Number.parseInt(String(req.query.page ?? '1'), 10) || 1, 1);
    const limit = Math.min(Math.max(Number.parseInt(String(req.query.limit ?? '20'), 10) || 20, 1), 100);
    if (!Number.isInteger(page) || !Number.isInteger(limit)) {
      return res.status(400).json({ error: 'Invalid page or limit' });
    }

    const [list, totalCount] = await Promise.all([
      Review.find()
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      Review.countDocuments()
    ]);

    return res.json({
      page,
      limit,
      totalCount,
      items: list.map((review) => ({
        ...review,
        comment: review.comment || review.review || ''
      }))
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Failed to fetch reviews' });
  }
});

/* --------------------------------------------------
   Delete review
-------------------------------------------------- */
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const existing = await Review.findById(req.params.id).lean();
    if (!existing) {
      return res.status(404).json({ error: 'Review not found' });
    }

    const actorUserId = String(req.user?.sub || '').trim();
    const actorRole = req.user?.role;
    const isOwner = String(existing.patientId) === actorUserId;
    if (actorRole !== 'admin' && !isOwner) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    await Review.findByIdAndDelete(req.params.id);
    return res.json({ success: true });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Failed to delete review' });
  }
});

/* --------------------------------------------------
   Admin response to review
-------------------------------------------------- */
router.patch('/:id/respond', requireAuth, async (req, res) => {
  try {
    if (req.user?.role !== 'admin') {
      return res.status(403).json({ error: 'Only admin can respond to reviews' });
    }

    const responseText = String(req.body.response || '').trim();
    if (!responseText) {
      return res.status(400).json({ error: 'response is required' });
    }

    const review = await Review.findByIdAndUpdate(
      req.params.id,
      {
        adminResponse: responseText,
        adminRespondedAt: new Date()
      },
      { new: true }
    ).lean();

    if (!review) {
      return res.status(404).json({ error: 'Review not found' });
    }

    await createNotification({
      userId: review.patientId,
      role: 'patient',
      type: 'feedback_response',
      title: 'Feedback Response Received',
      body: 'An administrator has responded to your feedback.',
      data: {
        reviewId: String(review._id),
        doctorId: review.doctorId
      }
    });

    return res.json({
      message: 'Response saved',
      review
    });
  } catch (error) {
    return res.status(400).json({
      error: 'Failed to respond to review',
      details: error.message
    });
  }
});

module.exports = router;
