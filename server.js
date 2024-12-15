const express = require('express');
const https = require('https');
const fs = require('fs');
const path = require('path');

const app = express();

// Add CORS headers
app.use((req, res, next) => {
  const allowedOrigins = ['https://trello.com', 'https://dmitchell6.github.io', 'https://localhost:8000'];
  const origin = req.headers.origin;
  if (allowedOrigins.includes(origin)) {
    res.header('Access-Control-Allow-Origin', origin);
  }
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  next();
});

// Serve static files from the 'public' directory
app.use(express.static('public'));

// Basic routing
app.get("*", function (request, response) {
  response.sendFile(path.join(__dirname, 'public/index.html'));
});

// Add this before the basic routing
app.get('/api/get-lists', async (req, res) => {
  const apiKey = process.env.TRELLO_API_KEY;
  const token = process.env.TRELLO_TOKEN; // Ensure you have this token stored securely
  const boardId = req.query.boardId;

  try {
    const response = await fetch(`https://api.trello.com/1/boards/${boardId}/lists?key=${apiKey}&token=${token}`);
    const data = await response.json();
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch lists from Trello.' });
  }
});

// HTTPS configuration
const httpsOptions = {
  key: fs.readFileSync(path.join(__dirname, 'certs/server.key')),
  cert: fs.readFileSync(path.join(__dirname, 'certs/server.cert'))
};

// Create HTTPS server
const port = process.env.PORT || 8000;
https.createServer(httpsOptions, app).listen(port, () => {
  console.log(`Server is running on https://localhost:${port}`);
});
