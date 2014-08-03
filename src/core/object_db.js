/* jshint node:true */
'use strict';

var mongoose = require('mongoose');
var types = mongoose.Schema.Types;
var _ = require('underscore');


var bucket_schema = new mongoose.Schema({
    name: String,
});

var objmd_schema = new mongoose.Schema({

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

var objmap_schema = new mongoose.Schema({
    ranges: [{
        // the range starting byte offset, and byte size
        offset: Number,
        size: Number,

        // for mapping to storage nodes, the logical range is divided 
        // into 'kwords'-data-words of equal size.
        // in order to support word copies and/or erasure coded words,
        // the schema contains a list of words such that each one has an index.
        // - words with (index < kwords) contain real data segment.
        // - words with (index >= kwords) contain a computed erasure coded segment.
        // the word list can contain words with the same index - 
        // which means they are keeping copies.
        kwords: Number,
        words: [{
            index: Number,

            // the storage node id that keeps this word 
            node: {
                type: types.ObjectId,
                ref: 'Node'
            },
            // the key dscribes how the node locates the data word
            key: String,
        }]
    }]
});


// indexes

objmd_schema.index({
    bucket: 1,
    key: 1,
}, {
    unique: true
});


var Bucket = mongoose.model('Bucket', bucket_schema);
var ObjectMD = mongoose.model('ObjectMD', objmd_schema);
var ObjectMap = mongoose.model('ObjectMap', objmap_schema);

module.exports = {
    Bucket: Bucket,
    ObjectMD: ObjectMD,
    ObjectMap: ObjectMap,
};
