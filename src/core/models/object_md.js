/* jshint node:true */
'use strict';

var mongoose = require('mongoose');
var Schema = mongoose.Schema;
var types = mongoose.Schema.Types;
var _ = require('underscore');


var objmd_schema = new Schema({

    // namespace

    bucket: {
        type: types.ObjectId,
        ref: 'Bucket'
    },
    key: String,

    // storage mapping

    map: {
        type: types.ObjectId,
        ref: 'ObjectMap'
    },

    // attributes

    size: Number,
    create_time: {
        type: Date,
        default: Date.now
    },
});

objmd_schema.index({
    bucket: 1,
    key: 1,
}, {
    unique: true
});


var ObjectMD = mongoose.model('ObjectMD', objmd_schema);

module.exports = ObjectMD;
