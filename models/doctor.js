const bcrypt = require('bcrypt');
const mongoose = require('mongoose');

const doctorSchema = new mongoose.Schema(
  {
    // Basic profile
    name: {
      type: String,
      required: true,
      trim: true
    },

    image: {
      type: String
    },

    specialization: {
      type: String,
      required: true
    },

    contactNo: {
      type: String
    },

    experience: {
      type: String   // "8+" → keep as String
    },

    about: {
      type: String
    },

    consultationFee: {
      type: Number
    },

    patients: {
      type: String   // "1200+" → String
    },

    location: {
      clinicName: {
        type: String
      },
      label: {
        type: String
      },
      geo: {
        type: {
          type: String,
          default: "Point"
        },
        coordinates: {
          type: [Number], // [longitude, latitude]
        }
      }
    },

    // Schedule
    schedule: {
      availableDays: {
        type: [String],
        default: []
      },

      availableHours: {
        type: [String],
        default: []
      }
    },

    // Qualification / docs
    qualification: {
      education: {
        type: [String],
        default: []
      },

      documents: {
        type: [String],
        default: []
      }
    },

    // Credentials
    credentials: {
      email: {
        type: String,
        required: true,
        lowercase: true
      },
      password: {
        type: String,
        required: true
      },
      emailVerified: {
        type: Boolean,
        default: false
      },
      provider: {
        type: String,
      }
    },

    // Account / verification status
    accountStatus: {
      registered: {
        type: Boolean,
        default: false
      },

      verificationStatus: {
        type: String,
        enum: ['pending', 'submitted', 'approved', 'rejected'],
        default: 'pending'
      }
    },

    // Verification submission details
    identification: {
      idNumber: String,
      cnicFront: String,
      cnicBack: String
    },

    professionalInfo: {
      degree: String,
      registrationNumber: String
    },

    verificationDocuments: {
      degreeCert: String,
      regCert: String,
      otherCerts: [String]
    },
  },
  { timestamps: true }
);

doctorSchema.pre('save', async function (next) {
  if (!this.isModified('credentials.password')) return next();
  const password = String(this.credentials.password || '');
  const isValidBcryptHash =
    password.length === 60 && /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/.test(password);
  if (isValidBcryptHash) {
    return next();
  }
  this.credentials.password = await bcrypt.hash(this.credentials.password, 12);
  next();
});

doctorSchema.index({ 'location.geo': "2dsphere" }); // Enable geospatial queries
doctorSchema.index({ 'credentials.email': 1 }, { unique: true });

module.exports = mongoose.model('Doctor', doctorSchema, 'doctors');
