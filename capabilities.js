window.TrelloPowerUp.initialize({
    'board-buttons': function(t, options) {
      return [{
        icon: {
          dark: '/images/icon-dark.svg',
          light: '/images/icon-light.svg'
        },
        text: 'Weekly Report',
        callback: function(t) {
          return t.modal({
            url: './index.html',
            title: 'Weekly Report',
            height: 600
          });
        }
      }];
    }
  });