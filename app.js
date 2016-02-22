var request = require('request');
var fetchfeed = require('./fetchfeed.js');
var nxws = new fetchfeed();
var feedDict = require('./feeds.json').remote;
var feedNames = Object.keys(feedDict);
var feeds = Object.keys(feedDict).map(function(x) {return feedDict[x]});

var boringList = require('./dict.js');

var boring = function(word) {
  return boringList.indexOf(word.toLowerCase()) !== -1;
}

var isWord = function(word) {
  return /^[a-z]+$/i.test(word);
}

var dict = {};
var dictInsert = function(word, link) {
  if (isWord(word) && !boring(word)) {
    if (!dict[word]) dict[word] = [];
    dict[word].push(link);
  }
};

var wordSort = function(a, b) {
  return a.count - b.count;
}
var topVal = function(val) {
  var counts = Object.keys(dict).map(function(w) {
    return {word: w, count: dict[w].length};
  });
  counts.sort(wordSort).reverse();
  return counts.slice(0, val).map(function(i) {
    return i;
  });
};

var topTen = topVal.bind(this, 15);

var dictWork = function(newItem) {
  newItem.title.split(' ').forEach(function(w) {
    dictInsert(w, newItem.link);
  });
}

var checkNewsInterval;

var REFRESH_DELAY = 15000;

function fetchFeeds(callback) {
  nxws.fetchSourceFromStream(feeds, request, callback);
}

nxws.fetchSourceFromStream(feeds, request, storeArticleDates);
checkNewsInterval = setInterval(function() {
  fetchFeeds(emitArticleIfNew);
}, REFRESH_DELAY);

var mostRecentDateFromFeed = {};
var mostRecentDateRunning = {};

function constructSmallArticle(article) {
  var newItem = {
    title: article.title,
    author: article.author,
    date: new Date(article.date),
    guid: article.guid,
    link: article.link,
    metatitle: article.meta.title,
    metalink: article.meta.link
  };
  
  if (newItem.metalink == null)
    newItem.metalink = newItem.link;
  
  if (newItem.date > new Date())
    newItem.date = new Date();

  return newItem;
}

function storeArticleDates(err, article) {
  if (err) {
    console.error(err);
    return;
  }
  
  if (article.hasOwnProperty('end')) {
    return;
  }
  
  dictWork(article);

  var articleDate = article.date;
  if (mostRecentDateFromFeed[article.meta.title] == null ||
      mostRecentDateFromFeed[article.meta.title] < articleDate) {
    mostRecentDateFromFeed[article.meta.title] = articleDate;
    mostRecentDateRunning[article.meta.title] = articleDate;
  }

  console.log(topTen());
}

function emitArticleIfNew(err, article) {
  if (err) {
    console.error(err);
    return;
  }
  
  if (article.hasOwnProperty('end')) {
    mostRecentDateFromFeed[article.end] = mostRecentDateRunning[article.end];
    return;
  }
  
  var lastArticleSentDate = mostRecentDateFromFeed[article.meta.title];
  if (article.date > lastArticleSentDate) {
    console.log('Emitting:', article.meta.title, '-', article.title, '-', article.date);

    var newItem = constructSmallArticle(article);
    io.emit('nxws items', JSON.stringify([newItem]));

    dictWork(newItem);

    if (newItem.date > mostRecentDateRunning[newItem.metatitle])
      mostRecentDateRunning[newItem.metatitle] = newItem.date;

  }
  
  console.log(topTen());
}

function emitArticle(socket) {
  return function(err, article) {
    if (err) {
      console.error(err);
      return;
    }
  
    if (article.hasOwnProperty('end')) {
      return;
    }
    var newItem = constructSmallArticle(article);
    socket.emit('nxws items', JSON.stringify([newItem]));
  } 
}

/* Server */
var express = require('express');
var app = express();
var http = require('http').Server(app);
var io = require('socket.io')(http);
app.set('port', (process.env.PORT || 9000));

http.listen(app.get('port'), function() {
  console.log("NXWS Feeder is running at localhost:" + app.get('port'));
});

var numberOfUsers = 0;

/* Socket */
io.on('connection', function(socket) {
  numberOfUsers++;
	console.log("User connected", socket.id);
  emitNumberOfUsers(numberOfUsers);
  emitSourceList(feedNames);
  
  if (process.env.EMIT_NOW) {
    console.log('emitting now');
    fetchFeeds(emitArticle(socket));
  }
  
  socket.on('disconnect', function() {
    numberOfUsers--;
  	console.log("User disconnected", socket.id);
    emitNumberOfUsers(numberOfUsers);
  });    
});

/* Broadcasting */
function emitNumberOfUsers(num) {
  console.log('User count', num);
  var numOtherUsers = num === 0 ? 0 : num - 1;
  io.emit('nxws readers', numOtherUsers);
}

function emitSourceList(feedList) {
  io.emit('nxws sources', JSON.stringify(feedList));
}
