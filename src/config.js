var mongo = process.env.MONGO_HOST || 'localhost';
// MONGO_DB: another database, e.g. for a test copy of FISH on the same server
var dbName = process.env.MONGO_DB || 'fish';

module.exports = {
  db: {
    development: 'mongodb://' + mongo + '/' + dbName,
    production: 'mongodb://' + mongo + '/' + dbName,
    test: 'mongodb://' + mongo + '/fish-test',
  },
};
