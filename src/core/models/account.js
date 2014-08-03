/* jshint node:true */
'use strict';

var mongoose = require('mongoose');
var Schema = mongoose.Schema;
var types = mongoose.Schema.Types;
var _ = require('underscore');


var account_schema = new Schema({
    name: String,
});

account_schema.index({
    name: 1,
}, {
    unique: true
});

var Account = mongoose.model('Account', account_schema);

module.exports = Account;
