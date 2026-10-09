'use strict';

var mongoose = require('mongoose');

var Schema = mongoose.Schema;
var ObjectId = Schema.ObjectId;

// The link a participant first arrived with in an active microworld: every
// name/value pair, including ones FISH doesn't know (the redirect at the end
// fills ${name} with them). Later visits use these values, whatever their own
// link says (see src/engine/participant-links.js). Kept as pairs, since
// parameter names may contain characters MongoDB doesn't allow in keys.
var participantLinkSchema = new Schema({
  microworld: { type: ObjectId, ref: 'Microworld', required: true },
  participant: { type: String, required: true },
  params: [{ _id: false, name: String, value: String }],
  createdAt: { type: Date, default: Date.now },
});

participantLinkSchema.index({ microworld: 1, participant: 1 }, { unique: true });

exports.ParticipantLink = mongoose.model('ParticipantLink', participantLinkSchema);
