"use strict";

exports.makeArticle = function(article) {
  // console.log('-', article, '-');
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