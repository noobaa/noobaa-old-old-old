// this module is written for nodejs
'use strict';

var http = require('http');
var https = require('https');
var querystring = require('querystring');
var _ = require('underscore');
var Q = require('q');


module.exports = {
    setup: setup,
};


// setup server routes for all the api functions
//
// app_router (Object) - express/connect style app router

function setup(app_router, base_path, api, api_impl) {
    // this checks that api_impl has exactly all and no other handlers
    // as defined by the api object.
    if (!_.isEqual(_.keys(api), _.keys(api_impl))) {
        console.log('Mismatch between api and impl', api, api_impl);
        throw new Error('Mismatch between api and impl');
    }
    // for each function in the api setup the server route handler
    for (var api_func_name in api) {
        var api_func_info = api[api_func_name];
        var path = base_path + api_func_info.path;
        // route_func will point to the route functions app_router.get/post/put/delete
        var method = api_func_info.method.toLowerCase();
        var route_func = app_router[method];
        // call the route function to set the route handler
        var api_handler = create_api_handler(api_impl[api_func_name], api_func_name);
        route_func.call(app_router, path, api_handler);
    }
}

function create_api_handler(handler, name) {
    return function(req, res) {
        // merge all the params from the request. 
        // handles both POST/PUT body style, the GET style query, and the url path parameters.
        var params = _.extend({}, req.params, req.body, req.query);
        handler(params, function(err, reply) {
            if (err) {
                var status = err.status || err.statusCode;
                var data = err.data || err.message;
                console.log(status === 200 ? 'COMPLETED' : 'FAILED', name, ':', err);
                if (typeof status === 'number' &&
                    status >= 100 &&
                    status < 600
                ) {
                    return res.json(status, data);
                } else {
                    return res.json(500, err);
                }
            }
            console.log('COMPLETED', name);
            return res.json(200, reply);
        });
    };
}
