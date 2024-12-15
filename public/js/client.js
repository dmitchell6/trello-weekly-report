/* global TrelloPowerUp */

var Promise = TrelloPowerUp.Promise;

var BLACK_ROCKET_ICON = 'https://cdn.glitch.com/1b42d7fe-bda8-4af8-a6c8-eff0cea9e08a%2Frocket-ship.png?1494946700421';

window.TrelloPowerUp.initialize({
  'board-buttons': function(t, options) {
    return [{
      icon: {
        dark: BLACK_ROCKET_ICON,
        light: BLACK_ROCKET_ICON
      },
      text: 'Weekly Report',
      callback: function(t) {
        return t.modal({
          title: 'Weekly Report III',
          url: t.signUrl('./report.html'),
          height: 500
        });
      }
    }];
  }
}, {
  appKey: TrelloConfig.apiKey,
  appName: 'Weekly Report III',
  appAuthor: 'Demarcus Mitchell'
});
