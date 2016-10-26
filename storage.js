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

	addItemToDBSortedSet(item, key) {
		return new Promise((resolve, reject) => {
			this.store.zadd(key, (new Date(item.date)).getTime(), item.itemID, (err, result) => {
				if (err) {
					console.log('rejected');
					return reject(err);
				} else {
					return resolve(item);
				}
			});
		});
	}

	breakIntoTags(item) {
		let ps = [];

		for (const word of item.title.split(' ')) {
			ps.push(this.addItemToDBSortedSet(item, word.toLowerCase()));
		}

		return ps;
	}

	addToMainIndex(item) {
		this.store.set(item.itemID, JSON.stringify(item));
		return item;
	}

	add(item) {
		item.itemID = shortid.generate();

		const masterTag = this.addItemToDBSortedSet(item, '_');
		const otherTags = this.breakIntoTags(item);

		let that = this;

		return Promise.all([masterTag, ...otherTags])
			.then(values => {
				this.addToMainIndex(values[0]);
			})
			.catch((err) => {console.log('ERROR:', err)})
	}
	
	get(id, cb) {
		this.store.get(id, (err, reply) => {
			if (!err) {
				return cb(JSON.parse(reply));
			}
			console.log('Err:', err);
		});
	}

	getAll(cb) {
		this.store.get()
	}
}