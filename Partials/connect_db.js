// Partials/connect_db.js

const mysql = require('mysql2');

// Create the database connection pool
const pool = mysql.createPool({
    host: '127.0.0.1',
    user: 'root',
    password: '',
    database: 'winzone', // Make sure this matches your DB name
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

// Export the pool so other files (like main.js) can use it
module.exports = pool;