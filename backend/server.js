const express = require('express');
const mysql = require('mysql2/promise');
const path = require('path');

const app = express();
const PORT = 3000;

// --- Database Configuration ---
// Using environment variables for security and flexibility
const dbConfig = {
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
};

let pool;

// --- Database Initialization ---
// Includes retry logic and initial data seeding
async function initializeDatabase() {
    console.log("Attempting to connect to database...");
    // Retry connection for Docker Compose startup timing
    for (let i = 0; i < 10; i++) {
        try {
            pool = mysql.createPool(dbConfig);
            const connection = await pool.getConnection();
            console.log("Successfully connected to the database.");

            // Create the 'polls' table if it doesn't exist
            await connection.query(`
                CREATE TABLE IF NOT EXISTS polls (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    name VARCHAR(255) NOT NULL,
                    votes INT DEFAULT 0
                );
            `);
            console.log("Table 'polls' is ready.");

            // Seed the database with initial poll options if the table is empty
            const [rows] = await connection.query('SELECT COUNT(*) as count FROM polls');
            if (rows[0].count === 0) {
                console.log("Seeding database with initial poll options...");
                await connection.query(`
                    INSERT INTO polls (name) VALUES ('JavaScript'), ('Python'), ('Java'), ('Rust');
                `);
                console.log("Database seeded.");
            }

            connection.release();
            return; // Exit on success
        } catch (err) {
            console.log(`Database connection failed. Retrying... (${i + 1}/10)`);
            await new Promise(res => setTimeout(res, 5000)); // Wait 5 seconds
        }
    }
    console.error("Could not connect to the database after 10 attempts. Exiting.");
    process.exit(1);
}

// --- Middleware ---
app.use(express.static(__dirname)); // Serve static files like index.html

// --- API Endpoints ---

// GET /poll - Fetches all poll options and their vote counts
app.get('/poll', async (req, res) => {
    try {
        const [results] = await pool.query('SELECT * FROM polls ORDER BY id');
        res.json(results);
    } catch (err) {
        res.status(500).send("Error fetching poll data: " + err.message);
    }
});

// POST /vote/:id - Increments the vote count for a given option
app.post('/vote/:id', async (req, res) => {
    const { id } = req.params;
    try {
        await pool.query('UPDATE polls SET votes = votes + 1 WHERE id = ?', [id]);
        res.status(200).send("Vote counted successfully.");
    } catch (err) {
        res.status(500).send("Error counting vote: " + err.message);
    }
});

// --- Start Server ---
initializeDatabase().then(() => {
    app.listen(PORT, () => {
        console.log(`Polling app server is running on http://localhost:${PORT}`);
    });
});