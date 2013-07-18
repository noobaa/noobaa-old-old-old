var mongoose = require('mongoose');

var user_schema = new mongoose.Schema({
	// facebook info has free form
	fb: {},
});

// create a unique index on the facebook id field
user_schema.index({
	'fb.id': 1
}, {
	unique: true
});

var User = mongoose.model('User', user_schema);

exports.User = User;