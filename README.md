# News Aggregator

A simple news aggregator service.

News feeds are fetched periodically and stored in a Redis database.

Each item is also tagged using Natural language processing. This is a work in process.

## Usage

The API is simple:

Returns the first 30 articles over all tags, the top ten tags, and the current tag.

    /

Returns the first 30 articles of 'tag', the top ten tags, and the current tag.

    /items/tag

Returns the top ten tags.

    /tags

## Dependencies
- Thanks to [Feed Parser](https://github.com/danmactough/node-feedparser) for doing its job really well.
- [Socket.io](http://socket.io) is used for communicating with the browser [Currently Unused].
- [Pos-js](https://github.com/dariusk/pos-js) is used to parse the titles for classification.
Basic lexing and tagging, based on Eric Brill's part of speech tagger.

## Install and Run

You will need `node` and `npm` installed.

Clone the repository, install the necessary dependencies and run:

    git clone https://github.com/colw/ruminator.git
    cd ruminator
    npm install
    node app.js
