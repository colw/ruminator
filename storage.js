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

	breakIntoTags(item) {
		let ps = [];
		for (const word of item.title.split(' ')) {
			ps.push(this.addItemToDBSortedSet(item, word.toLowerCase()));
		}
		return ps;
	}

	addToMainIndex(item) {
		return this.addItemToDBHash(item);
	}

	add(item) {
		item.itemID = shortid.generate();

		const masterTag = this.addItemToDBSortedSet(item, '_');
		const otherTags = this.breakIntoTags(item);

		return Promise.all([masterTag, ...otherTags])
			.then(values => {
				this.addToMainIndex(values[0]);
			})
			.catch((err) => {console.log('ERROR:', err)})
	}
	
	get(id, cb) {
		this.store.get(id, (err, result) => {
			if (!err) {
				return cb(JSON.parse(result));
			}
			console.log('Err:', err);
		});
	}

	getAll(cb) {
		return true;
	}
}
