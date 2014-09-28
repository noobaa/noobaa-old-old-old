/* jshint node:true */
'use strict';

var mongoose = require('mongoose');
var Device = require('./device');
var _ = require('underscore');
var bcrypt = require('bcrypt');

var providers = ['fb', 'google'];

var user_schema = new mongoose.Schema({
    fb: {}, // facebook profile
    google: {}, // google plus profile
    email: String, //this is used when the user updates a different email than the one in FB.
    password: String,
    name: String,
    email_verified: Boolean,
    email_policy: String, // silent
    email_last_notify_time: Date,
    last_access_time: Date,
    tz_offset: Number, // timezone minutes offset from utc
    usage: Number, // cached usage value
/*    
//    --all the UTM fields will be inserted using schema.add below based on the UTM array. 
*/
    quota: {
        type: Number,
        default: Math.pow(1024, 3)
    }, //default quota is 1GB for now
    alpha_tester: Boolean, // true to allow login to alpha testing
});

var utm_tracked_field = require('../../utils/utm.js').utm_tracked_field;
var d = {};
for (var i in utm_tracked_field) {
    d = {};
    d[utm_tracked_field[i]] = 'string';
    user_schema.add(d);
}

// create a unique index on the facebook id field
user_schema.index({
    'fb.id': 1
}, {
    unique: true,
    //sparse option explained:
    //since we might have users who logged in via google, they won't have the FB
    //http://docs.mongodb.org/manual/tutorial/create-a-unique-index/
    sparse: true,
});

user_schema.index({
    'google.id': 1
}, {
    unique: true,
    sparse: true, // sparse because the field is not required
});

user_schema.index({
    'email': 1
}, {
    unique: true,
    sparse: true, // sparse because the field is not required
});

user_schema.methods.get_property = function(key) {
    if (this[key]) {
        return this[key];
    }
    for (var i = 0; i < providers.length; i++) {
        var p = this[providers[i]];
        var v = p && p[key];
        if (v) {
            return v;
        }
    }
    return null;
};

user_schema.methods.get_email = function() {
    return this.get_property('email');
};

user_schema.methods.get_name = function() {
    return this.get_property('name');
};

user_schema.methods.get_first_name = function() {
    return this.get_name().split(" ")[0];
};

user_schema.methods.get_user_identity_info = function(object) {
    var user = this;
    object = object || {};
    object.id = user._id;
    object.name = user.get_name();
    object.first_name = user.get_first_name();
    providers.forEach(function(provider) {
        var p = user[provider];
        if (!!p) {
            object[provider + 'id'] = p.id;
        }
    });
    return object;
};

user_schema.methods.get_pic_url = function() {
    var user = this;
    if (user.fb && user.fb.id) {
        return 'https://graph.facebook.com/' + user.fb.id + '/picture';
    }
    if (user.google && user.google.id) {
        return 'https://plus.google.com/s2/photos/profile/' + user.google.id + '?sz=50';
    }
};

user_schema.methods.get_social_url = function() {
    var user = this;
    if (user.fb.id) {
        return 'http://facebook.com/profile.php?id=' + user.fb.id;
    }
    if (user.google.id) {
        return 'https://plus.google.com/' + user.google.id;
    }
};

// password verification - callback is function(err,is_matching)
user_schema.methods.verify_password = function(password, callback) {
    bcrypt.compare(password, this.password, callback);
};

// bcrypt middleware - replace passwords with hash before saving user
user_schema.pre('save', function(callback) {
    var user = this;
    if (!user.isModified('password')) {
        return callback();
    }
    bcrypt.genSalt(10, function(err, salt) {
        if (err) return callback(err);
        bcrypt.hash(user.password, salt, function(err, hash) {
            if (err) return callback(err);
            user.password = hash;
            return callback();
        });
    });
});


var User = mongoose.model('User', user_schema);
exports.User = User;