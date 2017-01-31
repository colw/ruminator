"use strict";

const util = require('util');
var redis = require("redis"),
	crypto = require('crypto'),
	stopwords = require('./dict');
	// stopwords = require('./natural/lib/natural/util/stopwords').words;

var natural = require('natural');
natural.PorterStemmer.attach();
let tokenizer = new natural.WordTokenizer();

// var WordPOS = require('wordpos');
// wordpos = new WordPOS({stopwords: true});

var WordPOS = require('wordpos'),
    wordpos = new WordPOS({stopwords: true});
// wordpos.isAdjective('fast', console.log);

// console.log("i am waking up to the sounds of chainsaws".tokenizeAndStem());
// console.log("chainsaws".stem());

// natural.LancasterStemmer.attach();
// console.log("i am waking up to the sounds of chainsaws".tokenizeAndStem());
// console.log("chainsaws".stem());

// process.exit();

let storage_constants = {
	ALL: "*",
	COUNT: "*count"
}

module.exports = class Storage {

	constructor() {
		this.store = redis.createClient(process.env.REDIS_URL)
		this.store.on('connect', () => { console.log('Connected') })
		this.store.on("error", function (err) {
			console.log(err)
		});
	}

	setListener(fn) {
		this.newItemListener = fn ? fn : () => {};
	}

	broadcastArticle(article) {
		this.newItemListener(article);
	}

	DBResolve(DBMethod, item, ...params) {
		return new Promise((resolve, reject) => {
			DBMethod(...params, (err, result) => {
				// console.log('result', result);
				if (err) {
					console.log('err', result, item);
					return reject(err);
				}
				return resolve(item);
			});
		});
	}

	_dbAddItemToSortedSet(item, hash) {
		const score = (new Date(item.date)).getTime();
		const value = item.itemID;
		return this.DBResolve(this.store.zadd.bind(this.store), item,
			hash, score, value);
	}

	inStopWords(word) {
		// console.log(stopwords);
		return stopwords.indexOf(word) >= 0;
	}

	zipNewsItem(item) {
		let fieldValueZip = [];
		for (const key of Object.keys(item)) {
			fieldValueZip.push(key)

			if (key === 'tags') {
				// console.log('ARRAY>>>>>>>>\n', item.tags, '\n\n');
				fieldValueZip.push(JSON.stringify(item.tags)); //TODO Hmm. Update this.
			} else {
				fieldValueZip.push(item[key] || "n/a"); //TODO Hmm. Update this.
			}

		}
		return fieldValueZip;
	}

	_dbAddItemToHash(item) {
		const hash = item.itemID;
		fieldValueZip = this.zipNewsItem(item);
		return this.DBResolve(this.store.hmset.bind(this.store), item,
			hash, ...fieldValueZip);
	}

	breakStringIntoTags(sentence) {
		var words = [];
		var re = /([\w+]+)/g;
		let result = '';

		return new Promise((resolve, reject) => {
			wordpos.getNouns(sentence, function(result) {
				// console.log(result);
				return resolve(result);
			});
		});
	}

	breakIntoTags(item) {
		return this.breakStringIntoTags(item.title).then((tokens) => {
			let ps = [];
			for (const word of tokens) {
				let w = word.toLowerCase();
				var pr = this._dbAddItemToSortedSet(item, w)
					.then((z) => {
						let w2 = word.toLowerCase();
						// console.log('w', w2);
						let c = this.DBResolve(this.store.zincrby.bind(this.store), item, storage_constants.COUNT, 1, w2)
						// console.log('adding', z, ' -- ', pr, w2, item.title, c);
						return c;
					});
				ps.push(pr);
			}
			return ps;
		});
	}

	createTagsFromItem(item) {
		const sw = this.inStopWords;
		return new Promise((resolve, reject) => {
			wordpos.getNouns(item.title || "", function(result) {
				const newResult = result.map(x => x.toLowerCase()).filter(x => !sw(x));
				// console.log('removed n words', result.length - newResult.length);
				return resolve(newResult);
			});
		});
	}

	// this.DBResolve(this.store.hmset.bind(this.store), item, hash, ...fieldValueZip);
	// this.DBResolve(this.store.zadd.bind(this.store), item, key, score, value);
	// this.DBResolve(this.store.zincrby.bind(this.store), item, constants.COUNT, 1, tag)

	add(item) {
		item.itemID = crypto.createHash('md5').update(item.guid).digest("hex");

		return this.store.exists(item.itemID, (err, reply) => {
			if (reply === 1) {
				// console.log('exists');
				return;
			} else {

				return this.createTagsFromItem(item)
					// Attach tags to item
					.then(tags => {
						item.tags = tags;//.map(x => x.toLowerCase());
						return item;
					})
					// Add News Item to DB
					.then(item => {
						return this.DBResolve(this.store.hmset.bind(this.store), item, item.itemID, ...this.zipNewsItem(item));
					})
					// Add tags to Database
					.then(item => {
						var tagPromises = [];
						const score = (new Date(item.date)).getTime();
						for (let i = 0; i < item.tags.length; i++) {
							let tag = item.tags[i];//.toLowerCase();
							let tp = this.DBResolve(this.store.zadd.bind(this.store), item, tag, score, item.itemID);
							tagPromises.push(tp)
						}
						let tpALL = this.DBResolve(this.store.zadd.bind(this.store), item, storage_constants.ALL, score, item.itemID);
						tagPromises.push(tpALL);
						return Promise.all(tagPromises).then(() => item)
					})
					// Increase counts of tags
					.then(item => {
						let tagPromises = [];
						for (let i = 0; i < item.tags.length; i++) {
							let tag = item.tags[i];//.toLowerCase();
							let tp = this.DBResolve(this.store.zincrby.bind(this.store), item, storage_constants.COUNT, 1, tag);
							tagPromises.push(tp)
						}
						return Promise.all(tagPromises).then(() => item)
					})
					.then(item => {
						// console.log('item done', item);
						return item;
					})
					.then(this.broadcastArticle.bind(this))
					.catch((err) => { console.log('ERROR:', err) });
			}
		});
	}

	getIndexInSortedSet(key, id) {
		console.log('getIndexInSortedSet', key, id);
		return new Promise((resolve, reject) => {
			this.store.zrank(key, id, (err, result) => {
				if (err) {
					return reject(err);
				} else {
					console.log('result of id', result);
					return resolve(result);
				}
			});
		});
	}

	getTopWords(n) {
		return new Promise((resolve, reject) => {
			this.store.zrevrange(storage_constants.COUNT, 0, n - 1, (err, result) => {
				if (err) {
					return reject(err);
				} else {
					return resolve(result);
				}
			});
		});
	}

	getSortedSet(id, num, fromIndex) {
		const startVal = fromIndex || 0;
		const stopVal = num ? (startVal + num - 1) : -1;

		// console.log(arguments);
		// console.log('start, stop:', startVal, stopVal);

		return new Promise((resolve, reject) => {
			this.store.zrange(id, startVal, stopVal, (err, result) => {
				if (err) {
					return reject(err);
				} else {
					return resolve(result);
				}
			});
		});
	}

	getHash(id) {
		return new Promise((resolve, reject) => {
			this.store.hgetall(id, (err, result) => {
				if (err) {
					return reject(err);
				} else {
					return resolve(result);
				}
			});
		});
	}

	getAllWithTag(tag, num) {
		return this.getSortedSet(tag, num)
			.then(idList => {
				let newsListPromises = [];
				for (const id of idList) {
					newsListPromises.push(this.getHash(id));
				}
				return Promise.all(newsListPromises);
			});
	}

	getAll(num) {
		return this.getAllWithTag(storage_constants.ALL, num);
	}

	getNAfterAllWithTag(tag, num, afterID) {
		return this.getIndexInSortedSet(tag, afterID)
			.then((index) => {
				return this.getSortedSet(tag, num, index + 1)
					.then(idList => {
						let newsListPromises = [];
						for (const id of idList) {
							newsListPromises.push(this.getHash(id));
						}
						return Promise.all(newsListPromises);
					});
			})
	}

	getNAfterAll(num, afterID) {
		return this.getNAfterAllWithTag(storage_constants.ALL, num, afterID);
	}
}
