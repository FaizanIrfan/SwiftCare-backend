require('dotenv').config();
import express, { json } from 'express';
import { connect } from 'mongoose';
import cors from 'cors';
import cookieParser from 'cookie-parser';

import patientRoutes from './routes/patients';
import doctorRoutes from './routes/doctors';
import reviewRoutes from './routes/reviews';
import appointmentRoutes from './routes/appointments';

const app = express();
import authRoutes from './routes/auth';

app.use(cookieParser());
app.use(json());
app.set('view engine', 'ejs');
app.use(cors({
  origin: true,
  credentials: true
}));
app.use('/auth', authRoutes);


/* --------------------------------------------------
   MongoDB
-------------------------------------------------- */

connect(process.env.MONGO_URI, {
  dbName: "SwiftCare"
})
.then(() => console.log("MongoDB Connected to SwiftCare DB"))
.catch(err => {
  console.error("MongoDB connection error:", err);
  process.exit(1);
});


/* --------------------------------------------------
   Routes
-------------------------------------------------- */

app.use('/patients', patientRoutes);
app.use('/doctors', doctorRoutes);
app.use('/reviews', reviewRoutes);
app.use('/appointments', appointmentRoutes);


/* --------------------------------------------------
   Health check
-------------------------------------------------- */

app.get('/', (req, res) => {
    res.render('main');
});


/* --------------------------------------------------
   Server
-------------------------------------------------- */

const PORT = process.env.PORT || 3000;
app.listen(PORT, () =>
  console.log(`Server running on port ${PORT}`)
);