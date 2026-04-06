const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

const patientSchema = new mongoose.Schema(
  {
    name: {
      type: String,
    },

    location: {
      label: {
        type: String
      },
      type: {
        type: String,
        default: "Point"
      },
      coordinates: {
        type: [Number], // [longitude, latitude]
      }
    },

    phone: {
      type: String
    },

    age: {
      type: String
    },

    gender: {
      type: String
    },

    image: {
      type: String
    },
    avatar: {
      type: String
    },

    favorites: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Doctor'
      }
    ],

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
        required: true
      }
    }
  },
  { timestamps: true }
);

patientSchema.pre('save', async function (next) {
  const imageModified = this.isModified('image');
  const avatarModified = this.isModified('avatar');

  // Mirror only when exactly one legacy/new field changed and the change is not an explicit clear.
  if (imageModified && !avatarModified) {
    if (this.image !== null && this.image !== '') {
      this.avatar = this.image;
    }
  } else if (avatarModified && !imageModified) {
    if (this.avatar !== null && this.avatar !== '') {
      this.image = this.avatar;
    }
  }

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

patientSchema.index({ 'credentials.email': 1 }, { unique: true });

module.exports = mongoose.model('Patient', patientSchema, 'patients');
