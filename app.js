var request = require('request');
var express = require('express');
var app = express();
var http = require('http').Server(app);
var io = require('socket.io')(http);
app.set('port', (process.env.PORT || 9000));

var storage = new (require('./storage'))();
var nxws = new (require('./fetchfeed.js'));
var types = require('./types');
var feedDict = require('./feeds.json').remote;
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

nxws.fetchSourceFromStream(feeds, request, storeItem);

/* Server */
http.listen(app.get('port'), function() {
  console.log("NXWS Feeder is running at localhost:" + app.get('port'));
});


/* Socket */
io.on('connection', function(socket) {
  console.log("User connected", socket.id);

  sendAllArticles(socket); // TODO pay attention to route

  socket.on('disconnect', function() {
  	console.log("User disconnected", socket.id);
  });
});
