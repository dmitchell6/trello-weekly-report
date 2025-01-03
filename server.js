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
      'https://localhost:8000',
      'https://trello-weekly-report.herokuapp.com'
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
app.use(express.static(path.join(__dirname, 'public')));

// API Routes
app.get('/api/lists', async (req, res) => {
  const boardId = req.query.boardId;
  try {
    const response = await fetch(
      `https://api.trello.com/1/boards/${boardId}/lists?key=${TRELLO_API_KEY}&token=${TRELLO_TOKEN}`
    );
    if (!response.ok) {
      throw new Error('Trello API request failed');
    }
    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error('Error fetching lists:', error);
    res.status(500).json({ error: 'Failed to fetch lists from Trello' });
  }
});

app.get('/api/cards', async (req, res) => {
  const boardId = req.query.boardId;
  try {
    const response = await fetch(
      `https://api.trello.com/1/boards/${boardId}/cards?key=${TRELLO_API_KEY}&token=${TRELLO_TOKEN}`
    );
    if (!response.ok) {
      throw new Error('Trello API request failed');
    }
    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error('Error fetching cards:', error);
    res.status(500).json({ error: 'Failed to fetch cards from Trello' });
  }
});

// Catch-all Route
app.get("*", function (request, response) {
  response.sendFile(path.join(__dirname, 'public/index.html'));
});

// HTTPS Configuration
async function setupServer() {
  let server;
  
  if (process.env.NODE_ENV === 'production') {
    // In production (Heroku), use regular HTTP since Heroku handles SSL/TLS
    server = app;
  } else {
    // Development only - use HTTPS
    const devCerts = require('./config/development-certs');
    server = https.createServer(devCerts, app);
  }

  const PORT = process.env.PORT || 8000;
  server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
  });
}

// Start Server
setupServer().catch(error => {
  console.error('Failed to start server:', error);
  process.exit(1);
});
