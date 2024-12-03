import initSqlJs from 'sql.js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';
import bcrypt from 'bcryptjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dbFile = process.env.NODE_ENV === 'production' 
  ? '/tmp/vehicles.db'
  : join(__dirname, '..', '..', 'vehicles.db');

let db;
let SQL;
let saveInterval;

export async function initializeDatabase() {
  SQL = await initSqlJs();
  
  try {
    console.log(`Initializing database at ${dbFile}`);
    
    if (fs.existsSync(dbFile)) {
      console.log('Loading existing database file');
      const filebuffer = fs.readFileSync(dbFile);
      db = new SQL.Database(filebuffer);
      console.log('Database loaded successfully');
    } else {
      console.log('Creating new database');
      db = new SQL.Database();
      await initializeTables();
      await saveDatabase();
      console.log('New database created and initialized');
    }

    // Clear any existing save interval
    if (saveInterval) {
      clearInterval(saveInterval);
    }

    // Set up auto-save in production
    if (process.env.NODE_ENV === 'production') {
      saveInterval = setInterval(async () => {
        try {
          await saveDatabase();
          console.log('Database auto-saved successfully');
        } catch (error) {
          console.error('Error during database auto-save:', error);
        }
      }, 30000); // Save every 30 seconds in production
    }
  } catch (err) {
    console.error('Error initializing database:', err);
    throw err;
  }
}

async function initializeTables() {
  console.log('Initializing database tables');
  
  try {
    run('DROP TABLE IF EXISTS history');
    run('DROP TABLE IF EXISTS vehicles');
    run('DROP TABLE IF EXISTS drivers');
    run('DROP TABLE IF EXISTS users');

    run(`
      CREATE TABLE IF NOT EXISTS drivers (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        department TEXT NOT NULL
      )
    `);

    run(`
      CREATE TABLE IF NOT EXISTS vehicles (
        id TEXT PRIMARY KEY,
        model TEXT NOT NULL,
        isCheckedOut BOOLEAN DEFAULT FALSE,
        currentDriver TEXT,
        FOREIGN KEY (currentDriver) REFERENCES drivers (id)
      )
    `);

    run(`
      CREATE TABLE IF NOT EXISTS history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        vehicleId TEXT NOT NULL,
        driverId TEXT NOT NULL,
        checkoutTime DATETIME DEFAULT CURRENT_TIMESTAMP,
        returnTime DATETIME,
        FOREIGN KEY (vehicleId) REFERENCES vehicles (id),
        FOREIGN KEY (driverId) REFERENCES drivers (id)
      )
    `);

    run(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        username TEXT NOT NULL UNIQUE,
        password TEXT NOT NULL,
        role TEXT NOT NULL CHECK (role IN ('admin', 'driver')),
        driverId TEXT,
        driverName TEXT,
        FOREIGN KEY (driverId) REFERENCES drivers (id)
      )
    `);

    // Insert initial data
    run("INSERT INTO drivers (id, name, department) VALUES (?, ?, ?)", 
      ['1', 'Luan Oliveira de Brito Nunes', 'Administração']);
    run("INSERT INTO drivers (id, name, department) VALUES (?, ?, ?)", 
      ['2', 'José Borges', 'Motorista']);

    run("INSERT INTO vehicles (id, model, isCheckedOut) VALUES (?, ?, FALSE)", 
      ['RSB7C87', 'NISSAN VERSA']);
    run("INSERT INTO vehicles (id, model, isCheckedOut) VALUES (?, ?, FALSE)", 
      ['QKE1B38', 'HILUX MARCELO']);
    run("INSERT INTO vehicles (id, model, isCheckedOut) VALUES (?, ?, FALSE)", 
      ['QKI7G71', 'PRESIDÊNCIA']);
    run("INSERT INTO vehicles (id, model, isCheckedOut) VALUES (?, ?, FALSE)", 
      ['QKE1B6', 'HILUX ADMINISTRAÇÃO']);

    const hashedPassword = await bcrypt.hash('admin123', 10);
    run("INSERT INTO users (id, username, password, role) VALUES (?, ?, ?, ?)",
      ['admin', 'admin', hashedPassword, 'admin']);

    console.log('Database tables initialized successfully');
  } catch (error) {
    console.error('Error initializing tables:', error);
    throw error;
  }
}

export async function saveDatabase() {
  console.log('Saving database...');
  
  try {
    const data = db.export();
    const buffer = Buffer.from(data);
    
    const dbDir = dirname(dbFile);
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }
    
    const backupFile = `${dbFile}.backup`;
    
    // Create backup of existing database
    if (fs.existsSync(dbFile)) {
      fs.copyFileSync(dbFile, backupFile);
      console.log('Backup created successfully');
    }
    
    // Write new database file
    fs.writeFileSync(dbFile, buffer);
    console.log('Database saved successfully');
    
    // Remove backup after successful save
    if (fs.existsSync(backupFile)) {
      fs.unlinkSync(backupFile);
      console.log('Backup removed after successful save');
    }
  } catch (error) {
    console.error('Error saving database:', error);
    
    // Restore from backup if available
    const backupFile = `${dbFile}.backup`;
    if (fs.existsSync(backupFile)) {
      console.log('Attempting to restore from backup...');
      fs.copyFileSync(backupFile, dbFile);
      console.log('Database restored from backup');
    }
    
    throw error;
  }
}

export function query(sql, params = []) {
  try {
    console.log('Executing query:', sql, 'with params:', params);
    
    const stmt = db.prepare(sql);
    stmt.bind(params);
    
    const result = [];
    while (stmt.step()) {
      result.push(stmt.get());
    }
    stmt.free();
    
    console.log('Query result:', result);
    return result;
  } catch (error) {
    console.error('Error executing query:', sql, 'Error:', error);
    throw error;
  }
}

export function run(sql, params = []) {
  try {
    console.log('Running SQL:', sql, 'with params:', params);
    const result = db.run(sql, params);
    console.log('SQL execution result:', result);
    return result;
  } catch (error) {
    console.error('Error running SQL:', sql, 'Error:', error);
    throw error;
  }
}

export function getDb() {
  return db;
}

// Cleanup on process exit
process.on('SIGINT', () => {
  console.log('Received SIGINT. Cleaning up...');
  if (saveInterval) {
    clearInterval(saveInterval);
  }
  saveDatabase()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
});

process.on('SIGTERM', () => {
  console.log('Received SIGTERM. Cleaning up...');
  if (saveInterval) {
    clearInterval(saveInterval);
  }
  saveDatabase()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
});
