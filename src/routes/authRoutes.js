import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { getDb, run, query, saveDatabase } from '../database/db.js';

const router = express.Router();
const JWT_SECRET = 'your-secret-key';

router.post('/auth/login', async (req, res) => {
  const { username, password } = req.body;
  
  try {
    const result = query('SELECT * FROM users WHERE username = ?', [username]);
    if (!result.length) {
      return res.status(401).json({ error: 'Usuário não encontrado' });
    }

    const user = {
      id: result[0][0],
      username: result[0][1],
      password: result[0][2],
      role: result[0][3],
      driverId: result[0][4],
      driverName: result[0][5],
    };

    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(401).json({ error: 'Senha inválida' });
    }

    const token = jwt.sign(
      { id: user.id, role: user.role },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        driverId: user.driverId,
        driverName: user.driverName,
      },
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Erro no servidor' });
  }
});

router.post('/auth/users', async (req, res) => {
  const { username, password, role, driverName } = req.body;
  
  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const userId = Date.now().toString();
    let driverId = null;

    if (role === 'driver' && driverName) {
      driverId = Date.now().toString() + '-driver';
      run(`
        INSERT INTO drivers (id, name, department)
        VALUES (?, ?, ?)
      `, [driverId, driverName, 'Motorista']);
    }

    run(`
      INSERT INTO users (id, username, password, role, driverId, driverName)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [userId, username, hashedPassword, role, driverId, driverName]);

    saveDatabase();
    
    res.json({ id: userId, username, role, driverId, driverName });
  } catch (error) {
    console.error('Create user error:', error);
    res.status(500).json({ error: 'Erro ao criar usuário' });
  }
});

router.get('/auth/users', (req, res) => {
  try {
    const result = query('SELECT id, username, role, driverId, driverName FROM users');
    const users = result.map(row => ({
      id: row[0],
      username: row[1],
      role: row[2],
      driverId: row[3],
      driverName: row[4],
    }));
    res.json(users);
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

router.delete('/auth/users/:id', (req, res) => {
  const { id } = req.params;
  
  try {
    const user = query('SELECT driverId FROM users WHERE id = ?', [id])[0];
    if (user && user[0]) {
      run('DELETE FROM drivers WHERE id = ?', [user[0]]);
    }
    run('DELETE FROM users WHERE id = ?', [id]);
    saveDatabase();
    res.json({ success: true });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({ error: 'Erro ao deletar usuário' });
  }
});

export default router;
