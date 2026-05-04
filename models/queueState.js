const mongoose = require("mongoose");

const queueStateSchema = new mongoose.Schema({
  shiftId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    index: true
  },
  currentServing: {
    type: Number,
    default: 0,
    min: 0,
    validate: {
      validator: Number.isInteger,
      message: 'currentServing must be a non-negative integer'
    }
  },
  lastQueueNumber: {
    type: Number,
    default: 0,
    min: 0,
    validate: {
      validator: Number.isInteger,
      message: 'lastQueueNumber must be a non-negative integer'
    }
  }
});

module.exports = mongoose.model("QueueState", queueStateSchema);
