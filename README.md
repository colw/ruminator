# News Aggregator

A simple news aggregator in the browser.

News feeds are fetched periodically and if the date of the article is a recent one, it is sent to the users.

Additionally, as an experiment, the most popular words are counted and displayed.

- [Node.js](http://nodejs.org) runs the server and periodically checks and parses feeds.
- Thanks to [Feed Parser](https://github.com/danmactough/node-feedparser) for doing its job really well.
- [Socket.io](http://socket.io) is used for communicating with the browser.

## Install and Run

You will need `node` and `npm` installed.

Clone the repository, install the necessary dependencies and run:

    git clone https://github.com/colw/ruminator.git
    cd ruminator
    npm install
    node app.js

Go to [http://localhost:5000](http://localhost:5000) to view it.


    
    
