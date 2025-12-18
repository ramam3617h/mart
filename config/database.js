// ============================================                                                                                                                              // 4. FILE: config/database.js
// ============================================
const mysql = require('mysql2/promise');
require('dotenv').config();

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: process.env.DB_PORT || 3306,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 0
});

// Test connection
pool.getConnection()
  .then(connection => {
    console.log(' ^|^e Database connected successfully');
    connection.release();
  })
  .catch(err => {
    console.error(' ^}^l Database connection failed:', err.message);
  });

module.exports = pool;
