"use strict";

var striptags = require('striptags');

const URL = require('url');

function getBaseURL(link) {
  if (typeof link === "string") {
    let u = URL.parse(link);
    return u.protocol + '//' + u.hostname;    
  }
  return '';
}

function getHostname(link) {
  if (typeof link === "string") {
    let u = URL.parse(link);
    return u.hostname;    
  }
  return '';
} 

exports.makeArticle = function(article) {
  var newItem = {
    title: article.title,
    author: article.author,
    date: article.date ? new Date(article.date) : new Date(),
    guid: article.guid,
    link: article.link,
    metatitle: article.meta.title,
    metalink: article.meta.link,
    sitelink: getBaseURL(article.meta.link),
    sitehost: getHostname(article.meta.link),
  };

  if (article.description) {
    newItem.description = striptags(article.description);
  }

  if (article.image && article.image.url) {
    newItem.imageUrl = article.image.url;
  }

  if (newItem.metalink === null)
    newItem.metalink = newItem.link;

  if (newItem.date > new Date())
    newItem.date = new Date();

  return newItem;
}