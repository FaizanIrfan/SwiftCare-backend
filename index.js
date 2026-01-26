require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const cookieParser = require('cookie-parser');

const patientRoutes = require('./routes/patients');
const doctorRoutes = require('./routes/doctors');
const reviewRoutes = require('./routes/reviews');
const appointmentRoutes = require('./routes/appointments');

const app = express();
const authRoutes = require('./routes/auth');

app.use(cookieParser());
app.use(express.json());
app.use(cors({
  origin: [
    "http://localhost:3000",
    "http://localhost:5173",
    "https://your-nextjs-site.vercel.app"
  ],
  methods: ["GET", "POST", "PUT", "DELETE"],
  credentials: true
}));
app.use('/auth', authRoutes);


// MongoDB
mongoose.connect(process.env.MONGO_URI, {
  dbName: "SwiftCare"
})
.then(() => console.log("MongoDB Connected to SwiftCare DB"))
.catch(err => {
  console.error("MongoDB connection error:", err);
  process.exit(1);
});

// Routes
app.use('/patients', patientRoutes);
app.use('/doctors', doctorRoutes);
app.use('/reviews', reviewRoutes);
app.use('/appointments', appointmentRoutes);

// Health check
app.get('/', (req, res) => {
  res.send('SwiftCare API running 🚑');
});

// Server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () =>
  console.log(`Server running on port ${PORT}`)
);