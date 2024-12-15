/* global TrelloPowerUp */

var t = TrelloPowerUp.iframe({
  appKey: window.TrelloConfig.apiKey,
  appName: 'Weekly Report III',
  secret: window.TrelloConfig.secret
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
  const startDate = new Date(document.getElementById('start-date').value);
  const endDate = new Date(document.getElementById('end-date').value);
  
  try {
    // Get all lists on the board
    const lists = await t.board('all');
    const doneList = lists.find(list => list.name === 'Done');
    
    if (!doneList) {
      throw new Error('No "Done" list found');
    }
    
    // Get cards in the Done list
    const cards = await t.cards('all');
    const completedCards = cards.filter(card => {
      const movedDate = new Date(card.dateLastActivity);
      return card.idList === doneList.id && 
             movedDate >= startDate && 
             movedDate <= endDate;
    });
    
    displayReport(completedCards);
  } catch (error) {
    console.error('Error generating report:', error);
    document.getElementById('report-content').innerHTML = 
      `<div class="error">Error generating report: ${error.message}</div>`;
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