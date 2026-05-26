'use strict';

var log = require('winston');
var OceanManager = require('./ocean-manager').OceanManager;

exports.engine = function engine(io, ioAdmin) {
  log.info('Starting engine');
  var om = new OceanManager(io, ioAdmin);

  io.sockets.on('connection', function(socket) {
    var clientOId;
    var clientPId;

    socket.on('enterOcean', function(mwId, pId, pParams) {
      clientPId = pId;
      clientOId = om.assignFisherToOcean(mwId, pId, pParams, enteredOcean);
    });

    var enteredOcean = function(newOId) {
      if (!newOId) {
        log.error('Failed to enter ocean - microworld not found or error occurred');
        socket.emit('joinError', { message: 'Unable to join simulation. The experiment may no longer be available.' });
        return;
      }

      var myOId = newOId;
      var myPId = clientPId;

      // Capture the previous socket ID before setFisherNotifier overwrites it
      var prevSocketId = om.oceans[myOId].getSocketId(myPId);

      socket.join(myOId);
      socket.emit('ocean', om.oceans[myOId].getParams());
      io.sockets.in(myOId).emit('lobbyStatus', om.oceans[myOId].getLobbyStatus());

      // Update ownership first so any incoming disconnect from the old socket
      // is recognised as stale before we tell it to go away
      om.oceans[myOId].setFisherNotifier(myPId, socket.id, function(event, data) {
        socket.emit(event, data);
      });

      // Now displace the previous socket (ownership already transferred above)
      if (prevSocketId && prevSocketId !== socket.id) {
        var prevSocket = io.sockets.connected[prevSocketId];
        if (prevSocket) {
          prevSocket.emit('displaced', {});
          prevSocket.leave(myOId);
          log.debug('Displaced stale socket ' + prevSocketId + ' for ' + myPId + ' from room ' + myOId);
        }
      }

      // Define handlers as named functions so we can remove them on disconnect
      // This prevents memory leaks from accumulated event listeners
      function onReadRules() {
        if (om.oceans[myOId]) {
          om.oceans[myOId].readRules(myPId);
          io.sockets.in(myOId).emit('aFisherIsReady', myPId);
          io.sockets.in(myOId).emit('lobbyStatus', om.oceans[myOId].getLobbyStatus());
        }
      }

      function onAttemptToFish() {
        if (om.oceans[myOId]) {
          om.oceans[myOId].attemptToFish(myPId);
        }
      }

      function onRecordIntendedCatch(numFish) {
        if (om.oceans[myOId]) {
          om.oceans[myOId].recordIntendedCatch(myPId, numFish);
        }
      }

      function onGoToSea() {
        if (om.oceans[myOId]) {
          om.oceans[myOId].goToSea(myPId);
        }
      }

      function onReturn() {
        if (om.oceans[myOId]) {
          om.oceans[myOId].returnToPort(myPId);
        }
      }

      function onRequestPause() {
        if (om.oceans[myOId]) {
          om.oceans[myOId].pause(myPId);
        }
      }

      function onRequestResume() {
        if (om.oceans[myOId]) {
          om.oceans[myOId].resume(myPId);
        }
      }

      function onKeepReading() {
        if (om.oceans[myOId]) {
          om.oceans[myOId].keepReading(myPId);
        }
      }

      function onProceedToLobby() {
        if (om.oceans[myOId]) {
          om.oceans[myOId].readRules(myPId);
          io.sockets.in(myOId).emit('aFisherIsReady', myPId);
          io.sockets.in(myOId).emit('lobbyStatus', om.oceans[myOId].getLobbyStatus());
        }
      }

      function onKeepWaiting() {
        if (om.oceans[myOId]) {
          om.oceans[myOId].keepWaiting(myPId);
        }
      }

      function onAbortFish() {
        if (om.oceans[myOId]) {
          om.oceans[myOId].clearAllAbortTimers(myPId);
          om.oceans[myOId].log.info('Fisher ' + myPId + ' aborted session.');
        }
      }

      function onDisconnect() {
        // Clean up all event listeners first to prevent memory leaks
        socket.off('readRules', onReadRules);
        socket.off('attemptToFish', onAttemptToFish);
        socket.off('recordIntendedCatch', onRecordIntendedCatch);
        socket.off('goToSea', onGoToSea);
        socket.off('return', onReturn);
        socket.off('requestPause', onRequestPause);
        socket.off('requestResume', onRequestResume);
        socket.off('keepReading', onKeepReading);
        socket.off('proceedToLobby', onProceedToLobby);
        socket.off('keepWaiting', onKeepWaiting);
        socket.off('abortFish', onAbortFish);
        socket.off('disconnect', onDisconnect);

        // Check if ocean still exists before accessing its properties
        if (om.oceans[myOId] && !om.oceans[myOId].isInSetup() && !om.oceans[myOId].isRemovable()) {
          // disconnected before ocean i.e before simulation run has finished
          // and setup phase is completed
          var ocean = om.oceans[myOId];
          var simulationData = ocean.grabSimulationData();
          // replace participants gotten by calling grabSimulationData with the one currently disconnecting
          simulationData.participants = [myPId];
          ioAdmin.in(ocean.microworld.experimenter._id.toString()).emit('simulationInterrupt', simulationData);
        }

        // Only try to remove fisher if ocean still exists and this socket is still the active one
        if (om.oceans[myOId]) {
          if (!om.oceans[myOId].isCurrentSocket(myPId, socket.id)) {
            log.debug('Stale socket disconnect for ' + myPId + ' in ocean ' + myOId + ' — skipping removal');
          } else {
            om.removeFisherFromOcean(myOId, myPId);
            if (om.oceans[myOId] && om.oceans[myOId].isInSetup()) {
              io.sockets.in(myOId).emit('lobbyStatus', om.oceans[myOId].getLobbyStatus());
            }
          }
        } else {
          log.debug('Disconnect event for participant ' + myPId + ' but ocean ' + myOId + ' no longer exists');
        }

        log.debug('Cleaned up socket handlers for participant ' + myPId);
      }

      // Register all event handlers
      socket.on('readRules', onReadRules);
      socket.on('attemptToFish', onAttemptToFish);
      socket.on('recordIntendedCatch', onRecordIntendedCatch);
      socket.on('goToSea', onGoToSea);
      socket.on('return', onReturn);
      socket.on('requestPause', onRequestPause);
      socket.on('requestResume', onRequestResume);
      socket.on('keepReading', onKeepReading);
      socket.on('proceedToLobby', onProceedToLobby);
      socket.on('keepWaiting', onKeepWaiting);
      socket.on('abortFish', onAbortFish);
      socket.on('disconnect', onDisconnect);
    };
  });

  ioAdmin.on('connection', function(socket) {
    var expId;

    socket.on('enterDashboard', function(experimenterId) {
      expId = experimenterId;
      log.info('Experimenter ' + expId + ' is viewing dashboard');
      socket.join(expId);
      socket.emit('currentRunningSimulations', om.trackedSimulations);
    });

    socket.on('disconnect', function() {
      log.info('Experimenter ' + expId + ' disconnected from dashboard');
    });
  });
};
