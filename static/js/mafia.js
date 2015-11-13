var socket;
var playerName;
var gameLoop;
var endTime;
var votingEnabled = true;
var roundTime;

function toMMSS(sec_num) {
    var minutes = Math.floor(sec_num / 60);
    var seconds = sec_num - (minutes * 60);

    if (minutes < 10) {minutes = "0"+minutes;}
    if (seconds < 10) {seconds = "0"+seconds;}
    var time    = minutes+':'+seconds;
    return time;
}

function deselectKill() {
    $(".kill").removeClass("kill").addClass("normal");
    $(".dead").removeClass("normal");
}

function selectPlayer(span) {
  deselectKill();
  span.removeClass("normal").addClass("kill");
}

function disableVote() {
  votingEnabled = false;
}

function enableVote() {
  votingEnabled = true;
}

function initSocket(name) {
  playerName = unescape(name);
  socket = io();
  socket.on('update_users', function(users, dead){
    var userListWrapper = $(".user_list_wrapper");
    userListWrapper.empty();
    $.each(users, function(i, user) {
      var span = $("<span/>").html(user);
      if (dead.indexOf(user) === -1) {
        span.addClass("normal");
      } else {
        span.addClass("dead");
      }
      userListWrapper.append(span).append(" ");
    });
    $('span:contains('+playerName+')').addClass("you");

    if ($(".mafia").length > 0) {
      $('.normal').click(function() {
        if (!votingEnabled || $(".you").hasClass("dead") && ($(".normal").length + $(".kill").length) > 2) {
          return; // Can't vote if you are dead and 2 or more people are alive
        }

        if ($(this).hasClass("normal")) {
          socket.emit("kill_select", playerName, $(this).text());
          selectPlayer($(this));
        } else if ($(this).hasClass("kill")) {
          $("span").removeClass("kill").addClass("normal");
          socket.emit("kill_select", playerName);
        }
      });

      socket.on('do_kill_select', function() {
        selectPlayer($('span:contains('+playerName+')'));
      });

      socket.on('kill_player', function(name) {
        name = unescape(name);
        $('span:contains('+name+')').removeClass("normal").removeClass("kill").addClass("dead");
         initRound();
      });
    }
  });
}

function initWait(name) {
  initSocket(name);

  socket.on('do_start_match', function(users){
    window.location.href = "game";
  });

  socket.emit('get_users');
}

function initRound() {
  deselectKill();
  var startTime = Math.floor(new Date().getTime() / 1000);
  endTime = startTime + roundTime;
  enableVote();
}

function updateGame() {
   var currentTime = Math.floor(new Date().getTime() / 1000);
   var timeRemaining = Math.max(0, endTime - currentTime);
   if (timeRemaining == 0) {
     disableVote();
   }

   var timerColor = timeRemaining <= 10 ? "#ff6666" : "#ffffff";
   $("#time").text(toMMSS(timeRemaining)).css("color", timerColor);
}

function initGame(name) {
  initSocket(name);

  socket.on('init_game', function(rt){
    roundTime = rt;
    initRound();
    gameLoop = setInterval(updateGame, 1000);
  });

  socket.on('end_game', function(winner){
    $('#mode').text(winner + ' wins!');
    clearInterval(gameLoop);
    setTimeout(function() {
      window.location.href = ".";
    }, 10000);
  });

  //socket.emit('get_users');
  socket.emit('init_game');
}

function startMatch() {
  if (socket)
    socket.emit('start_match');
}

$(document).ready(function() {
  $("#name_input").on('input',function(e) {
    $("#name_submit").prop('disabled', $(this).val().length == 0);
  });
});

