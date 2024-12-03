import express from 'express';
import jwt from 'jsonwebtoken';
import { getDb, runQuery, execQuery, saveDatabase } from '../database/db.js';

const router = express.Router();
const JWT_SECRET = 'your-secret-key';

const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Token não fornecido' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Token inválido' });
    }
    req.user = user;
    next();
  });
};

router.get('/vehicles', authenticateToken, (req, res) => {
  try {
    const result = execQuery(`
      SELECT v.*, d.name as driverName 
      FROM vehicles v 
      LEFT JOIN drivers d ON v.currentDriver = d.id
    `);
    const vehicles = result.length > 0 ? result[0].values.map(row => ({
      id: row[0],
      model: row[1],
      isCheckedOut: Boolean(row[2]),
      currentDriver: row[3],
      driverName: row[4]
    })) : [];
    res.json(vehicles);
  } catch (error) {
    console.error('Error fetching vehicles:', error);
    res.status(500).json({ error: 'Failed to fetch vehicles' });
  }
});

router.post('/vehicles/checkout', authenticateToken, (req, res) => {
  const { vehicleId, driverId } = req.body;
  const db = getDb();
  
  try {
    // Start transaction
    db.exec('BEGIN TRANSACTION');
    
    // Check if vehicle exists and is available
    const vehicleResult = db.exec('SELECT isCheckedOut FROM vehicles WHERE id = ?', [vehicleId]);
    if (!vehicleResult.length || !vehicleResult[0].values.length) {
      db.exec('ROLLBACK');
      return res.status(404).json({ error: 'Veículo não encontrado' });
    }

    const isCheckedOut = Boolean(vehicleResult[0].values[0][0]);
    if (isCheckedOut) {
      db.exec('ROLLBACK');
      return res.status(400).json({ error: 'Veículo já está em uso' });
    }

    // Update vehicle status
    db.exec(`
      UPDATE vehicles
      SET isCheckedOut = TRUE, currentDriver = ?
      WHERE id = ?
    `, [driverId, vehicleId]);

    // Create history record
    db.exec(`
      INSERT INTO history (vehicleId, driverId, checkoutTime)
      VALUES (?, ?, datetime('now', 'localtime'))
    `, [vehicleId, driverId]);

    // Commit transaction
    db.exec('COMMIT');
    saveDatabase();
    
    res.json({ success: true });
  } catch (error) {
    db.exec('ROLLBACK');
    console.error('Checkout error:', error);
    res.status(500).json({ error: 'Erro ao retirar veículo' });
  }
});

router.post('/vehicles/return', authenticateToken, (req, res) => {
  const { vehicleId } = req.body;
  const db = getDb();
  
  try {
    // Start transaction
    db.exec('BEGIN TRANSACTION');
    
    // Get vehicle information
    const vehicleResult = db.exec(`
      SELECT isCheckedOut, currentDriver
      FROM vehicles
      WHERE id = ?
    `, [vehicleId]);

    if (!vehicleResult.length || !vehicleResult[0].values.length) {
      db.exec('ROLLBACK');
      return res.status(404).json({ error: 'Veículo não encontrado' });
    }

    const isCheckedOut = Boolean(vehicleResult[0].values[0][0]);
    const currentDriver = vehicleResult[0].values[0][1];

    if (!isCheckedOut) {
      db.exec('ROLLBACK');
      return res.status(400).json({ error: 'Veículo não está em uso' });
    }

    // Get user information
    const userResult = db.exec(`
      SELECT driverId
      FROM users
      WHERE id = ?
    `, [req.user.id]);

    if (!userResult.length || !userResult[0].values.length) {
      db.exec('ROLLBACK');
      return res.status(403).json({ error: 'Usuário não encontrado' });
    }

    const userDriverId = userResult[0].values[0][0];
    const isAdmin = req.user.role === 'admin';

    if (!isAdmin && userDriverId !== currentDriver) {
      db.exec('ROLLBACK');
      return res.status(403).json({ error: 'Apenas o motorista que retirou o veículo ou um administrador pode devolvê-lo' });
    }

    // Update vehicle status
    db.exec(`
      UPDATE vehicles
      SET isCheckedOut = FALSE, currentDriver = NULL
      WHERE id = ?
    `, [vehicleId]);

    // Update history record
    db.exec(`
      UPDATE history
      SET returnTime = datetime('now', 'localtime')
      WHERE vehicleId = ? AND driverId = ? AND returnTime IS NULL
    `, [vehicleId, currentDriver]);

    // Commit transaction
    db.exec('COMMIT');
    saveDatabase();
    
    res.json({ success: true });
  } catch (error) {
    db.exec('ROLLBACK');
    console.error('Return error:', error);
    res.status(500).json({ error: 'Erro ao devolver veículo' });
  }
});

export default router;
