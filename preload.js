// preload.js
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    login: (username, password) => ipcRenderer.invoke('login', username, password),
    submitTicket: (ticketData) => ipcRenderer.invoke('submit-ticket', ticketData),
    printTicket: (receiptHtml) => ipcRenderer.send('print-ticket', receiptHtml),

    getLatestResults: () => ipcRenderer.invoke('get-latest-results'),
    getFilteredResults: (dateString) => ipcRenderer.invoke('get-filtered-results', dateString),
    getTicketHistory: (username, dateString) => ipcRenderer.invoke('get-ticket-history', username, dateString),
    getAccountLedger: (username, startDate, endDate) => ipcRenderer.invoke('get-account-ledger', username, startDate, endDate),
    cancelTicket: (ticketId, username) => ipcRenderer.invoke('cancel-ticket', ticketId, username)
});