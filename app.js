var request = require('request');
var express = require('express');
var fs = require('fs');
var app = express();
var http = require('http').Server(app);
var io = require('socket.io')(http);
app.set('port', (process.env.PORT || 9000));

var storage = new (require('./storage'))();
var nxws = new (require('./fetchfeed.js'));
var types = require('./types');
var feedDict = require('./feeds.json').local;
var feeds = Object.keys(feedDict).map(function(x) {return feedDict[x]});

function storeItem(err, item) {
  if (err) {
    console.log(err)
    return;
  }

  if (item !== false) {
    const article = types.makeArticle(item);
    storage.add(article);
  }
}

function sendAllArticles(socket) {
  storage.getAll().then(list => {
    for (const item of list) {
      socket.emit('nxws items', JSON.stringify(item));
    }
  });
}

function sendTopWords(socket) {
  // storage.getTopWords(10).then(x => console.log('top words', x))
  storage.getTopWords(10).then(list => {
    socket.emit('nxws top10', JSON.stringify(list.map(x => {
      return {word: x};
    })));
  });
}

var initialisedNewsDB = false;

function broadcastArticle(article) {
  if (initialisedNewsDB) {
    console.log('new article received', article);
    io.emit('nxws items', JSON.stringify(newItem));
  }
}

storage.setListener(broadcastArticle.bind(this));

function fetchNews() {
  nxws.fetchSourceFromStream(feeds, fs.createReadStream, storeItem);
  // storage.getTopWords(10).then(x => console.log('top words', x))
}

setInterval(fetchNews, 10000);

/* Server */
http.listen(app.get('port'), function() {
  console.log("NXWS Feeder is running at localhost:" + app.get('port'));
});


/* Socket */
io.on('connection', function(socket) {
  console.log("User connected", socket.id);

  sendAllArticles(socket); // TODO pay attention to route
  sendTopWords(socket);

  socket.on('disconnect', function() {
  	console.log("User disconnected", socket.id);
  });
});
