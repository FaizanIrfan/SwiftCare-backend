const express = require('express');
const mongoose = require('mongoose');
const multer = require('multer');
const router = express.Router();

const Patient = require('../models/patient');
const Doctor = require('../models/doctor');
const { requireAuth } = require('../auth/auth.middleware');
const { uploadImageBuffer } = require('../services/cloudinary');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024
  },
  fileFilter: (req, file, cb) => {
    if (String(file.mimetype || '').startsWith('image/')) {
      return cb(null, true);
    }
    return cb(new Error('Only image files are allowed'), false);
  }
});

router.use(requireAuth);

router.post('/profile', async (req, res) => {
  try {
    const userId = String(req.user?.sub || '').trim();
    const role = req.user?.role;

    if (!userId || !role) {
      return res.status(400).json({
        error: 'userId and role are required'
      });
    }

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ error: 'Invalid user id' });
    }

    let user;
    if (role === 'patient') {
      user = await Patient.findById(userId);
    } else if (role === 'doctor') {
      user = await Doctor.findById(userId);
    } else {
      return res.status(400).json({
        error: 'Invalid role'
      });
    }

    if (!user) {
      return res.status(404).json({
        error: 'User not found'
      });
    }

    return res.json(user);
  } catch (err) {
    console.error(err);
    return res.status(500).json({
      error: 'Server error'
    });
  }
});

router.post('/toggle-favorite', async (req, res) => {
  try {
    const { patientId, doctorId } = req.body;
    const actorUserId = String(req.user?.sub || '').trim();

    if (!patientId || !doctorId) {
      return res.status(400).json({
        message: 'patientId and doctorId are required'
      });
    }

    if (
      !mongoose.Types.ObjectId.isValid(patientId) ||
      !mongoose.Types.ObjectId.isValid(doctorId)
    ) {
      return res.status(400).json({
        message: 'Invalid patientId or doctorId'
      });
    }

    if (actorUserId !== String(patientId)) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    const doctorObjectId = new mongoose.Types.ObjectId(doctorId);
    const doctorExists = await Doctor.exists({ _id: doctorObjectId });
    if (!doctorExists) {
      return res.status(404).json({ message: 'Doctor not found' });
    }

    const updatedPatient = await Patient.findOneAndUpdate(
      { _id: patientId },
      [
        {
          $set: {
            favorites: {
              $cond: [
                { $in: [doctorObjectId, '$favorites'] },
                {
                  $filter: {
                    input: '$favorites',
                    cond: { $ne: ['$$this', doctorObjectId] }
                  }
                },
                { $concatArrays: ['$favorites', [doctorObjectId]] }
              ]
            }
          }
        }
      ],
      { returnDocument: 'after' }
    );

    if (!updatedPatient) {
      return res.status(404).json({ message: 'Patient not found' });
    }

    const action = updatedPatient.favorites.some((fav) => String(fav) === String(doctorObjectId))
      ? 'added'
      : 'removed';

    return res.status(200).json({
      message: `Doctor ${doctorId} ${action} in patient ${patientId}'s favorites`
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      message: 'Internal server error'
    });
  }
});

router.post('/upload-image', upload.single('image'), async (req, res) => {
  try {
    const userId = String(req.user?.sub || '').trim();
    const role = req.user?.role;

    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'image file is required' });
    }

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ error: 'Invalid userId' });
    }

    const userModel = role === 'doctor' ? Doctor : Patient;
    const user = await userModel.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const uploadResult = await uploadImageBuffer(req.file.buffer, {
      folder: 'swiftcare/profile',
      resource_type: 'image'
    });

    user.image = uploadResult.secure_url;
    await user.save();

    return res.status(200).json({
      message: 'Image uploaded successfully',
      imageUrl: uploadResult.secure_url
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.use((error, req, res, next) => {
  if (error && error.message === 'Only image files are allowed') {
    return res.status(400).json({ error: error.message });
  }
  return next(error);
});

module.exports = router;
