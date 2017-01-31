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
  // nxws.fetchSourceFromStream(feeds, fs.createReadStream, storeItem);
  nxws.fetchSourceFromStream(feeds, request, storeItem);
  // storage.getTopWords(10).then(x => console.log('top words', x))
}

setInterval(fetchNews, 10000);

/* Server */
http.listen(app.get('port'), function() {
  console.log("NXWS Feeder is running at localhost:" + app.get('port'));
});

app.use(function(req, res, next) {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
  next();
});

const DEFAULTS = {
  NUM_ITEMS: 30,
  NUM_ITEMS_MORE: 5,
  NUM_TAGS: 10,
}

app.use(function(req, res, next) {
  this.numItems = parseInt(req.query.n) || DEFAULTS.NUM_ITEMS;
  this.oldest = req.query.oldest || null;
  next();
})

app.get('/', function(req, res) {
  let p = null;
  if (!this.oldest) {
    p = storage.getAll(DEFAULTS.NUM_ITEMS);
  } else {
    p = storage.getNAfterAll(DEFAULTS.NUM_ITEMS_MORE, this.oldest);
  }
  let tw = storage.getTopWords(DEFAULTS.NUM_TAGS);
  Promise.all([p, tw])
    .then((data) => {
      res.json({items: data[0], tags: data[1], currentTag: ''})
    })
});

app.get('/items/:tag', function(req, res) {
  let p = null;
  if (!this.oldest) {
    p = storage.getAllWithTag(req.params.tag, DEFAULTS.NUM_ITEMS);
  } else {
    p = storage.getNAfterAllWithTag(req.params.tag, DEFAULTS.NUM_ITEMS_MORE, this.oldest);
  }

  let tw = storage.getTopWords(DEFAULTS.NUM_TAGS);
  Promise.all([p, tw])
    .then((data) => {
      res.json({items: data[0], tags: data[1], currentTag: req.params.tag || ''})
    })
});

app.get('/tags', function(req, res) {
  storage.getTopWords(DEFAULTS.NUM_TAGS).then(data => res.json({tags: data}));
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
