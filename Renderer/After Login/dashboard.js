document.addEventListener('DOMContentLoaded', () => {

    // --- NEW: Function to load user data ---
    function loadUserData() {
        // Get the data we saved during login
        const username = sessionStorage.getItem('username');
        const balance = sessionStorage.getItem('balance');
        const userId = sessionStorage.getItem('userId');

        if (!username) {
            alert('You are not logged in. Redirecting to login page.');
            window.location.href = '../index.html';
            return;
        }

        const usernameElement = document.getElementById('display-username');
        const balanceElement = document.getElementById('display-balance');

        if (usernameElement) {
            const numericUserId = parseInt(userId) || 0;
            const formattedUserId = `S${900 + numericUserId}`;
            const displayString = `${username.toUpperCase()} SKILL GAME CENTER ${formattedUserId}`;
            usernameElement.textContent = displayString;
        }

        if (balanceElement) {
            const formattedBalance = parseFloat(balance).toFixed(2);
            balanceElement.textContent = `₹ ${formattedBalance}`;
        }
    }

    // --- 1. CONFIGURATION ---
    const DRAW_DURATION_MINUTES = 10;
    const DRAW_DURATION_MS = DRAW_DURATION_MINUTES * 60 * 1000;

    // --- 2. Element References ---
    const drawEndTimeElement = document.getElementById('draw-end-time');
    const countdownElement = document.getElementById('countdown-timer');
    const spotInputs = document.querySelectorAll('.spot-input');
    const totalSpotsElement = document.getElementById('total-spots');
    const prizePoolElement = document.getElementById('prize-pool');
    const serviceChargeElement = document.getElementById('service-charge');
    const totalAmountElement = document.getElementById('total-amount');
    const resetBtn = document.getElementById('reset-btn');
    const submitBtn = document.getElementById('submit-btn');
    const refreshBtn = document.getElementById('refresh-btn');
    const claimBtn = document.getElementById('claim-btn');
    const barcodeInput = document.getElementById('barcode-input');
    const modal = document.getElementById('submit-modal');
    const modalCloseBtn = document.getElementById('modal-close-btn');
    const modalPrintBtn = document.getElementById('modal-print-btn');
    const modalConfirmBtn = document.getElementById('modal-confirm-btn');
    const ticketDetailsContent = document.getElementById('ticket-details-content');

    const resultsModal = document.getElementById('results-modal');
    const resultsModalCloseBtn = document.getElementById('results-modal-close-btn');
    const resultsBody = document.getElementById('results-table-body');
    const dateFilter = document.getElementById('date-filter');
    const todayBtn = document.getElementById('today-btn');

    // --- TICKET MODAL ELEMENTS ---
    const ticketModal = document.getElementById('ticket-history-modal');
    const ticketModalCloseBtn = document.getElementById('ticket-modal-close-btn');
    const ticketTableBody = document.getElementById('ticket-table-body');
    const ticketDateFilter = document.getElementById('ticket-date-filter');
    const ticketTodayBtn = document.getElementById('ticket-today-btn');



    let lastDrawCheck = 0;

    // --- 3. NEW SYNCHRONIZED TIMER SYSTEM ---
    function updateTimers() {
        const now = new Date();
        const timeSinceEpochMs = now.getTime();
        const timeRemainingMs = DRAW_DURATION_MS - (timeSinceEpochMs % DRAW_DURATION_MS);
        let totalSeconds = Math.floor(timeRemainingMs / 1000);
        const drawEndTimeMs = timeSinceEpochMs + timeRemainingMs;
        const drawEndDate = new Date(drawEndTimeMs);

        // Update Left Clock (Draw End Time)
        let hours = drawEndDate.getHours();
        const minutes = drawEndDate.getMinutes().toString().padStart(2, '0');
        const ampm = hours >= 12 ? 'PM' : 'AM';
        hours = hours % 12;
        hours = hours ? hours : 12;
        drawEndTimeElement.textContent = `${hours.toString().padStart(2, '0')}:${minutes} ${ampm}`;

        // Update Right Clock (Countdown)
        const displayMinutes = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
        const displaySeconds = (totalSeconds % 60).toString().padStart(2, '0');
        countdownElement.textContent = `${displayMinutes}:${displaySeconds}`;

        if (totalSeconds <= 60) {
            countdownElement.classList.add('warning');
        } else {
            countdownElement.classList.remove('warning');
        }

        // Check for draw end
        if (totalSeconds <= 1 && lastDrawCheck !== drawEndDate.getTime()) {
            lastDrawCheck = drawEndDate.getTime();
            console.log("Draw ended. Resetting board.");
            resetSelections();

            // --- ADD A DELAY TO WAIT FOR THE SERVER ---
            console.log("Waiting 3 seconds for server to finalize draw...");
            setTimeout(() => {
                // Now, fetch the new results
                window.electronAPI.getLatestResults().then(res => {
                    if (res.success) updateTopSpotsUI(res.results);
                    console.log("Results updated dynamically.");
                });
            }, 3000); // 3-second delay
        }
    }

    // --- 4. TOP SPOTS / RESULTS UI ---
    function updateTopSpotsUI(results = []) {
        const spotCardElements = document.querySelectorAll('.top-spots .spot-card');
        spotCardElements.forEach((card, index) => {
            const spotIdElement = card.querySelector('.spot-id');
            const spotTimeElement = card.querySelector('.spot-time');
            const spotImgElement = card.querySelector('img');

            if (results[index]) {
                const result = results[index];
                const winningSpot = result.winning_spot;
                const endTime = new Date(result.end_time);
                const timeString = endTime.toLocaleString('en-US', {
                    hour: '2-digit', minute: '2-digit', hour12: true
                });
                spotIdElement.textContent = winningSpot;
                spotTimeElement.textContent = timeString;
                spotImgElement.src = `https://placehold.co/100x80/4a5568/FFF?text=${winningSpot}`;
            } else {
                spotIdElement.textContent = '--';
                spotTimeElement.textContent = '00:00 AM';
                spotImgElement.src = `https://placehold.co/100x80/4a5568/FFF?text=--`;
            }
        });
    }

    // --- 5. Spot Input & Calculation System ---
    function calculateTotals() {
        let totalSpots = 0;
        spotInputs.forEach(input => {
            const value = parseInt(input.value) || 0;
            totalSpots += value;
            if (value > 0) input.classList.add('has-value');
            else input.classList.remove('has-value');
        });
        const prizePool = totalSpots * 9;
        const serviceCharge = totalSpots * 1;
        const totalAmount = prizePool + serviceCharge;
        totalSpotsElement.textContent = totalSpots;
        prizePoolElement.textContent = `₹${prizePool}`;
        serviceChargeElement.textContent = `₹${serviceCharge}`;
        totalAmountElement.textContent = `₹${totalAmount}`;
    }

    // Helper to format today's date for SQL (YYYY-MM-DD)
    function getTodayDateString() {
        const now = new Date();
        return now.getFullYear() + '-' +
            (now.getMonth() + 1).toString().padStart(2, '0') + '-' +
            now.getDate().toString().padStart(2, '0');
    }

    // Function to fetch and display results in the modal table
    async function fetchAndDisplayResults(dateString) {
        resultsBody.innerHTML = '<tr><td colspan="5" class="no-results"><i class="fa-solid fa-spinner fa-spin"></i> Loading results...</td></tr>';

        try {
            const result = await window.electronAPI.getFilteredResults(dateString);

            if (result.success && result.results.length > 0) {
                let html = '';
                result.results.forEach(draw => {
                    // Formatting the timestamp
                    const endTime = new Date(draw.end_time);
                    const timeString = endTime.toLocaleString('en-IN', {
                        day: '2-digit', month: '2-digit', year: '2-digit',
                        hour: '2-digit', minute: '2-digit', hour12: true
                    });

                    // Calculate profit for quick display (optional but helpful)
                    const profit = draw.total_collection - draw.total_payout;

                    html += `
                    <tr>
                        <td>${draw.draw_id}</td>
                        <td class="winning-spot">${draw.winning_spot}</td>
                        <td>${timeString}</td>
                    </tr>
                `;
                });
                resultsBody.innerHTML = html;
            } else {
                resultsBody.innerHTML = '<tr><td colspan="5" class="no-results">No finalized results found for this selection.</td></tr>';
            }
        } catch (err) {
            console.error("Error fetching results:", err);
            resultsBody.innerHTML = '<tr><td colspan="5" class="no-results"><i class="fa-solid fa-triangle-exclamation"></i> Error connecting to server.</td></tr>';
        }
    }

    // --- RESULT MODAL EVENT LISTENERS ---

    const navResultBtn = Array.from(document.querySelectorAll('.main-nav button'))
        .find(btn => btn.textContent.includes('Result'));

    if (navResultBtn) {
        navResultBtn.addEventListener('click', () => {
            // Open the modal
            resultsModal.style.display = 'flex';
            setTimeout(() => resultsModal.classList.add('show'), 10);

            // Load today's results automatically
            todayBtn.click();
        });
    }

    // Close listeners for the Results Modal
    resultsModalCloseBtn.addEventListener('click', () => {
        resultsModal.classList.remove('show');
        setTimeout(() => resultsModal.style.display = 'none', 300);
    });
    resultsModal.addEventListener('click', (e) => {
        if (e.target === resultsModal) {
            resultsModal.classList.remove('show');
            setTimeout(() => resultsModal.style.display = 'none', 300);
        }
    });

    // Filter Listeners
    todayBtn.addEventListener('click', () => {
        const today = getTodayDateString();
        dateFilter.value = today; // Set the filter control
        fetchAndDisplayResults(today);
    });

    dateFilter.addEventListener('change', (e) => {
        fetchAndDisplayResults(e.target.value);
    });

    spotInputs.forEach(input => {
        input.addEventListener('input', calculateTotals);
        input.addEventListener('change', calculateTotals);
    });

    // --- 6. Button Logic (Reset, Refresh) ---
    function resetSelections() {
        spotInputs.forEach(input => {
            input.value = '';
            input.classList.remove('has-value');
        });
        calculateTotals();
    }
    resetBtn.addEventListener('click', resetSelections);
    refreshBtn.addEventListener('click', () => { location.reload(); });

    // --- LOGOUT LOGIC ---
    const logoutBtn = document.querySelector('.main-nav button.logout');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            // 1. Clear session storage (user data for this session)
            sessionStorage.clear();
            localStorage.removeItem('rememberedUser');

            // 3. Redirect to the login page
            window.location.href = '../index.html';
        });
    }

    // --- 7. Submit Modal Logic (NEW WORKFLOW) ---
    submitBtn.addEventListener('click', () => {
        const totalSpots = parseInt(totalSpotsElement.textContent);
        if (totalSpots <= 0) {
            alert('Please select at least one spot!');
            return;
        }

        spotInputs.forEach(input => input.disabled = true); // Disable inputs
        modal.style.display = 'flex';

        const username = sessionStorage.getItem('username');
        const userId = parseInt(sessionStorage.getItem('userId')) || 0;
        const totalAmount = parseFloat(totalAmountElement.textContent.replace('₹', ''));
        const spotPrice = 10;
        const formattedUserId = `S${900 + userId}`;
        const storeName = `${username.toUpperCase()} SKILL GAME CENTER`;

        const now = new Date();
        const timeSinceEpochMs = now.getTime();
        const timeRemainingMs = DRAW_DURATION_MS - (timeSinceEpochMs % DRAW_DURATION_MS);
        const drawEndTimeMs = timeSinceEpochMs + timeRemainingMs;
        const drawEndTime = new Date(drawEndTimeMs);
        const timestamp = now.toLocaleString('en-IN', {
            day: '2-digit', month: 'short', year: 'numeric',
            hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true
        });
        const drawId = `${drawEndTime.getFullYear()}${(drawEndTime.getMonth() + 1).toString().padStart(2, '0')}${drawEndTime.getDate().toString().padStart(2, '0')}${drawEndTime.getHours().toString().padStart(2, '0')}${drawEndTime.getMinutes().toString().padStart(2, '0')}`;

        let receiptHTML = `<div class="ticket-receipt">`;
        receiptHTML += `<div class="header">${storeName}</div>`;
        receiptHTML += `<div class="divider"></div>`;
        receiptHTML += `<div class="info-line"><span>ID: ${formattedUserId}</span> <span>${timestamp}</span></div>`;
        // ADDED THE ID HERE:
        receiptHTML += `<div class="info-line"><span>DRAW ID: ${drawId}</span> <span id="ticket-id-display">TICKET: Pending...</span></div>`;
        receiptHTML += `<table><thead><tr><th class="col-spot">SPOT</th><th class="col-qty">QTY</th><th class="col-amt">AMOUNT</th></tr></thead><tbody>`;

        spotInputs.forEach(input => {
            const value = parseInt(input.value) || 0;
            if (value > 0) {
                const spotName = input.dataset.spot;
                const spotTotal = spotPrice * value;
                receiptHTML += `<tr><td class="col-spot">${spotName}</td><td class="col-qty">${value}</td><td class="col-amt">₹${spotTotal.toFixed(2)}</td></tr>`;
            }
        });

        receiptHTML += `</tbody></table>`;
        receiptHTML += `<div class="total-line"><span>TOTAL:</span> ₹${totalAmount.toFixed(2)}</div>`;
        receiptHTML += `</div>`;

        ticketDetailsContent.innerHTML = receiptHTML;

        // Reset buttons to initial state
        modalConfirmBtn.style.display = 'inline-block';
        modalPrintBtn.style.display = 'none';
        modalConfirmBtn.disabled = false;

        modal.style.display = 'flex';
        setTimeout(() => modal.classList.add('show'), 10);
    });

    // THIS IS THE NEW CLOSE MODAL LOGIC
    function closeModal() {
        modal.classList.remove('show');
        setTimeout(() => {
            modal.style.display = 'none';
            spotInputs.forEach(input => input.disabled = false); // Re-enable inputs
            if (modalPrintBtn.style.display === 'inline-block') {
                resetSelections();
            }
        }, 300);
    }
    modalCloseBtn.addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => {
        if (e.target === modal) closeModal();
    });


    async function fetchTicketHistory(dateString) {
        const username = sessionStorage.getItem('username');
        ticketTableBody.innerHTML = '<tr><td colspan="6" class="no-results"><i class="fa-solid fa-spinner fa-spin"></i> Loading tickets...</td></tr>';

        try {
            const result = await window.electronAPI.getTicketHistory(username, dateString);

            if (result.success && result.tickets.length > 0) {
                let html = '';

                // Current time for comparison
                const now = new Date();

                result.tickets.forEach(ticket => {
                    // Format Time
                    const time = new Date(ticket.created_at).toLocaleString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });

                    // --- NEW LOGIC: CHECK TIME LIMIT ---
                    const drawEndTime = new Date(ticket.end_time);
                    const timeDiffMs = drawEndTime - now;
                    const minutesRemaining = timeDiffMs / 1000 / 60;

                    // Create Delete Button HTML ONLY if > 1 minute remains
                    let deleteButtonHtml = '';

                    // If draw is in future AND more than 1 minute remains
                    if (minutesRemaining > 1) {
                        deleteButtonHtml = `
                        <button onclick="window.deleteTicket(${ticket.ticket_id})" 
                                style="padding: 5px 10px; background-color: var(--accent-red); border: none; border-radius: 4px; color: white; cursor: pointer;"
                                title="Delete Ticket">
                            <i class="fa-solid fa-trash"></i>
                        </button>
                    `;
                    } else {
                        // Optional: Show a locked icon or nothing
                        deleteButtonHtml = `<span style="color: #777; font-size: 0.9rem;"><i class="fa-solid fa-lock"></i> Locked</span>`;
                    }
                    // -----------------------------------

                    html += `
                <tr>
                    <td>${ticket.ticket_id}</td>
                    <td>${ticket.draw_id}</td>
                    <td style="font-weight: bold; color: var(--accent-green);">₹${parseFloat(ticket.total_amount).toFixed(2)}</td>
                    <td>${time}</td>
                    <td>
                        <button class="reprint-btn" data-ticket='${JSON.stringify(ticket)}' style="padding: 5px 10px; margin-right:5px; background-color: var(--accent-orange); border: none; border-radius: 4px; color: white; cursor: pointer;">
                            <i class="fa-solid fa-print"></i>
                        </button>
                        ${deleteButtonHtml}
                    </td>
                </tr>
                `;
                });
                ticketTableBody.innerHTML = html;

                // Re-attach listeners for reprint buttons
                document.querySelectorAll('.reprint-btn').forEach(btn => {
                    btn.addEventListener('click', (e) => {
                        const ticketData = JSON.parse(e.currentTarget.dataset.ticket);
                        reprintTicket(ticketData);
                    });
                });

            } else {
                ticketTableBody.innerHTML = '<tr><td colspan="6" class="no-results">No tickets found for this date.</td></tr>';
            }
        } catch (err) {
            console.error("Error:", err);
            ticketTableBody.innerHTML = '<tr><td colspan="6" class="no-results">Error loading data.</td></tr>';
        }
    }

    // Function to handle re-printing (Reuse your receipt logic here!)
    function reprintTicket(ticket) {
        // ... (You can copy/paste your receipt HTML generation logic here) ...
        // For now, a simple alert to prove it works:
        alert(`Reprinting Ticket #${ticket.ticket_id}...`);

        // TODO: Call window.electronAPI.printTicket(html) with reconstructed HTML
    }

    // --- TICKET HISTORY LISTENERS ---

    // 1. "Re-Print" Button in Nav
    const navReprintBtn = Array.from(document.querySelectorAll('.main-nav button'))
        .find(btn => btn.textContent.includes('Re-Print'));

    if (navReprintBtn) {
        navReprintBtn.addEventListener('click', () => {
            ticketModal.style.display = 'flex';
            setTimeout(() => ticketModal.classList.add('show'), 10);
            ticketTodayBtn.click(); // Load today's data
        });
    }

    // 2. "Account" Button (Same function for now)
    const navAccountBtn = Array.from(document.querySelectorAll('.main-nav button'))
        .find(btn => btn.textContent.includes('Account'));

    if (navAccountBtn) {
        navAccountBtn.addEventListener('click', () => {
            ticketModal.style.display = 'flex';
            setTimeout(() => ticketModal.classList.add('show'), 10);
            ticketTodayBtn.click();
        });
    }

    // 3. Close Modal
    ticketModalCloseBtn.addEventListener('click', () => {
        ticketModal.classList.remove('show');
        setTimeout(() => ticketModal.style.display = 'none', 300);
    });

    // 4. Filters
    ticketTodayBtn.addEventListener('click', () => {
        const today = getTodayDateString();
        ticketDateFilter.value = today;
        fetchTicketHistory(today);
    });

    ticketDateFilter.addEventListener('change', (e) => {
        fetchTicketHistory(e.target.value);
    });
    // --- ACCOUNT MODAL ELEMENTS ---
    const accModal = document.getElementById('account-modal');
    const accModalCloseBtn = document.getElementById('account-modal-close-btn');
    const accDateStart = document.getElementById('acc-date-start');
    const accDateEnd = document.getElementById('acc-date-end');
    const accFetchBtn = document.getElementById('acc-fetch-btn');
    const accTableBody = document.getElementById('account-table-body');
    const accDisplayId = document.getElementById('acc-display-id');
    const accDisplayName = document.getElementById('acc-display-name');

    // --- ACCOUNT FUNCTIONS ---
    async function fetchAccountLedger() {
        const username = sessionStorage.getItem('username');
        const userId = sessionStorage.getItem('userId');
        const startDate = accDateStart.value;
        const endDate = accDateEnd.value;

        // Set Header Info
        accDisplayId.textContent = `S${900 + parseInt(userId)}`;
        accDisplayName.textContent = `${username.toUpperCase()} SKILL GAME CENTER`;

        accTableBody.innerHTML = '<tr><td colspan="3" class="no-results"><i class="fa-solid fa-spinner fa-spin"></i> Calculating...</td></tr>';

        try {
            const result = await window.electronAPI.getAccountLedger(username, startDate, endDate);

            if (result.success) {
                const data = result.data;

                let html = `
                    <tr>
                        <td><strong>Total Sales</strong></td>
                        <td style="font-size: 0.9rem; color: #aaa;">Gross ticket value sold</td>
                        <td style="color: var(--accent-green); font-weight: bold;">₹${data.totalSales.toFixed(2)}</td>
                    </tr>
                    <tr>
                        <td><strong>Retailer Commission</strong></td>
                        <td style="font-size: 0.9rem; color: #aaa;">10% on Sales</td>
                        <td style="color: var(--accent-yellow); font-weight: bold;">₹${data.commission.toFixed(2)}</td>
                    </tr>
                    <tr style="border-top: 2px dashed #555;">
                        <td style="font-size: 1.2rem;"><strong>Net Payable to Admin</strong></td>
                        <td style="font-size: 0.9rem; color: #aaa;">(Sales - Commission)</td>
                        <td style="font-size: 1.4rem; color: var(--accent-orange); font-weight: bold;">₹${data.netToAdmin.toFixed(2)}</td>
                    </tr>
                `;
                accTableBody.innerHTML = html;
            } else {
                accTableBody.innerHTML = '<tr><td colspan="3" class="no-results">Error loading data.</td></tr>';
            }
        } catch (err) {
            console.error(err);
            accTableBody.innerHTML = '<tr><td colspan="3" class="no-results">Connection error.</td></tr>';
        }
    }

    // --- ACCOUNT LISTENERS ---

    // 1. "Account" Button in Nav (Update existing listener)
    if (navAccountBtn) {
        navAccountBtn.addEventListener('click', () => {
            // Close Ticket Modal if open
            ticketModal.style.display = 'none';
            ticketModal.classList.remove('show');

            // Open Account Modal
            accModal.style.display = 'flex';
            setTimeout(() => accModal.classList.add('show'), 10);

            // Default: Set date to today and fetch
            const today = getTodayDateString();
            accDateStart.value = today;
            accDateEnd.value = today;
            fetchAccountLedger();
        });
    }

    // 2. Fetch Button
    accFetchBtn.addEventListener('click', fetchAccountLedger);

    // 3. Close Modal
    accModalCloseBtn.addEventListener('click', () => {
        accModal.classList.remove('show');
        setTimeout(() => accModal.style.display = 'none', 300);
    });

    accModal.addEventListener('click', (e) => {
        if (e.target === accModal) {
            accModal.classList.remove('show');
            setTimeout(() => accModal.style.display = 'none', 300);
        }
    });

    // THIS IS THE NEW CONFIRM BUTTON LOGIC
    modalConfirmBtn.addEventListener('click', async () => {
        modalConfirmBtn.disabled = true; // Prevent double-clicks

        const username = sessionStorage.getItem('username');
        const totalAmount = parseFloat(totalAmountElement.textContent.replace('₹', ''));
        const now = new Date();
        const timeSinceEpochMs = now.getTime();
        const timeRemainingMs = DRAW_DURATION_MS - (timeSinceEpochMs % DRAW_DURATION_MS);
        const drawEndTimeMs = timeSinceEpochMs + timeRemainingMs;
        const drawEndTime = new Date(drawEndTimeMs);
        const betDetails = {};
        spotInputs.forEach(input => {
            const value = parseInt(input.value) || 0;
            if (value > 0) betDetails[input.dataset.spot] = value;
        });
        const ticketData = {
            username: username, totalAmount: totalAmount,
            betDetails: betDetails, drawEndTime: drawEndTime
        };

        try {
            const result = await window.electronAPI.submitTicket(ticketData);

            if (result.success) {
                // Update balance
                const balanceElement = document.getElementById('display-balance');
                const newBalanceFormatted = parseFloat(result.newBalance).toFixed(2);
                balanceElement.textContent = `₹ ${newBalanceFormatted}`;
                sessionStorage.setItem('balance', result.newBalance);

                // Update ticket ID on receipt
                document.getElementById('ticket-id-display').textContent = `TICKET: ${result.newTicketId}`;

                // Swap buttons
                modalConfirmBtn.style.display = 'none';
                modalPrintBtn.style.display = 'inline-block';

            } else {
                alert(`Error: ${result.message}`);
                modalConfirmBtn.disabled = false; // Re-enable on failure
            }
        } catch (err) {
            console.error('Error submitting ticket:', err);
            alert('A critical error occurred. Please restart the application.');
            modalConfirmBtn.disabled = false; // Re-enable on failure
        }
    });

    // Print button logic (this was already correct)
    modalPrintBtn.addEventListener('click', () => {
        const receiptHtml = document.getElementById('ticket-details-content').innerHTML;
        const printCss = `
            <style>
                body { font-family: 'Courier New', Courier, monospace; color: #000; margin: 0; width: 300px; }
                .ticket-receipt { padding: 0; }
                .divider { border-top: 2px dashed #000; margin: 10px 0; }
                .header { text-align: center; font-size: 1.1rem; font-weight: bold; }
                .info-line { display: flex; justify-content: space-between; font-size: 0.85rem; }
                table { width: 100%; border-collapse: collapse; font-size: 0.95rem; }
                th { border-top: 2px dashed #000; border-bottom: 2px dashed #000; }
                .col-spot { text-align: left; } .col-qty { text-align: center; } .col-amt { text-align: right; }
                .total-line { font-size: 1.4rem; font-weight: bold; text-align: right; border-top: 2px dashed #000; padding-top: 10px; margin-top: 5px; }
                .total-line span { font-size: 1rem; }
            </style>
        `;
        const completeHtml = `<html><head><title>Print Receipt</title>${printCss}</head><body>${receiptHtml}</body></html>`;
        window.electronAPI.printTicket(completeHtml);
    });

    // Make this function global or accessible
    window.deleteTicket = async function (ticketId) {
        if (!confirm("Are you sure you want to DELETE this ticket? Amount will be refunded.")) {
            return;
        }

        const username = sessionStorage.getItem('username');

        try {
            // Use the new electronAPI we created in preload.js
            const result = await window.electronAPI.cancelTicket(ticketId, username);

            if (result.success) {
                alert('✅ ' + result.message);

                // 1. Update Balance on Screen
                const balanceElement = document.getElementById('display-balance');
                const newBalanceFormatted = parseFloat(result.newBalance).toFixed(2);
                balanceElement.textContent = `₹ ${newBalanceFormatted}`;
                sessionStorage.setItem('balance', result.newBalance);

                // 2. Refresh the table
                const todayBtn = document.getElementById('ticket-today-btn');
                if (todayBtn) todayBtn.click();

            } else {
                alert('❌ ' + result.message);
            }
        } catch (err) {
            console.error(err);
            alert('System error during cancellation.');
        }
    };

    // --- 8. Keyboard & Claim Logic (Unchanged) ---
    document.addEventListener('keydown', (e) => {
        if (e.key === 'F6') { e.preventDefault(); submitBtn.click(); }
        if (e.key === 'F8') { e.preventDefault(); resetBtn.click(); }
    });
    claimBtn.addEventListener('click', () => {
        const barcode = barcodeInput.value.trim();
        if (barcode) {
            alert(`Processing claim for barcode: ${barcode}`);
            barcodeInput.value = '';
        } else {
            alert('Please enter or scan a barcode!');
        }
    });

    // --- 9. Initial Load ---
    calculateTotals();
    loadUserData();
    window.electronAPI.getLatestResults().then(res => {
        if (res.success) updateTopSpotsUI(res.results);
    });

    // Start the timer
    setInterval(updateTimers, 1000);
    updateTimers(); // Run once immediately
});