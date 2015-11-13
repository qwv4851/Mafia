var express = require('express');
var app = express();
var http = require('http').Server(app);
var io = require('socket.io')(http);

var bodyParser = require('body-parser');
var session = require('express-session');
var cookieParser = require('cookie-parser'); // the session is stored in a cookie, so we use this to parse it
var fs = require('fs'); // this engine requires the fs module

var game;
var sessionID = 0;
var gameOver = false;
var matchStarted = false;
var gameLoop = null;

function parseTime(time) {
  var re = /(\d+):(\d+)/;
  var m = re.exec(time);
  return parseInt(m[1]) * 60 + parseInt(m[2]);
}

function tallyVotes() {
  var highestVote = 0;
  var highestVoted = [];

  if (Object.keys(game.votes).length == 0) {
    for (var key in game.alive) {
      highestVoted.push(game.alive[key]);
    }
  } else {
    var tally = {};
    for (var key in game.votes) {
      var name = game.votes[key];
      if (tally[name] !== undefined) {
        tally[name] = tally[name] + 1;
      } else {
        tally[name] = 1;
      }
    }

    console.log("Tally:");
    for (var key in tally) {
      console.log(key + ": " + tally[key]);
    }

    for (var key in tally) {
      if (tally[key] > highestVote) {
        highestVote = tally[key];
        highestVoted = [key];
      } else if (tally[key] == highestVote) {
        highestVoted.push(key);
      }
    }
    console.log("Highest vote count: " + highestVote);
  }

  return highestVoted;
}

function initRound() {
  game.timeRemaining = game.settings.time;
  game.endTime = Math.floor(new Date().getTime() / 1000) + game.timeRemaining;

  console.log("Round Ends: " + game.endTime);
}

function endRound() {
  console.log("Ending round");
  var highestVoted = tallyVotes();
  game.votes = {};
  console.log("Highest voted: " + highestVoted);
  var playerToKill = highestVoted[Math.floor(Math.random()*highestVoted.length)];
  console.log("Killing: " + playerToKill);
  io.emit('kill_player', playerToKill);
  var playerIndex = game.alive.indexOf(playerToKill);
  game.alive.splice(playerIndex, 1);
  game.dead.push(playerToKill);
  console.log("Alive: " + game.alive);

  if (game.alive.length <= 1) {
    endGame();
  } else {
    initRound();
  }
}

function initMatch() {
  console.log('Initialzing match');
  gameOver = false;
  matchStarted = true;
  game.alive = game.users.slice(0); // clone users array

  io.emit('do_start_match');

  if (gameLoop) {
    clearInterval(gameLoop);
  }

  gameLoop = setInterval(function() {
    if (gameOver)
      return;

     var timeSeconds = Math.floor(new Date().getTime() / 1000);
     var timeRemaining = Math.max(0, game.endTime - timeSeconds);
     game.timeRemaining = timeRemaining;
     //console.log(timeRemaining);
     if (timeRemaining == 0) {
        endRound();
     }
  }, 1000);
}

function endGame() {
  if (game.alive.length > 0) {
    console.log("Player " + game.alive[0] + " wins!");
    io.emit('end_game', game.alive[0]);  
  } else {
    io.emit('end_game', "Nobody");  
  }
  gameOver = true;
  matchStarted = false;
}

app.engine('html', function (filePath, options, callback) { // define the template engine
  //console.log(filePath);
  fs.readFile(filePath, function (err, content) {
    if (err) return callback(new Error(err));
    // this is an extremely simple template engine
    var rendered = content.toString()
      .replace('#isHost#', options.isHost)
      .replace('#name#', (escape(options.name)))
      .replace('#display#', (escape(options.display)));
      console.log(options.display);
    var regex = new RegExp('#mode#', 'g');
    rendered = rendered.replace(regex, options.mode);
    return callback(null, rendered);
  })
});

app.use(bodyParser.urlencoded({ extended: false }));
app.use(express.static(__dirname + '/static'));
app.use(cookieParser());
app.use(session({
  secret: 'mafiamerlin69',
  resave: false,
  saveUninitialized: true
}));

app.set('views', './'); // specify the views directory
app.set('view engine', 'html'); // register the template engine

app.post('/waiting_host.html', function (req, res) {
  game = {settings: req.body, users: [], dead: [], votes: {}};
  //console.log(game.settings.time);
  game.settings.time = parseTime(game.settings.time);
  console.log("Round Time: " + game.settings.time);

  if (game.settings.modOnly) {
    res.render('waiting_host');  
  } else {
    res.render('enter_name', { isHost: true, display: "none" });  
  }
});

app.get('/', function (req, res) {
    res.render('index');
});

app.get('/enter_name', function (req, res) {
  console.log("enter_name");
    res.render('enter_name', { isHost: false, display: "none" });  
});

app.get('/game', function (req, res) {
  var name = req.session.name;
  console.log("Joining game: " + name);
  var mode = "Circle";
    res.render('game', { name: name, mode: mode});  
});

app.post('/waiting', function (req, res) {
  var name = req.body.name.substring(0, 12);

  if (game.users.indexOf(name) === -1) {
    game.users.push(name);
    req.session.name = name;
    console.log("Waiting: " + name);

      console.log(req.body);
    //console.log("Users: " + game.users);
    if (req.body.isHost == "true") {
      res.render('waiting_host', { name: name});  
    } else {
      res.render('waiting_user', { name: name});  
    }
  } else {
    res.render('enter_name', { isHost: false, display: "block" });  
  }

});

app.post('/', function (req, res) {
	console.log("post");
  console.log(req.body.host);
  res.render('index', { title: 'Hey', message: 'Hello there!'});
});

io.on('connection', function(socket){
  console.log('a user connected');

  // if (game && game.users) {
  //   io.emit('update_users', game.users, game.dead);
  // }

  socket.on('get_users', function() {
    console.log('get_users');
    io.emit('update_users', game.users, game.dead);
  });

  socket.on('start_match', function() {
    if (matchStarted) {
      console.log("Match already in progress");
    } else {
      initMatch();
      initRound();
    }
  });

  socket.on('init_game', function() {
    console.log('init_game Time remaining: ' + game.timeRemaining);
    socket.emit('init_game', game.timeRemaining - 1); // -1 second to account for latency
    socket.emit('update_users', game.users, game.dead);
  });

  socket.on('kill_select', function(player, target) {
    var lastRound = game.alive.length <= 2;
    if (lastRound || game.alive.indexOf(player) !== -1) {
      if (target == null) {
        console.log("Player " + player + " deselects");
        delete game.votes[player];
      } else {
        console.log("Player " + player + " selects " + target);
        game.votes[player] = target;
      }
      console.log(game.votes);

      var voterCount = lastRound ? game.users.length : game.alive.length;
      var voteCount = Object.keys(game.votes).length;
      console.log("Votes: (" + voteCount + "/" + voterCount + ")");
      if (voteCount === voterCount) {
        console.log("All votes locked in!");
        endRound();
      }
    } else {
      console.log("Illegal selection by player " + player);
    }

  });

});

http.listen(80); //the port you want to use