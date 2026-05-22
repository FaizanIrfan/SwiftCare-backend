const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const Facility = require('../models/facility');
const Doctor = require('../models/doctor');
const { requireAuth, requireRole } = require('../auth/auth.middleware');

/**
 * Helper function to validate and synchronize location coordinates
 */
function processLocation(location, res) {
  if (!location) return null;

  const processed = { ...location };

  // Validate patient-style coordinates if provided
  if (processed.coordinates) {
    if (!Array.isArray(processed.coordinates) || processed.coordinates.length !== 2) {
      return { error: 'location.coordinates must be [longitude, latitude]' };
    }
    const [lng, lat] = processed.coordinates;
    if (typeof lng !== 'number' || typeof lat !== 'number') {
      return { error: 'location.coordinates must contain valid numbers' };
    }
  }

  // Validate doctor-style nested geo coordinates if provided
  if (processed.geo && processed.geo.coordinates) {
    if (!Array.isArray(processed.geo.coordinates) || processed.geo.coordinates.length !== 2) {
      return { error: 'location.geo.coordinates must be [longitude, latitude]' };
    }
    const [lng, lat] = processed.geo.coordinates;
    if (typeof lng !== 'number' || typeof lat !== 'number') {
      return { error: 'location.geo.coordinates must contain valid numbers' };
    }
  }

  // Auto-synchronize both coordinates styles for maximum compatibility
  if (processed.coordinates && (!processed.geo || !processed.geo.coordinates)) {
    processed.geo = {
      type: "Point",
      coordinates: processed.coordinates
    };
  } else if ((processed.geo && processed.geo.coordinates) && !processed.coordinates) {
    processed.coordinates = processed.geo.coordinates;
  }

  // Ensure type properties are set correctly to "Point"
  processed.type = "Point";
  if (processed.geo) {
    processed.geo.type = "Point";
  }

  return { data: processed };
}

/**
 * Helper function to validate doctorList IDs and existence
 */
async function validateDoctorList(doctorList, res) {
  if (!doctorList) return { data: [] };

  if (!Array.isArray(doctorList)) {
    return { error: 'doctorList must be an array of doctor IDs' };
  }

  const cleanIds = [];
  for (const docId of doctorList) {
    if (!docId) continue;
    
    const trimmedId = String(docId).trim();
    if (!mongoose.Types.ObjectId.isValid(trimmedId)) {
      return { error: `Invalid doctor ID format: ${trimmedId}` };
    }

    const doctorExists = await Doctor.exists({ _id: trimmedId });
    if (!doctorExists) {
      return { error: `Doctor not found: ${trimmedId}` };
    }

    cleanIds.push(trimmedId);
  }

  return { data: cleanIds };
}

/* =========================================================================
   1. Create Facility
   POST /
   ========================================================================= */
router.post('/', async (req, res) => {
  try {
    const { name, about, location, doctorList } = req.body;

    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ error: 'name is required and must be a non-empty string' });
    }

    // Process and validate location
    let processedLocation = undefined;
    if (location) {
      const locResult = processLocation(location);
      if (locResult.error) {
        return res.status(400).json({ error: locResult.error });
      }
      processedLocation = locResult.data;
    }

    // Process and validate doctor list references
    let processedDoctors = [];
    if (doctorList) {
      const docResult = await validateDoctorList(doctorList);
      if (docResult.error) {
        return res.status(400).json({ error: docResult.error });
      }
      processedDoctors = docResult.data;
    }

    const newFacility = new Facility({
      name: name.trim(),
      about: about ? String(about).trim() : '',
      location: processedLocation,
      doctorList: processedDoctors
    });

    await newFacility.save();

    // Update doctors' locations upon association with the facility
    if (processedLocation && processedDoctors.length > 0) {
      await Doctor.updateMany(
        { _id: { $in: processedDoctors } },
        {
          $set: {
            'location.geo': processedLocation.geo,
            'location.label': name.trim(),
            'location.clinicName': name.trim()
          }
        }
      );
    }

    return res.status(201).json({
      message: 'Facility created successfully',
      facility: newFacility
    });

  } catch (error) {
    console.error('Error creating facility:', error);
    return res.status(500).json({ error: 'Failed to create facility', details: error.message });
  }
});

/* =========================================================================
   2. Read Facilities (List with optional pagination)
   GET /
   ========================================================================= */
router.get('/', async (req, res) => {
  try {
    const page = Math.max(Number.parseInt(String(req.query.page ?? '1'), 10) || 1, 1);
    const limit = Math.min(Math.max(Number.parseInt(String(req.query.limit ?? '20'), 10) || 20, 1), 100);

    const [list, totalCount] = await Promise.all([
      Facility.find()
        .populate('doctorList')
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      Facility.countDocuments()
    ]);

    return res.json({
      page,
      limit,
      totalCount,
      items: list
    });

  } catch (error) {
    console.error('Error fetching facilities:', error);
    return res.status(500).json({ error: 'Failed to fetch facilities', details: error.message });
  }
});

/* =========================================================================
   2b. Read Single Facility
   GET /:id
   ========================================================================= */
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: 'Invalid facility ID format' });
    }

    const facility = await Facility.findById(id).populate('doctorList').lean();
    if (!facility) {
      return res.status(404).json({ error: 'Facility not found' });
    }

    return res.json(facility);

  } catch (error) {
    console.error('Error fetching facility by ID:', error);
    return res.status(500).json({ error: 'Failed to fetch facility', details: error.message });
  }
});

// Keep write operations restricted to admins.
router.use(requireAuth);
router.use(requireRole('admin'));

/* =========================================================================
   3. Update Facility
   PUT /:id
   ========================================================================= */
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, about, location, doctorList } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: 'Invalid facility ID format' });
    }

    const currentFacility = await Facility.findById(id);
    if (!currentFacility) {
      return res.status(404).json({ error: 'Facility not found' });
    }

    const updatePayload = {};

    if (name !== undefined) {
      if (typeof name !== 'string' || !name.trim()) {
        return res.status(400).json({ error: 'name must be a non-empty string' });
      }
      updatePayload.name = name.trim();
    }

    if (about !== undefined) {
      updatePayload.about = about ? String(about).trim() : '';
    }

    if (location !== undefined) {
      if (location === null) {
        updatePayload.location = undefined;
      } else {
        const locResult = processLocation(location);
        if (locResult.error) {
          return res.status(400).json({ error: locResult.error });
        }
        updatePayload.location = locResult.data;
      }
    }

    if (doctorList !== undefined) {
      if (doctorList === null) {
        updatePayload.doctorList = [];
      } else {
        const docResult = await validateDoctorList(doctorList);
        if (docResult.error) {
          return res.status(400).json({ error: docResult.error });
        }
        updatePayload.doctorList = docResult.data;
      }
    }

    const updatedFacility = await Facility.findByIdAndUpdate(
      id,
      { $set: updatePayload },
      { new: true }
    ).populate('doctorList');

    // Sync location to all doctors in the facility
    if (updatedFacility && updatedFacility.doctorList && updatedFacility.doctorList.length > 0 && updatedFacility.location) {
      const docIds = updatedFacility.doctorList.map(doc => doc._id);
      await Doctor.updateMany(
        { _id: { $in: docIds } },
        {
          $set: {
            'location.geo': updatedFacility.location.geo,
            'location.label': updatedFacility.name,
            'location.clinicName': updatedFacility.name
          }
        }
      );
    }

    return res.json({
      message: 'Facility updated successfully',
      facility: updatedFacility
    });

  } catch (error) {
    console.error('Error updating facility:', error);
    return res.status(500).json({ error: 'Failed to update facility', details: error.message });
  }
});

/* =========================================================================
   4. Delete Facility
   DELETE /:id
   ========================================================================= */
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: 'Invalid facility ID format' });
    }

    const deleted = await Facility.findByIdAndDelete(id);
    if (!deleted) {
      return res.status(404).json({ error: 'Facility not found' });
    }

    return res.json({
      success: true,
      message: 'Facility deleted successfully'
    });

  } catch (error) {
    console.error('Error deleting facility:', error);
    return res.status(500).json({ error: 'Failed to delete facility', details: error.message });
  }
});

module.exports = router;