'use strict';

exports.Fisher = function Fisher(name, type, params, o) {
  this.name = name;
  this.type = type;
  this.params = params;
  this.ocean = o;
  this.ready = this.type === 'bot';
  this.hasReturned = false;
  this.seasonData = [];

  this.startMoney = 0;
  this.money = 0;
  this.totalFishCaught = 0;
  this.status = 'At port';
  this.season = 0;

  this.isBot = function() {
    return this.type === 'bot';
  };

  this.isErratic = function() {
    return this.params.predictability === 'erratic';
  };

  this.getIntendedCatch = function() {
    return this.seasonData[this.season].catchIntent;
  };

  this.getFishCaught = function() {
    return this.seasonData[this.season].fishCaught;
  };

  this.getIntendedCasts = function() {
    return this.seasonData[this.season].intendedCasts;
  };

  this.getActualCasts = function() {
    return this.seasonData[this.season].actualCasts;
  };

  this.calculateSeasonGreed = function(currentSeason) {
    var baseGreed = this.params.greed;
    var greedSpread = this.params.greedSpread;
    var predictability = this.params.predictability;
    var trend = this.params.trend;

    var numSeasons = this.ocean.microworld.params.numSeasons;

    var currentGreed = baseGreed;
    var lowBound = baseGreed - greedSpread / 2;
    var highBound = baseGreed + greedSpread / 2;

    if (numSeasons > 1) {
      var increment = (highBound - lowBound) / (numSeasons - 1);

      if (trend === 'decrease') {
        currentGreed = highBound - increment * currentSeason;
      } else if (trend === 'increase') {
        currentGreed = lowBound + increment * currentSeason;
      }
    }

    if (predictability === 'erratic') {
      // variation between 0.75 and 1.25
      var variation = 1.0 + (Math.random() - 0.5) / 2.0;
      currentGreed = currentGreed * variation;
    }

    return currentGreed;
  };

  this.calculateSeasonCasts = function(greed) {
    var totalFish = this.ocean.certainFish + this.ocean.mysteryFish;
    var spawn = this.ocean.microworld.params.spawnFactor;
    var numFishers = this.ocean.fishers.length;
    var chanceCatch = this.ocean.microworld.params.chanceCatch;
    return Math.round((((totalFish - totalFish / spawn) / numFishers) * 2 * greed) / chanceCatch);
  };

  this.prepareFisherForSeason = function(season) {
    this.ocean.log.info('Preparing Fisher ' + this.name + ' for season ' + season);
    this.season = season;
    this.seasonData[season] = {
      actualCasts: 0,
      fishCaught: 0,
      startMoney: 0,
      endMoney: 0,
      catchIntent: season < 2 ? 'n/a' : this.seasonData[season-1].nextCatchIntent,
      nextCatchIntent: 'n/a',
    };

    if (this.isBot()) {
      var greed = this.calculateSeasonGreed(season);
      var intendedCasts = this.calculateSeasonCasts(greed);
      this.seasonData[season].greed = greed;
      this.seasonData[season].intendedCasts = intendedCasts;
    }
  
    this.hasReturned = false;
  };

  this.calculateBotCatchIntent = function(season) {
    var greed = this.calculateSeasonGreed(season);
    var intendedCasts = this.calculateSeasonCasts(greed);
    var chanceCatch = this.ocean.microworld.params.chanceCatch;
    var variation = 1.0 + (Math.random() - 0.5) / 2.0;  // actual +/- 25%
    return Math.round(intendedCasts * chanceCatch * variation);
  }

  this.maybeGetBotCatchIntent = function() {
    var data = this.seasonData[this.season];
    if (data.nextCatchIntent === '???') {
      if (this.ocean.seconds >= data.nextCatchIntentSubmitDelay) {
        this.recordIntendedCatch(this.calculateBotCatchIntent(this.season + 1));
      } 
    }
  }

  this.prepareToAskCatchIntent = function() {
    var data = this.seasonData[this.season];
    data.nextCatchIntent = '???';
    if (this.isBot()) {
      var duration = this.ocean.microworld.params.catchIntentDialogDuration;
      data.nextCatchIntentSubmitDelay = Math.trunc(Math.random() * duration);
      this.ocean.log.info('Bot fisher ' + this.name + ' will submit catch intent in ' + data.nextCatchIntentSubmitDelay + ' seconds.');
    }
  }

  this.changeMoney = function(amount) {
    this.money += amount;
    this.seasonData[this.season].endMoney += amount;
  };

  this.incrementCast = function() {
    this.seasonData[this.season].actualCasts++;
  };

  this.incrementFishCaught = function() {
    this.totalFishCaught++;
    this.seasonData[this.season].fishCaught++;
  };

  this.goToPort = function() {
    if (this.status !== 'At port') {
      this.status = 'At port';
      this.hasReturned = true;
      this.ocean.log.info('Fisher ' + this.name + ' returned to port.');
    }
  };

  this.goToSea = function() {
    this.status = 'At sea';
    this.changeMoney(-this.ocean.microworld.params.costDeparture);
    this.ocean.log.info('Fisher ' + this.name + ' sailed to sea.');
  };

  this.tryToFish = function() {
    this.changeMoney(-this.ocean.microworld.params.costCast);
    this.incrementCast();
    if (this.ocean.isSuccessfulCastAttempt()) {
      this.changeMoney(this.ocean.microworld.params.fishValue);
      this.incrementFishCaught();
      this.ocean.takeOneFish();
      this.ocean.log.info('Fisher ' + this.name + ' caught one fish.');
    } else {
      this.ocean.log.info('Fisher ' + this.name + ' tried to catch a fish, and failed.');
    }
  };

  this.recordIntendedCatch = function(numFish) {
    this.seasonData[this.season].nextCatchIntent = numFish;
    this.ocean.log.info('Fisher ' + this.name + ' is planning to catch ' + numFish + ' fish.');
  }

  this.runBot = function() {
    if (this.status === 'At sea') this.changeMoney(-this.ocean.microworld.params.costSecond);

    if (!this.isBot()) return;

    // Don't do anything if I'm erratic and I don't feel like it
    if (this.isErratic() && Math.random() > this.params.probAction) return;

    // Am I done?
    if (this.getIntendedCasts() <= this.getActualCasts()) {
      this.goToPort();
    } else {
      // Should I go out or try to fish?
      if (this.status === 'At port') {
        this.goToSea();
      } else if (this.status === 'At sea' && this.ocean.areThereFish()) {
        this.tryToFish();
      }
    }
  };
};
