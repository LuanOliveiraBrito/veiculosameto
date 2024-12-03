import express from 'express';
import { query } from '../database/db.js';

const router = express.Router();

router.get('/drivers', (req, res) => {
  try {
    const result = query('SELECT * FROM drivers');
    const drivers = result.map(row => ({
      id: row[0],
      name: row[1],
      department: row[2]
    }));
    res.json(drivers);
  } catch (error) {
    console.error('Error fetching drivers:', error);
    res.status(500).json({ error: 'Failed to fetch drivers' });
  }
});

export default router;
