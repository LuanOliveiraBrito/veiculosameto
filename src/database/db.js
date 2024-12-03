import initSqlJs from 'sql.js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';
import bcrypt from 'bcryptjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dbFile = process.env.NODE_ENV === 'production' 
  ? '/tmp/vehicles.db'  // Use /tmp em produção para garantir permissões de escrita
  : join(__dirname, '..', '..', 'vehicles.db');

let db;
let SQL;

export async function initializeDatabase() {
  SQL = await initSqlJs();
  
  try {
    if (fs.existsSync(dbFile)) {
      const filebuffer = fs.readFileSync(dbFile);
      db = new SQL.Database(filebuffer);
    } else {
      db = new SQL.Database();
      await initializeTables();
      saveDatabase();
    }

    // Configurar auto-save a cada 5 minutos
    if (process.env.NODE_ENV === 'production') {
      setInterval(() => {
        try {
          saveDatabase();
          console.log('Database auto-saved successfully');
        } catch (error) {
          console.error('Error during database auto-save:', error);
        }
      }, 5 * 60 * 1000); // 5 minutos
    }
  } catch (err) {
    console.error('Error initializing database:', err);
    db = new SQL.Database();
    await initializeTables();
    saveDatabase();
  }
}

export function saveDatabase() {
  try {
    const data = db.export();
    const buffer = Buffer.from(data);
    
    // Criar diretório pai se não existir
    const dbDir = dirname(dbFile);
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }
    
    // Salvar com backup
    const backupFile = `${dbFile}.backup`;
    if (fs.existsSync(dbFile)) {
      fs.copyFileSync(dbFile, backupFile);
    }
    
    fs.writeFileSync(dbFile, buffer);
    
    // Remover backup após sucesso
    if (fs.existsSync(backupFile)) {
      fs.unlinkSync(backupFile);
    }
    
    console.log('Database saved successfully');
  } catch (error) {
    console.error('Error saving database:', error);
    
    // Tentar restaurar do backup em caso de erro
    const backupFile = `${dbFile}.backup`;
    if (fs.existsSync(backupFile)) {
      fs.copyFileSync(backupFile, dbFile);
      console.log('Database restored from backup');
    }
    
    throw error;
  }
}

// Resto do código permanece igual...
