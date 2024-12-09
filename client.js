/* globals window, TrelloPowerUp, fetch */

const t = window.TrelloPowerUp.iframe();

// Initialize API credentials
let TRELLO_API_KEY;
let TRELLO_TOKEN;

// Get API credentials when iframe is ready
t.get('member', 'private', 'appKey')
  .then(key => {
    TRELLO_API_KEY = key;
    console.log('API Key loaded:', TRELLO_API_KEY);
    return t.get('member', 'private', 'token');
  })
  .then(token => {
    TRELLO_TOKEN = token;
    console.log('Token loaded:', TRELLO_TOKEN);
    // Now that we have the credentials, test the connection
    return testConnection();
  })
  .catch(error => {
    console.error('Failed to load API credentials:', error);
    showError('Failed to load API credentials');
  });

// Rate limiter for API calls
const rateLimiter = {
  lastCall: 0,
  minInterval: 100, // milliseconds between calls
  
  async throttle() {
    const now = Date.now();
    const timeSinceLastCall = now - this.lastCall;
    
    if (timeSinceLastCall < this.minInterval) {
      await new Promise(resolve => 
        setTimeout(resolve, this.minInterval - timeSinceLastCall)
      );
    }
    
    this.lastCall = Date.now();
  }
};

// Enable Power-Up debugging
window.TrelloPowerUp.Promise.all = async function(...args) {
  console.log('Promise.all args:', args);
  const result = await Promise.all(...args);
  console.log('Promise.all result:', result);
  return result;
};

// Single definition of trelloGet function
async function trelloGet(endpoint) {
  console.log('Making API request to:', endpoint);
  await rateLimiter.throttle();
  try {
    // Get token dynamically
    const token = await authorize();
    if (!token) {
      throw new Error('Failed to get authorization token');
    }
    
    const url = `https://api.trello.com/1/${endpoint}?token=${token}`;
    console.log('Full URL:', url);
    const response = await fetch(url);
    if (!response.ok) {
      console.error('API error:', response.statusText);
      throw new Error(`Trello API error: ${response.statusText}`);
    }
    const data = await response.json();
    console.log('API response:', data);
    return data;
  } catch (error) {
    console.error('API request failed:', error);
    throw error;
  }
}

// Existing event listeners and functions
document.getElementById('generate-btn').addEventListener('click', generateReport);
document.getElementById('send-email-btn').addEventListener('click', sendEmailReport);

async function authorize() {
  try {
    // Check for existing token
    let token = await t.arg('token');
    
    if (!token) {
      // Request new token if none exists
      token = await t.authorize('https://trello.com', {
        scope: 'read,account',
        expiration: 'never',
        name: 'Weekly Report Power-Up'
      });
      
      // Store token for future use
      await t.arg('token', token);
    }
    
    return token;
  } catch (error) {
    console.error('Authorization error:', error);
    throw new Error('Failed to authorize with Trello');
  }
}

async function generateReport() {
  try {
    console.log('Generate button clicked');
    showLoading(true);

    const startDate = document.getElementById('start-date').value;
    const endDate = document.getElementById('end-date').value;

    if (!startDate || !endDate) {
      throw new Error('Please select both start and end dates');
    }

    console.log('Fetching tasks between:', startDate, 'and', endDate);
    
    // Get the current board ID from Trello context
    const context = await t.getContext();
    const boardId = context.board;
    
    // Get lists from the board
    const lists = await trelloGet(`boards/${boardId}/lists?cards=none`);
    console.log('Lists:', lists);
    
    const doneList = lists.find(l => l.name.toLowerCase() === 'done');
    const doingList = lists.find(l => l.name.toLowerCase() === 'doing');

    if (!doneList || !doingList) {
      throw new Error('Could not find "Done" or "Doing" lists on this board');
    }

    // Get cards from both lists
    const doneCards = await trelloGet(`lists/${doneList.id}/cards`);
    const doingCards = await trelloGet(`lists/${doingList.id}/cards`);
    
    console.log('Done cards:', doneCards);
    console.log('Doing cards:', doingCards);

    // Populate the report table
    populateReportTable(doneCards, doingCards, startDate, endDate);

    // Show the report container
    document.getElementById('report-container').style.display = 'block';

  } catch (error) {
    console.error('Error generating report:', error);
    showError(error.message);
  } finally {
    showLoading(false);
  }
}

function populateReportTable(doneCards, doingCards, startDate, endDate) {
  const tbody = document.querySelector('#report-table tbody');
  tbody.innerHTML = ''; // Clear existing rows

  const allCards = [...doneCards, ...doingCards];

  allCards.forEach(card => {
    const tr = document.createElement('tr');

    // Task Name
    const nameTd = document.createElement('td');
    nameTd.textContent = card.name;
    tr.appendChild(nameTd);

    // Labels
    const labelsTd = document.createElement('td');
    labelsTd.textContent = card.labels.map(label => label.name).join(', ');
    tr.appendChild(labelsTd);

    // Completed By (Assuming 'memberCreator' has the info)
    const completedByTd = document.createElement('td');
    completedByTd.textContent = card.memberCreator ? card.memberCreator.fullName : 'N/A';
    tr.appendChild(completedByTd);

    // Completion Date
    const completionDateTd = document.createElement('td');
    completionDateTd.textContent = card.due ? new Date(card.due).toLocaleDateString() : 'N/A';
    tr.appendChild(completionDateTd);

    // Status
    const statusTd = document.createElement('td');
    statusTd.textContent = card.closed ? 'Done' : 'Doing';
    tr.appendChild(statusTd);

    // URL
    const urlTd = document.createElement('td');
    const urlLink = document.createElement('a');
    urlLink.href = card.shortUrl;
    urlLink.textContent = 'View';
    urlLink.target = '_blank';
    urlTd.appendChild(urlLink);
    tr.appendChild(urlTd);

    tbody.appendChild(tr);
  });

  // Enable Send Email button if there are tasks
  const sendEmailBtn = document.getElementById('send-email-btn');
  sendEmailBtn.disabled = allCards.length === 0;
}

async function sendEmailReport() {
  const tableHTML = document.getElementById('report-table').outerHTML;
  const startDate = document.getElementById('start-date').value;
  const endDate = document.getElementById('end-date').value;

  const reportHTML = `
  <html>
    <body>
      <h2>Weekly Trello Report</h2>
      <p><strong>Reporting Period:</strong> ${startDate} to ${endDate}</p>
      ${tableHTML}
    </body>
  </html>
  `;

  // Replace YOUR_API_GATEWAY_URL with your actual API Gateway endpoint
  const response = await fetch('YOUR_API_GATEWAY_URL/sendEmail', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ html: reportHTML })
  });

  if (response.ok) {
    alert('Email sent successfully!');
  } else {
    alert('Failed to send email.');
  }
}

// Updated testConnection function
async function testConnection() {
  try {
    console.log('Testing connection with API Key:', TRELLO_API_KEY);
    console.log('Testing connection with Token:', TRELLO_TOKEN);
    
    if (!TRELLO_API_KEY || !TRELLO_TOKEN) {
      throw new Error('API credentials are not properly configured');
    }
    
    const response = await fetch(
      `https://api.trello.com/1/members/me/boards?key=${TRELLO_API_KEY}&token=${TRELLO_TOKEN}`
    );
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const data = await response.json();
    console.log('Connection successful!', data);
    return true;
  } catch (error) {
    console.error('Connection failed:', error.message);
    showError('Failed to connect to Trello API: ' + error.message);
    return false;
  }
}

// Call it when the page loads
window.addEventListener('load', async () => {
  const isConnected = await testConnection();
  if (isConnected) {
    console.log('Ready to use Trello API');
  } else {
    console.error('Failed to connect to Trello API');
  }
});

// Helper functions
function showError(message) {
  const errorDiv = document.querySelector('.error-message');
  const errorText = errorDiv.querySelector('.error-text');
  errorText.textContent = message;
  errorDiv.style.display = 'block';
  setTimeout(() => {
    errorDiv.style.display = 'none';
  }, 5000);
}

function showLoading(show) {
  document.querySelector('.loading-spinner').style.display = show ? 'block' : 'none';
}
