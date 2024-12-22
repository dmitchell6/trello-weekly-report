/* global TrelloPowerUp */

var t = TrelloPowerUp.iframe({
  appKey: window.TrelloConfig.apiKey,
  appName: 'Weekly Report III'
});

// Initialize date inputs with current week
window.addEventListener('load', function() {
  const today = new Date();
  const sunday = new Date(today);
  sunday.setDate(today.getDate() - today.getDay());
  
  const nextSunday = new Date(sunday);
  nextSunday.setDate(sunday.getDate() + 7);
  
  document.getElementById('start-date').value = formatDate(sunday);
  document.getElementById('end-date').value = formatDate(nextSunday);
});

function formatDate(date) {
  return date.toISOString().split('T')[0];
}

document.getElementById('generate-report').addEventListener('click', async function() {
  try {
    // Show loading state
    const reportContent = document.getElementById('report-content');
    reportContent.innerHTML = '<div class="loading">Generating report...</div>';

    const startDate = new Date(document.getElementById('start-date').value);
    const endDate = new Date(document.getElementById('end-date').value);
    
    // Validate dates
    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      throw new Error('Please select valid dates');
    }
    if (startDate > endDate) {
      throw new Error('Start date must be before end date');
    }

    // Get board ID from Trello iframe
    const t = TrelloPowerUp.iframe();
    const board = await t.board('id');
    
    // Fetch data from secure server endpoints
    const API_BASE_URL = window.TrelloConfig.apiUrl;
    const [listsResponse, cardsResponse] = await Promise.all([
      fetch(`${API_BASE_URL}/api/lists?boardId=${board.id}`),
      fetch(`${API_BASE_URL}/api/cards?boardId=${board.id}`)
    ]);

    if (!listsResponse.ok || !cardsResponse.ok) {
      throw new Error('Failed to fetch data from server');
    }

    const lists = await listsResponse.json();
    const cards = await cardsResponse.json();

    const doneList = lists.find(list => list.name.toLowerCase() === 'done');
    if (!doneList) {
      throw new Error('No "Done" list found on this board');
    }

    // Filter completed cards
    const completedCards = cards.filter(card => {
      const movedDate = new Date(card.dateLastActivity);
      return card.idList === doneList.id && 
             movedDate >= startDate && 
             movedDate <= endDate;
    });

    await displayReport(completedCards);

  } catch (error) {
    console.error('Error generating report:', error);
    document.getElementById('report-content').innerHTML = 
      `<div class="error">Error: ${error.message}</div>`;
  }
});

function displayReport(cards) {
  const reportHtml = `
    <h3>Completed Tasks (${cards.length})</h3>
    <table>
      <thead>
        <tr>
          <th>Task Name</th>
          <th>Labels</th>
          <th>Completed Date</th>
        </tr>
      </thead>
      <tbody>
        ${cards.map(card => `
          <tr>
            <td>${card.name}</td>
            <td>${card.labels.map(label => label.name).join(', ') || 'No Labels'}</td>
            <td>${new Date(card.dateLastActivity).toLocaleDateString()}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
  
  document.getElementById('report-content').innerHTML = reportHtml;
} 