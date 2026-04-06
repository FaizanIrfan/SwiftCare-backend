require('dotenv').config();
const cors = require('cors');
const http = require('http');
const express = require('express');
const mongoose = require('mongoose');
const { Server } = require('socket.io');
const cookieParser = require('cookie-parser');

const userRoutes = require('./routes/user');
const authRoutes = require('./routes/auth');
const queueRoutes = require('./routes/queue');
const doctorRoutes = require('./routes/doctors');
const verificationRoutes = require('./routes/verification');
const reviewRoutes = require('./routes/reviews');
const chatbotRoutes = require('./routes/chatbot');
const paymentRoutes = require('./routes/payment');
const patientRoutes = require('./routes/patients');
const initSocket = require('./socket/sockethandler');
const { setIo } = require('./socket/io');
const appointmentRoutes = require('./routes/appointments');
const shiftRoutes = require('./routes/shifts');
const notificationRoutes = require('./routes/notifications');
const { startNotificationScheduler } = require('./services/notificationScheduler');

const app = express();
let isShuttingDown = false;

/* --------------------------------------------------
   Middlewares
-------------------------------------------------- */

app.use(cookieParser());
app.use(express.json());
app.set('view engine', 'ejs');

const allowedOrigins = (process.env.CORS_ORIGINS || 'http://localhost:3000,http://localhost:3001,http://127.0.0.1:3000,http://127.0.0.1:3001')
  .split(',')
  .map((origin) => origin.trim().replace(/\/+$/, ''))
  .filter(Boolean);
const allowAllCors = String(process.env.CORS_ALLOW_ALL || 'false').toLowerCase() === 'true';

const isAllowedOrigin = (origin) => {
  if (allowAllCors) return true;
  if (!origin) return true;

  const normalized = origin.replace(/\/+$/, '');
  if (allowedOrigins.includes(normalized)) return true;

  return /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(normalized);
};

app.use(
  cors({
    origin: (origin, callback) => {
      if (isAllowedOrigin(origin)) return callback(null, true);
      return callback(new Error(`CORS blocked for origin: ${origin}`));
    },
    credentials: true
  })
);


/* --------------------------------------------------
MongoDB
-------------------------------------------------- */

mongoose.connect(process.env.MONGO_URI, {
  dbName: "PerfectData"
})
.then(() => console.log("MongoDB Connected to PerfectData"))
.catch(err => {
  console.error("MongoDB connection error:", err);
  process.exit(1);
});


/* --------------------------------------------------
   Routes
-------------------------------------------------- */

app.use('/auth', authRoutes);
app.use('/queue', queueRoutes);
app.use('/api/user', userRoutes);
app.use('/doctors', doctorRoutes);
app.use('/doctors/verification', verificationRoutes);
app.use('/reviews', reviewRoutes);
app.use("/chatbot", chatbotRoutes);
app.use("/payment", paymentRoutes);
app.use('/patients', patientRoutes);
app.use('/appointments', appointmentRoutes);
app.use('/shifts', shiftRoutes);
app.use('/notifications', notificationRoutes);
app.use('/uploads', express.static('uploads'));


/* --------------------------------------------------
   Health check
-------------------------------------------------- */

app.get('/', (req, res) => {
  res.render('main');
});

app.get('/healthz', (req, res) => {
  const dbConnected = mongoose.connection?.readyState === 1;
  const healthy = dbConnected && !isShuttingDown;
  res.status(healthy ? 200 : 503).json({
    status: healthy ? 'ok' : 'degraded',
    dbConnected,
    shuttingDown: isShuttingDown,
    uptimeSeconds: Math.floor(process.uptime())
  });
});


/* --------------------------------------------------
   HTTP Server + Socket.IO initialization
-------------------------------------------------- */

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: (origin, callback) => {
      if (isAllowedOrigin(origin)) return callback(null, true);
      return callback(new Error(`Socket CORS blocked for origin: ${origin}`));
    },
    credentials: true
  }
});

initSocket(io);
setIo(io);
startNotificationScheduler();


/* --------------------------------------------------
   Server Start
-------------------------------------------------- */

const PORT = process.env.PORT || 5000;

server.listen(PORT, () =>
  console.log(`Server running on port ${PORT}`)
);

function shutdown(signal) {
  return async () => {
    if (isShuttingDown) return;
    isShuttingDown = true;
    console.log(`Received ${signal}. Starting graceful shutdown...`);
    server.close(async () => {
      try {
        await mongoose.connection.close();
      } catch (error) {
        console.error('Error while closing MongoDB connection:', error.message);
      }
      process.exit(0);
    });
  };
}

process.on('SIGTERM', shutdown('SIGTERM'));
process.on('SIGINT', shutdown('SIGINT'));
