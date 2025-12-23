const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const pool = require(path.join(__dirname, 'Partials', 'connect_db.js'));
const bcrypt = require('bcrypt');

// Test the connection here in main.js
pool.getConnection((err, connection) => {
    if (err) {
        console.error('Error connecting to database:', err);
    } else {
        console.log('Successfully connected to the database (winzone_db)!');
        connection.release(); // Release the connection
    }
});

// --- HELPER: Payout Processing Logic ---
async function processPendingPayouts() {
    const connection = await pool.promise().getConnection();
    try {
        await connection.beginTransaction();

        // 1. Find draws that have a winning spot (not PENDING) but are NOT processed
        const [draws] = await connection.execute(
            "SELECT draw_id, winning_spot FROM draws WHERE winning_spot != 'PENDING' AND is_processed = 0 FOR UPDATE"
        );

        for (const draw of draws) {
            console.log(`Processing payouts for Draw ${draw.draw_id}, Result: ${draw.winning_spot}`);

            // 2. Find all tickets for this draw
            const [tickets] = await connection.execute(
                "SELECT ticket_id, user_id, bet_details FROM tickets WHERE draw_id = ? AND is_cancelled = 0",
                [draw.draw_id]
            );

            for (const ticket of tickets) {
                const bets = JSON.parse(ticket.bet_details);
                const winningQty = bets[draw.winning_spot] || 0;

                if (winningQty > 0) {
                    const winAmount = winningQty * 90; // Rs 90 per winning quantity

                    // Update User Balance (Credit the winning amount)
                    await connection.execute(
                        "UPDATE users SET balance = balance + ? WHERE user_id = ?",
                        [winAmount, ticket.user_id]
                    );
                }
            }

            // 3. Mark draw as processed
            await connection.execute(
                "UPDATE draws SET is_processed = 1 WHERE draw_id = ?",
                [draw.draw_id]
            );
        }

        await connection.commit();
    } catch (err) {
        await connection.rollback();
        console.error("Payout processing error:", err);
    } finally {
        connection.release();
    }
}

// Run the payout checker every 5 seconds
setInterval(processPendingPayouts, 5000);

// --- IPC HANDLERS ---

// This function listens for the 'login' event from the preload script
ipcMain.handle('login', async (event, username, password) => {
    try {
        const connection = await pool.promise().getConnection();
        const sql = "SELECT * FROM users WHERE username = ?";
        const [rows] = await connection.execute(sql, [username]);

        connection.release();

        if (rows.length > 0) {
            // User was found, now securely compare passwords
            const user = rows[0];

            // Use bcrypt.compare to check the password
            const isMatch = await bcrypt.compare(password, user.password_hash);

            if (isMatch) {
                // Password matches!
                return { success: true, message: 'Login successful!', user: user };
            } else {
                // Password does not match
                return { success: false, message: 'Invalid username or password' };
            }

        } else {
            // User was not found
            return { success: false, message: 'Invalid username or password' };
        }

    } catch (err) {
        console.error('Database query error:', err);
        return { success: false, message: 'A database error occurred.' };
    }
});

ipcMain.handle('submit-ticket', async (event, ticketData) => {

    const connection = await pool.promise().getConnection();

    try {
        // --- Step A: Start a Transaction ---
        // This ensures if one query fails, both fail.
        await connection.beginTransaction();

        // --- Step B: Get the user's data and lock the row ---
        // 'FOR UPDATE' locks this user's row so we can safely check/update their balance.
        const [rows] = await connection.execute(
            "SELECT user_id, balance FROM users WHERE username = ? FOR UPDATE",
            [ticketData.username]
        );

        const user = rows[0];
        const newBalance = user.balance - ticketData.totalAmount;

        // --- Step C: Check if they have enough money ---
        if (newBalance < 0) {
            await connection.rollback(); // Cancel the transaction
            connection.release();
            return { success: false, message: 'Insufficient balance!' };
        }

        // --- Step D: Find or Create the Draw ID ---
        // We use the draw's end time as a unique key
        let [drawRows] = await connection.execute(
            "SELECT draw_id FROM draws WHERE end_time = ?",
            [ticketData.drawEndTime]
        );

        let draw_id;
        if (drawRows.length > 0) {
            // Draw already exists
            draw_id = drawRows[0].draw_id;
        } else {
            // First ticket for this draw, so create it.
            const [insertResult] = await connection.execute(
                "INSERT INTO draws (end_time, winning_spot, total_collection, total_payout, is_processed) VALUES (?, ?, 0, 0, 0)",
                [ticketData.drawEndTime, 'PENDING'] // Winning spot is pending
            );
            draw_id = insertResult.insertId;
        }

        // --- Step E: Insert the Ticket ---
        await connection.execute(
            "INSERT INTO tickets (draw_id, user_id, bet_details, total_amount) VALUES (?, ?, ?, ?)",
            [
                draw_id,
                user.user_id,
                JSON.stringify(ticketData.betDetails), // Convert bet object to a JSON string
                ticketData.totalAmount
            ]
        );

        // --- Step F: Update the User's Balance ---
        await connection.execute(
            "UPDATE users SET balance = ? WHERE user_id = ?",
            [newBalance, user.user_id]
        );

        // --- Step G: Commit the Transaction ---
        // All queries were successful!
        await connection.commit();

        // Return the good news and the new balance
        return {
            success: true,
            message: 'Ticket Confirmed!',
            newBalance: newBalance
        };

    } catch (err) {
        // Something went wrong, cancel everything
        await connection.rollback();
        console.error('Ticket submission error:', err);
        return { success: false, message: 'Database error, ticket was cancelled.' };
    } finally {
        // Always release the connection
        connection.release();
    }
});


ipcMain.on('print-ticket', (event, receiptHtml) => {
    const printWindow = new BrowserWindow({
        show: false, // Hide the window
        width: 302,  // Width of a standard 80mm thermal receipt
        webPreferences: {
            // No preload script needed since we're loading HTML directly
        }
    });

    // We must load it as a Data URL
    printWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(receiptHtml)}`);

    // Wait for the content to finish loading
    printWindow.webContents.on('did-finish-load', () => {
        // Once loaded, send the print command
        printWindow.webContents.print({
            silent: true,      // No print dialog
            printBackground: true,
            deviceName: ''     // '' means use the default printer
        }, (success, errorType) => {
            if (!success) {
                console.error('Printing failed:', errorType);
            }
            // We're done, so close the hidden window
            printWindow.close();
        });
    });
});

ipcMain.handle('get-latest-results', async () => {
    try {
        const connection = await pool.promise().getConnection();

        // This query finds the 7 most recent draws that are NOT pending,
        // ordered from newest (top) to oldest.
        const [rows] = await connection.execute(
            `SELECT winning_spot, end_time 
             FROM draws 
             WHERE winning_spot != 'PENDING' 
             ORDER BY end_time DESC 
             LIMIT 7`
        );

        connection.release();
        return { success: true, results: rows };

    } catch (err) {
        console.error('Error fetching results:', err);
        return { success: false, message: 'Could not fetch results.' };
    }
});

ipcMain.handle('get-filtered-results', async (event, dateString) => {
    try {
        const connection = await pool.promise().getConnection();

        let sql = `SELECT draw_id, winning_spot, total_collection, total_payout, end_time 
                   FROM draws 
                   WHERE is_processed = 1`; // Only show finalized draws
        const params = [];

        if (dateString) {
            // Filter by a specific date
            sql += ` AND DATE(end_time) = ?`;
            params.push(dateString);
        }

        sql += ` ORDER BY end_time DESC`; // Always sort newest first

        const [rows] = await connection.execute(sql, params);

        connection.release();
        return { success: true, results: rows };

    } catch (err) {
        console.error('Error fetching filtered results:', err);
        return { success: false, message: 'Could not fetch results.' };
    }
});

// --- TICKET HISTORY HANDLER ---
ipcMain.handle('get-ticket-history', async (event, username, dateString) => {
    try {
        const connection = await pool.promise().getConnection();

        // 1. Get user_id
        const [users] = await connection.execute("SELECT user_id FROM users WHERE username = ?", [username]);
        if (users.length === 0) {
            connection.release();
            return { success: false, message: 'User not found' };
        }
        const userId = users[0].user_id;

        // 2. UPDATED QUERY: JOIN with 'draws' table to get 'end_time'
        // We need 'd.end_time' to calculate the 1-minute rule on the frontend
        let sql = `
            SELECT t.ticket_id, t.draw_id, t.bet_details, t.total_amount, t.created_at, d.end_time
            FROM tickets t
            JOIN draws d ON t.draw_id = d.draw_id
            WHERE t.user_id = ? AND t.is_cancelled = 0
        `;

        const params = [userId];

        if (dateString) {
            sql += ` AND DATE(t.created_at) = ?`;
            params.push(dateString);
        }

        sql += ` ORDER BY t.created_at DESC`;

        const [rows] = await connection.execute(sql, params);
        connection.release();

        return { success: true, tickets: rows };

    } catch (err) {
        console.error('Error fetching ticket history:', err);
        return { success: false, message: 'Database error' };
    }
});

// 2. ADD THIS NEW HANDLER (Paste this BELOW the history handler)
ipcMain.handle('cancel-ticket', async (event, ticketId, username) => {
    const connection = await pool.promise().getConnection();
    try {
        await connection.beginTransaction();

        // A. Get User ID
        const [users] = await connection.execute("SELECT user_id, balance FROM users WHERE username = ? FOR UPDATE", [username]);
        if (users.length === 0) throw new Error("User not found");
        const user = users[0];

        // B. Get Ticket and Draw Details
        const [tickets] = await connection.execute(`
            SELECT t.ticket_id, t.total_amount, t.is_cancelled, d.end_time 
            FROM tickets t
            JOIN draws d ON t.draw_id = d.draw_id
            WHERE t.ticket_id = ? AND t.user_id = ?
        `, [ticketId, user.user_id]);

        if (tickets.length === 0) {
            await connection.rollback();
            return { success: false, message: 'Ticket not found.' };
        }
        const ticket = tickets[0];

        if (ticket.is_cancelled === 1) {
            await connection.rollback();
            return { success: false, message: 'Already cancelled.' };
        }

        // C. CHECK TIME (1 Minute Rule)
        const drawEndTime = new Date(ticket.end_time);
        const now = new Date();
        const diffMs = drawEndTime - now;
        const diffMinutes = diffMs / 1000 / 60;

        if (diffMinutes < 1) {
            await connection.rollback();
            return { success: false, message: 'Time over! Cancellation allowed only 1 min before draw.' };
        }

        // D. Refund Money
        const newBalance = parseFloat(user.balance) + parseFloat(ticket.total_amount);
        await connection.execute('UPDATE users SET balance = ? WHERE user_id = ?', [newBalance, user.user_id]);

        // E. Mark as Cancelled
        await connection.execute('UPDATE tickets SET is_cancelled = 1 WHERE ticket_id = ?', [ticketId]);

        await connection.commit();
        return { success: true, message: 'Ticket cancelled & refunded.', newBalance: newBalance };

    } catch (err) {
        await connection.rollback();
        console.error('Cancel error:', err);
        return { success: false, message: 'Server error during cancellation.' };
    } finally {
        connection.release();
    }
});



// --- ACCOUNT LEDGER HANDLER --- //
ipcMain.handle('get-account-ledger', async (event, username, startDate, endDate) => {
    try {
        const connection = await pool.promise().getConnection();

        // 1. Get user details
        const [users] = await connection.execute("SELECT user_id, balance FROM users WHERE username = ?", [username]);
        if (users.length === 0) {
            connection.release();
            return { success: false, message: 'User not found' };
        }
        const user = users[0];

        // 2. Calculate Total Sales for Date Range
        let sqlSales = `SELECT SUM(total_amount) as total_sales FROM tickets WHERE user_id = ?`;
        const params = [user.user_id];

        if (startDate && endDate) {
            sqlSales += ` AND DATE(created_at) BETWEEN ? AND ?`;
            params.push(startDate, endDate);
        }

        const [salesRows] = await connection.execute(sqlSales, params);
        const totalSales = parseFloat(salesRows[0].total_sales || 0);

        // 3. Calculate Commission (10%)
        const commission = totalSales * 0.10;

        // 4. Net Payable Calculation
        // Net Payable = Total Sales - Commission
        const netToAdmin = totalSales - commission;

        connection.release();

        return {
            success: true,
            data: {
                userId: user.user_id,
                currentBalance: user.balance,
                totalSales: totalSales,
                commission: commission,
                netToAdmin: netToAdmin
            }
        };

    } catch (err) {
        console.error('Error fetching ledger:', err);
        return { success: false, message: 'Database error' };
    }
});


function createWindow() {
    // Create the browser window.
    const mainWindow = new BrowserWindow({
        width: 1960,
        height: 1080,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js')
        }
    });

    // Load the index.html file into the window.
    mainWindow.loadFile(path.join(__dirname, './Renderer/index.html'));
}

// When Electron is ready, create the window
app.whenReady().then(createWindow);

// Quit when all windows are closed (except on macOS)
app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});