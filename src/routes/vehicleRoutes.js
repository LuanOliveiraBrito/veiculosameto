import express from 'express';
import jwt from 'jsonwebtoken';
import { getDb, run, query, saveDatabase } from '../database/db.js';

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
    const vehicles = query(`
      SELECT v.*, d.name as driverName 
      FROM vehicles v 
      LEFT JOIN drivers d ON v.currentDriver = d.id
    `);
    
    res.json(vehicles.map(row => ({
      id: row[0],
      model: row[1],
      isCheckedOut: Boolean(row[2]),
      currentDriver: row[3],
      driverName: row[4]
    })));
  } catch (error) {
    console.error('Error fetching vehicles:', error);
    res.status(500).json({ error: 'Failed to fetch vehicles' });
  }
});

router.post('/vehicles/checkout', authenticateToken, async (req, res) => {
  const { vehicleId, driverId } = req.body;
  
  try {
    run('BEGIN TRANSACTION');
    
    const vehicle = query('SELECT isCheckedOut FROM vehicles WHERE id = ?', [vehicleId])[0];
    if (!vehicle) {
      run('ROLLBACK');
      return res.status(404).json({ error: 'Veículo não encontrado' });
    }

    if (Boolean(vehicle[0])) {
      run('ROLLBACK');
      return res.status(400).json({ error: 'Veículo já está em uso' });
    }

    run(`
      UPDATE vehicles
      SET isCheckedOut = TRUE, currentDriver = ?
      WHERE id = ?
    `, [driverId, vehicleId]);

    run(`
      INSERT INTO history (vehicleId, driverId, checkoutTime)
      VALUES (?, ?, datetime('now', 'localtime'))
    `, [vehicleId, driverId]);

    run('COMMIT');
    saveDatabase();
    
    res.json({ success: true });
  } catch (error) {
    run('ROLLBACK');
    console.error('Checkout error:', error);
    res.status(500).json({ error: 'Erro ao retirar veículo' });
  }
});

router.post('/vehicles/return', authenticateToken, async (req, res) => {
  const { vehicleId } = req.body;
  
  try {
    run('BEGIN TRANSACTION');
    
    const vehicleResult = query(`
      SELECT isCheckedOut, currentDriver
      FROM vehicles
      WHERE id = ?
    `, [vehicleId])[0];

    if (!vehicleResult) {
      run('ROLLBACK');
      return res.status(404).json({ error: 'Veículo não encontrado' });
    }

    const isCheckedOut = Boolean(vehicleResult[0]);
    const currentDriver = vehicleResult[1];

    if (!isCheckedOut) {
      run('ROLLBACK');
      return res.status(400).json({ error: 'Veículo não está em uso' });
    }

    const userResult = query(`
      SELECT driverId
      FROM users
      WHERE id = ?
    `, [req.user.id])[0];

    if (!userResult) {
      run('ROLLBACK');
      return res.status(403).json({ error: 'Usuário não encontrado' });
    }

    const userDriverId = userResult[0];
    const isAdmin = req.user.role === 'admin';

    if (!isAdmin && userDriverId !== currentDriver) {
      run('ROLLBACK');
      return res.status(403).json({ error: 'Apenas o motorista que retirou o veículo ou um administrador pode devolvê-lo' });
    }

    run(`
      UPDATE vehicles
      SET isCheckedOut = FALSE, currentDriver = NULL
      WHERE id = ?
    `, [vehicleId]);

    run(`
      UPDATE history
      SET returnTime = datetime('now', 'localtime')
      WHERE vehicleId = ? AND driverId = ? AND returnTime IS NULL
    `, [vehicleId, currentDriver]);

    run('COMMIT');
    saveDatabase();
    
    res.json({ success: true });
  } catch (error) {
    run('ROLLBACK');
    console.error('Return error:', error);
    res.status(500).json({ error: 'Erro ao devolver veículo' });
  }
});

export default router;
