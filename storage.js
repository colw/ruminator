"use strict";

const util = require('util');
var redis = require("redis"),
	crypto = require('crypto'),
	stopwords = require('./dict');

const pos = require('pos');

var WordPOS = require('wordpos'),
    wordpos = new WordPOS({stopwords: true});

function combineTags(acc, curVal, curIndex, arr) {
	if (curIndex === 0) {
		return [curVal];
	}

	let lastElement = acc[acc.length-1];
	if (lastElement[1] === curVal[1]) {
		lastElement[0] = lastElement[0] + ' ' + curVal[0];
		return acc;
	}

	return acc.concat([curVal]);
}

const stripTag = (elt) => elt[0];
const isTaggedStopWord = (elt) => stopwords.indexOf(elt[0].toLowerCase()) >= 0;

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

	createTagsFromItem(item) {
		const searchText = item.title + '. ' + item.description;
		// console.log(item.description);
		return new Promise((resolve, reject) => {

			const words = new pos.Lexer().lex(item.title);
			const tagger = new pos.Tagger();
			const taggedWords = tagger.tag(words);

			const reducedTaggedWords = taggedWords
				.reduce(combineTags, [])
				.filter(x => !isTaggedStopWord(x))
			resolve(reducedTaggedWords.map(stripTag).map(x => x.toLowerCase()));
		});
	}

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
