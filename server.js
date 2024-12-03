import express from 'express';
import cors from 'cors';
import { initializeDatabase, saveDatabase } from './src/database/db.js';
import vehicleRoutes from './src/routes/vehicleRoutes.js';
import driverRoutes from './src/routes/driverRoutes.js';
import historyRoutes from './src/routes/historyRoutes.js';
import authRoutes from './src/routes/authRoutes.js';

// Set NODE_ENV
process.env.NODE_ENV = process.env.NODE_ENV || 'development';

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Request logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
  next();
});

// Response logging middleware
app.use((req, res, next) => {
  const originalSend = res.send;
  res.send = function (data) {
    console.log(`${new Date().toISOString()} - Response:`, data);
    return originalSend.call(this, data);
  };
  next();
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({ error: 'Internal Server Error', details: err.message });
});

console.log(`Starting server in ${process.env.NODE_ENV} mode...`);

// Initialize database before setting up routes
try {
  await initializeDatabase();
  console.log('Database initialized successfully');
  
  // Routes
  app.use('/api', authRoutes);
  app.use('/api', vehicleRoutes);
  app.use('/api', driverRoutes);
  app.use('/api', historyRoutes);

  const PORT = process.env.PORT || 3001;
  const server = app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });

  // Graceful shutdown
  async function shutdown() {
    console.log('Shutting down server...');
    
    try {
      await saveDatabase();
      console.log('Database saved successfully');
      
      server.close(() => {
        console.log('Server closed successfully');
        process.exit(0);
      });
    } catch (error) {
      console.error('Error during shutdown:', error);
      process.exit(1);
    }
  }

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

} catch (error) {
  console.error('Failed to initialize server:', error);
  process.exit(1);
}
