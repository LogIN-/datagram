var datagram = require("./datagram").datagram;

var fs = require('fs');
// Setup basic express server
var express = require('express'),
    app = express(),
    server = require('http').createServer(app),
    io = require('socket.io')(server),
    port = 8082,
    clients = [],
    client_id,
    queue_count = 0;

server.listen(port, function () {
  console.log('Server listening at port %d', port);
});

// Routing
app.use(express.static(__dirname + '/public'));


var datagramDebug = function(data, addon){    
    
    if(addon !== null){
        clients[addon.addon].debug_count += 1;

        if(clients[addon.addon].debug_count < 100){
            var sock = clients[addon.addon].socket;
            sock.emit('console_output', { message: data });
        }
    }
    console.log(data);
};

var datagramProcessed = function (error, result) {
    datagramDebug('RESULTS:', null);

    if (result.options.DEFAULT_MODE === 'classify') {
        datagramDebug(JSON.stringify(result.classify.rating.basic, null, 2), result.options);
        //datagramDebug(result.classify.guess);
        datagramDebug('==> Your data probably belongs to: "' + result.classify.finalGuess + '" dataset!', result.options);
    } else if (result.options.DEFAULT_MODE === 'profilize') {
        datagramDebug(result.options.hash, null);
        datagramDebug(result.profilize, null);
    }
    if (error) {
        datagramDebug(error, null);
    }

};
var datagramDone = function () {
        queue_count -= 1;
    return false;
};

var generateUUID = function() {
    var d = new Date().getTime();
    var uuid = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        var r = (d + Math.random()*16)%16 | 0;
        d = Math.floor(d/16);
        return (c=='x' ? r : (r&0x7|0x8)).toString(16);
    });
    return uuid;
};

var avaliable_datasets = ['English', 'German', 'French', 'Polish', 'Italian', 'Croatian'];


var options = {
    DEFAULT_DATASETS: avaliable_datasets, //.,
    DEFAULT_DATASETS_DIR: './datagram/LM/',
    DEFAULT_DATASETS_EXT: '.lm',
    DEFAULT_INPUT: 'string', // string, file
    DEFAULT_MODE: 'classify', // classify, profilize
    debug: false,
    callback: function (error, result) {
        return new datagramProcessed(error, result);
    },
    onDrain: function () {
        return new datagramDone();
    },
    onDebug: function (data, addon) {
        return new datagramDebug(data, addon);
    }
};

var tc = new datagram(options);

// To make Dataset Profiles
//tc.queue(../samples/profilize/index.json);

//tc.queue(../datagram/samples/classify/cs.txt);
//tc.queue(../datagram/samples/classify/da.txt);
//tc.queue(../datagram/samples/classify/de.txt);
//tc.queue(../datagram/samples/classify/en.txt);
//tc.queue(../datagram/samples/classify/es.txt);

//tc.queue(../datagram/samples/classify/hu.txt);
//tc.queue(../datagram/samples/classify/it.txt);
//tc.queue(../datagram/samples/classify/sl.txt);

io.sockets.on('connection', function (socket) {

    // Register for private session
    socket.on("register", function(data) {
        // Create new Client
        client_id = generateUUID();

        clients[client_id] = {};
        clients[client_id].socket = socket;
        clients[client_id].requests_count = 0;

        clients[client_id].socket.emit('welcome', { message: 'Welcome to dataGram input analyzer! Please load some demo text and try to process it!', available_datasets: avaliable_datasets, guid:  client_id});

        clients[client_id].socket.emit('system', { message: 'You registered on system: ' + client_id});
        socket.broadcast.emit('system', { message: 'Another user registered on system: ' + client_id});

    });

    socket.on('process', function (data) {
        var actions = {};
        actions.message = 'CLEAR';
        clients[data.client_id].requests_count += 1;
        clients[data.client_id].debug_count = 0;  

        queue_count += 1;        
        clients[data.client_id].socket.emit('system', { message: 'Your request "' + clients[data.client_id].requests_count + '" is ' + queue_count + ' in queue!'}); 
        clients[data.client_id].socket.emit('actions', { message: actions });
        // Add data to queue   
        tc.queue(data.value, data.client_id);
    });

    // When socket disconnects, remove it from the list:
    //socket.on('disconnect', function() {
    //    console.log("DISCONNECTED");
    //    var index = clients.indexOf(socket);
    //    delete clients[index];
    //});

});

