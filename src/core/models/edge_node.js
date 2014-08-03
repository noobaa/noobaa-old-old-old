/* jshint node:true */
'use strict';

var mongoose = require('mongoose');
var Schema = mongoose.Schema;
var types = mongoose.Schema.Types;
var _ = require('underscore');


var edge_node_schema = new Schema({

    public_ip: String,

    // TODO

});

var EdgeNode = mongoose.model('EdgeNode', edge_node_schema);

module.exports = EdgeNode;
