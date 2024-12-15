const express = require('express');
const https = require('https');
const fs = require('fs');
const path = require('path');

const app = express();

// Add CORS headers
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', 'https://trello.com');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  next();
});

// Serve static files from the 'public' directory
app.use(express.static('public'));

// Basic routing
app.get("*", function (request, response) {
  response.sendFile(path.join(__dirname, 'views/index.html'));
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
