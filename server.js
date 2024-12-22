const express = require('express');
const https = require('https');
const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');
const helmet = require('helmet');
const cors = require('cors');

const app = express();
require('dotenv').config();

// Environment variables
const TRELLO_API_KEY = process.env.TRELLO_API_KEY;
const TRELLO_TOKEN = process.env.TRELLO_TOKEN;

// Add security middleware
app.use(helmet());

// CORS configuration
const corsOptions = {
  origin: function (origin, callback) {
    const allowedOrigins = [
      'https://trello.com',
      'https://dmitchell6.github.io',
      process.env.NODE_ENV === 'development' ? 'https://localhost:8000' : null
    ].filter(Boolean);
    
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
};

app.use(cors(corsOptions));

// Serve static files from the 'public' directory
app.use(express.static('public'));

// Basic routing
app.get("*", function (request, response) {
  response.sendFile(path.join(__dirname, 'public/index.html'));
});

// Secure API endpoints
app.get('/api/board-data', async (req, res) => {
  const boardId = req.query.boardId;
  try {
    const response = await fetch(
      `https://api.trello.com/1/boards/${boardId}?key=${TRELLO_API_KEY}&token=${TRELLO_TOKEN}`
    );
    const data = await response.json();
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch board data' });
  }
});

app.get('/api/cards', async (req, res) => {
  const boardId = req.query.boardId;
  try {
    const response = await fetch(
      `https://api.trello.com/1/boards/${boardId}/cards?key=${TRELLO_API_KEY}&token=${TRELLO_TOKEN}`
    );
    const data = await response.json();
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch cards' });
  }
});

// HTTPS configuration
let server;
if (process.env.NODE_ENV === 'production') {
  // In production, use proper certificate management service
  const certManager = require('./utils/certManager');
  const { key, cert } = await certManager.getCertificates();
  server = https.createServer({ key, cert }, app);
} else {
  // Development only
  const devCerts = require('./config/development-certs');
  server = https.createServer(devCerts, app);
}

// Create HTTPS server
const port = process.env.PORT || 8000;
server.listen(port, () => {
  console.log(`Server is running on https://localhost:${port}`);
});
