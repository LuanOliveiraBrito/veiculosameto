import express from 'express';
import cors from 'cors';
import { initializeDatabase } from './src/database/db.js';
import vehicleRoutes from './src/routes/vehicleRoutes.js';
import driverRoutes from './src/routes/driverRoutes.js';
import historyRoutes from './src/routes/historyRoutes.js';
import authRoutes from './src/routes/authRoutes.js';

const app = express();
app.use(cors());
app.use(express.json());

// Configurar process.env.NODE_ENV
process.env.NODE_ENV = process.env.NODE_ENV || 'development';

// Initialize database before setting up routes
await initializeDatabase();

// Middleware para logging em produção
if (process.env.NODE_ENV === 'production') {
  app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
    next();
  });
}

// Routes
app.use('/api', authRoutes);
app.use('/api', vehicleRoutes);
app.use('/api', driverRoutes);
app.use('/api', historyRoutes);

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Server running in ${process.env.NODE_ENV} mode on port ${PORT}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM signal received: closing HTTP server');
  server.close(() => {
    console.log('HTTP server closed');
    process.exit(0);
  });
});
