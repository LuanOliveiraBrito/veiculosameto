import express from 'express';
import jwt from 'jsonwebtoken';
import { getDb, run, query, saveDatabase } from '../database/db.js';

const router = express.Router();
const JWT_SECRET = 'your-secret-key';

// Middleware para autenticação
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

// Rota para buscar veículos
router.get('/vehicles', authenticateToken, async (req, res) => {
  try {
    const vehicles = await query(`
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

// Rota para fazer checkout de veículo
router.post('/vehicles/checkout', authenticateToken, async (req, res) => {
  const { vehicleId, driverId } = req.body;
  
  try {
    await run('BEGIN TRANSACTION'); // Agora com await

    const vehicles = await query('SELECT isCheckedOut FROM vehicles WHERE id = ?', [vehicleId]);
    const vehicle = vehicles[0]; // Correção do acesso ao primeiro elemento

    if (!vehicle) {
      await run('ROLLBACK'); // Agora com await
      return res.status(404).json({ error: 'Veículo não encontrado' });
    }

    if (Boolean(vehicle[0])) {
      await run('ROLLBACK'); // Agora com await
      return res.status(400).json({ error: 'Veículo já está em uso' });
    }

    await run(`
      UPDATE vehicles
      SET isCheckedOut = TRUE, currentDriver = ?
      WHERE id = ?
    `, [driverId, vehicleId]);

    await run(`
      INSERT INTO history (vehicleId, driverId, checkoutTime)
      VALUES (?, ?, datetime('now', 'localtime'))
    `, [vehicleId, driverId]);

    await run('COMMIT'); // Agora com await
    saveDatabase();

    res.json({ success: true });
  } catch (error) {
    await run('ROLLBACK'); // Agora com await
    console.error('Checkout error:', error);
    res.status(500).json({ error: 'Erro ao retirar veículo' });
  }
});

// Rota para devolver veículo
router.post('/vehicles/return', authenticateToken, async (req, res) => {
  const { vehicleId } = req.body;

  try {
    await run('BEGIN TRANSACTION'); // Agora com await

    const vehicleResult = await query(`
      SELECT isCheckedOut, currentDriver
      FROM vehicles
      WHERE id = ?
    `, [vehicleId]);

    const vehicle = vehicleResult[0]; // Correção do acesso ao primeiro elemento

    if (!vehicle) {
      await run('ROLLBACK'); // Agora com await
      return res.status(404).json({ error: 'Veículo não encontrado' });
    }

    const isCheckedOut = Boolean(vehicle[0]);
    const currentDriver = vehicle[1];

    if (!isCheckedOut) {
      await run('ROLLBACK'); // Agora com await
      return res.status(400).json({ error: 'Veículo não está em uso' });
    }

    const userResult = await query(`
      SELECT driverId
      FROM users
      WHERE id = ?
    `, [req.user.id]);

    const user = userResult[0]; // Correção do acesso ao primeiro elemento

    if (!user) {
      await run('ROLLBACK'); // Agora com await
      return res.status(403).json({ error: 'Usuário não encontrado' });
    }

    const userDriverId = user[0];
    const isAdmin = req.user.role === 'admin';

    if (!isAdmin && userDriverId !== currentDriver) {
      await run('ROLLBACK'); // Agora com await
      return res.status(403).json({ error: 'Apenas o motorista que retirou o veículo ou um administrador pode devolvê-lo' });
    }

    await run(`
      UPDATE vehicles
      SET isCheckedOut = FALSE, currentDriver = NULL
      WHERE id = ?
    `, [vehicleId]);

    await run(`
      UPDATE history
      SET returnTime = datetime('now', 'localtime')
      WHERE vehicleId = ? AND driverId = ? AND returnTime IS NULL
    `, [vehicleId, currentDriver]);

    await run('COMMIT'); // Agora com await
    saveDatabase();

    res.json({ success: true });
  } catch (error) {
    await run('ROLLBACK'); // Agora com await
    console.error('Return error:', error);
    res.status(500).json({ error: 'Erro ao devolver veículo' });
  }
});

export default router;
