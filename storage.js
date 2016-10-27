"use strict";

var redis = require("redis"),
	shortid = require('shortid');
    
module.exports = class Storage {
	constructor() {
		this.store = redis.createClient()
		this.store.on('connect', () => {console.log('Connected')})
		this.store.on("error", function (err) {
		    console.log(err)
		});
	}

	DBResolve(DBMethod, item, ...params) {
		return new Promise((resolve, reject) => {
			DBMethod(...params, (err, result) => {
				if (err) {
					return reject(err);
				}
				return resolve(item);
			});
		});
	}

	addItemToDBSortedSet(item, key) {
		const score = (new Date(item.date)).getTime();
		const member = item.itemID;

		return this.DBResolve(this.store.zadd.bind(this.store),	item,
							  key, score, member);

	}

	addItemToDBHash(item) {
		const hash = item.itemID;

		let fieldValueZip = [];
		for (const key of Object.keys(item)) {
			fieldValueZip.push(key)
			fieldValueZip.push(item[key] || "n/a"); //TODO Hmm. Update this.
		}

		return this.DBResolve(this.store.hmset.bind(this.store), item,
							  hash, ...fieldValueZip);
	}

	breakStringIntoTags(sentence) {
		var words = [];
		var re = /([\w+]+)/g;
		let result = '';
		while ((result = re.exec(sentence)) !== null) {
			words.push(result[0])
		}
		// console.log(words);
		return words;
	}

	breakIntoTags(item) {
		let ps = [];
		for (const word of this.breakStringIntoTags(item.title)) {
			ps.push(this.addItemToDBSortedSet(item, word.toLowerCase()));
		}
		return ps;
	}

	add(item) {
		item.itemID = shortid.generate();

		const masterTag = this.addItemToDBSortedSet(item, '_');
		const otherTags = this.breakIntoTags(item);

		return Promise.all([masterTag, ...otherTags])
			.then(values => {
				this.addItemToDBHash(values[0]);
			})
			.catch((err) => {console.log('ERROR:', err)})
	}

	getSortedSet(id) {
		return new Promise((resolve, reject) => {
			console.log
			this.store.zrange(id, 0, -1, (err, result) => {
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
			console.log
			this.store.hgetall(id, (err, result) => {
				if (err) {
					return reject(err);
				} else {
					return resolve(result);
				}
			});
		});
	}

	getAll() {
		return this.getSortedSet('_')
			.then(idList => {
				let newsListPromises = [];
				// console.log('idList', idList);
				for (const id of idList) {
					newsListPromises.push(this.getHash(id));
				}
				return Promise.all(newsListPromises);
			});
	}
}
