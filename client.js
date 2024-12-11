/* globals window, TrelloPowerUp, fetch */

const DEBUG = true;

function debug(...args) {
  if (DEBUG) {
    console.log('[Weekly Report Debug]:', ...args);
  }
}

// Remove hardcoded credentials
const TRELLO_API_KEY = window.TrelloConfig?.apiKey;
const TRELLO_SECRET = window.TrelloConfig?.secret;
let TRELLO_TOKEN;

// Initialize the iframe
const t = window.TrelloPowerUp.iframe({
  secret: TRELLO_SECRET
});

console.log('Iframe initialized successfully');

// Wait for DOM content to be loaded before setting up event listeners
document.addEventListener('DOMContentLoaded', () => {
  // Initialize event listeners
  const generateBtn = document.getElementById('generate-btn');
  const sendEmailBtn = document.getElementById('send-email-btn');

  if (generateBtn) {
    generateBtn.addEventListener('click', generateReport);
  }

  if (sendEmailBtn) {
    sendEmailBtn.addEventListener('click', sendEmailReport);
  }

  // Test connection after DOM is loaded
  testConnection().then((isConnected) => {
    if (isConnected) {
      console.log('Ready to use Trello API');
    } else {
      console.error('Failed to connect to Trello API');
    }
  }).catch(error => {
    console.error('Failed to initialize:', error);
    showError('Failed to initialize Trello Power-Up');
  });
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

// CORS Headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization'
};

// Single definition of trelloGet function
async function trelloGet(endpoint) {
  console.log('Making API request to:', endpoint);
  await rateLimiter.throttle();
  try {
    const token = await authorize();
    if (!token) {
      throw new Error('Failed to get authorization token');
    }
    
    const url = `https://api.trello.com/1/${endpoint}`;
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        ...corsHeaders,
        'Authorization': `OAuth oauth_consumer_key="${TRELLO_API_KEY}", oauth_token="${token}"`,
      },
      credentials: 'include'
    });
    
    if (!response.ok) {
      throw new Error(`Trello API error: ${response.statusText}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error('API request failed:', error);
    throw error;
  }
}

async function authorize() {
  try {
    // Check for existing token
    let token = await t.get('member', 'private', 'token');
    
    // If no token exists, try to authorize
    if (!token) {
      console.log('No existing token found, attempting authorization...');
      token = await t.authorize({
        type: 'popup',
        name: 'Weekly Report Power-Up',
        scope: {
          read: true,
          write: true,
          account: true
        },
        expiration: 'never',
        // Use the signed URL here
        return_url: await t.signUrl('http://192.168.6.124:8000/auth-success.html')  // Ensure this matches your setup
      });
      
      // Store token for future use
      await t.set('member', 'private', 'token', token);
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
    const boardId = await t.board('id');
    const lists = await t.lists('all');
    const cards = await t.cards('all');

    // Get lists from the board
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

    // Hide loading spinner and show report
    showLoading(false);
    document.getElementById('report-container').style.display = 'block';
  } catch (error) {
    console.error('Error generating report:', error);
    showError(error.message);
    showLoading(false);
  }
}

async function sendEmailReport() {
  try {
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
    const response = await fetch('YOUR_API_GATEWAY_URL/sendEmail', {  // Update to your API URL
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ html: reportHTML })
    });

    if (response.ok) {
      alert('Email sent successfully!');
    } else {
      alert('Failed to send email.');
    }
  } catch (error) {
    console.error('Error sending email:', error);
    alert('An error occurred while sending the email.');
  }
}

// Updated testConnection function
async function testConnection() {
  try {
    // First try to get an existing token
    let token = await t.get('member', 'private', 'token');
    
    // If no token exists, try to authorize
    if (!token) {
      console.log('No existing token found, attempting authorization...');
      try {
        token = await authorize();
      } catch (authError) {
        console.error('Authorization attempt failed:', authError);
        throw new Error('Failed to obtain authorization token');
      }
    }

    console.log('Testing connection with API Key:', TRELLO_API_KEY);
    console.log('Testing connection with Token:', token);
    
    if (!TRELLO_API_KEY || !token) {
      throw new Error('API credentials are not properly configured');
    }
    
    const response = await fetch(
      `https://api.trello.com/1/members/me/boards?key=${TRELLO_API_KEY}&token=${token}`
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

function populateReportTable(doneCards, doingCards, startDate, endDate) {
  const tbody = document.querySelector('#report-table tbody');
  tbody.innerHTML = ''; // Clear existing rows

  const allCards = [...doneCards, ...doingCards];

  allCards.forEach(card => {
    const tr = document.createElement('tr');

    const taskName = document.createElement('td');
    taskName.textContent = card.name;
    tr.appendChild(taskName);

    const labels = document.createElement('td');
    labels.textContent = card.labels.map(label => label.name).join(', ');
    tr.appendChild(labels);

    const completedBy = document.createElement('td');
    completedBy.textContent = card.idMembers.map(memberId => {
      const member = window.TrelloPowerUp.iframe().getContext().members.find(m => m.id === memberId);
      return member ? member.fullName : 'Unknown';
    }).join(', ');
    tr.appendChild(completedBy);

    const completionDate = document.createElement('td');
    const date = new Date(card.dateLastActivity);
    completionDate.textContent = date.toLocaleDateString();
    tr.appendChild(completionDate);

    const status = document.createElement('td');
    status.textContent = doneCards.includes(card) ? 'Done' : 'Doing';
    tr.appendChild(status);

    const url = document.createElement('td');
    const link = document.createElement('a');
    link.href = card.url;
    link.textContent = 'View Card';
    link.target = '_blank';
    url.appendChild(link);
    tr.appendChild(url);

    tbody.appendChild(tr);
  });

  // Enable Send Email button if there are tasks
  const sendEmailBtn = document.getElementById('send-email-btn');
  if (allCards.length > 0) {
    sendEmailBtn.disabled = false;
  } else {
    sendEmailBtn.disabled = true;
  }
}
