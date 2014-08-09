// this module is written for both nodejs, or for client with browserify.
'use strict';

var http = require('http');
var https = require('https');
var querystring = require('querystring');
var _ = require('underscore');
var Q = require('q');
var assert = require('assert');


module.exports = {

    define_api: define_api,

    // client

    setup_client: setup_client,
    init_client: init_client,

    // server

    setup_server: setup_server,
    init_server: init_server,

};


var VALID_METHODS = {
    GET: 1,
    PUT: 1,
    POST: 1,
    DELETE: 1
};
var PATH_ITEM_RE = /^\S*$/;


// Check and initialize the api structure.
//
// api (Object): 
// - each key is func_name (String)
// - each value is func_info (Object):
//   - method (String) - http method GET/POST/...
//   - path (Function) - function(params) that returns the path (String) for the call
//   - data (Function) - function(params) that returns the data (String|Buffer) for the call
//
function define_api(api) {
    var method_and_path_collide = {};

    _.each(api, function(func_info, func_name) {
        func_info.name = func_name;

        assert(func_info.method in VALID_METHODS,
            'unexpected method: ' + func_info);

        assert.strictEqual(typeof(func_info.path), 'string',
            'unexpected path type: ' + func_info);

        func_info.path_items = _.map(func_info.path.split('/'), function(p) {
            assert(PATH_ITEM_RE.test(p),
                'invalid path item: ' + p + ' for ' + func_info);

            // if a normal path item, just return the string
            if (p[0] !== ':') {
                return p;
            }
            // if a param item (starts with colon) find the param info
            p = p.slice(1);
            var param = func_info.params[p];
            assert(param, 'missing param info: ' + p + ' for ' + func_info);
            return {
                name: p,
                param: param,
            };
        });

        // test for colliding method+path
        var method_and_path = func_info.method + func_info.path;
        var collision = method_and_path_collide[method_and_path];
        assert(!collision, 'collision of method+path: ' + func_info.name + ' ~ ' + collision);
        method_and_path_collide[method_and_path] = func_info.name;
    });

    return api;
}


// setup a REST client.
//
// client_proto (Object): can be object or prototype that will be added all the api functions
//
// api (Object): see define_api()
//
function setup_client(client_proto, api) {
    // create all the api functions
    _.each(api, function(func_info, func_name) {
        client_proto[func_name] = function(params) {
            // resolve this._restful_client_params to use the client object and not the .
            return send_client_request(this._restful_client_params, func_info, params);
        };
    });
}

// setting the client_params as a property of the client,
// which is needed for when doing the actual calls
// 
// client_params (Object):
// - host (String) - will be used instead of hostname:port
// - hostname (String)
// - port (Number)
// - path (String) - base path for the host
//
function init_client(client, client_params) {
    client._restful_client_params = client_params;
}


// call a specific REST api function over http request.
function send_client_request(client_params, func_info, params) {
    return Q.when().then(function() {
        return create_client_request(client_params, func_info, params);
    }).then(function(options) {
        return send_http_request(options);
    });
}


// create a REST api call and return the options for http request.
function create_client_request(client_params, func_info, params) {
    var method = func_info.method;
    var data = _.clone(params);
    var path = client_params.path || '';
    check_undefined_params(func_info, params);
    check_missing_params(func_info, params);
    _.each(func_info.path_items, function(p) {
        if (typeof(p) === 'string') {
            path += '/' + p;
        } else {
            assert(p.name in params, 'missing required path param: ' + p + ' to ' + func_info.name);
            path += '/' + params[p.name];
            delete data[p.name];
        }
    });
    var headers = {};
    if (method === 'POST' || method === 'PUT') {
        // send data in request body encoded as json
        headers['content-type'] = 'application/json';
        data = JSON.stringify(data);
    } else {
        // send data in path query, encoded as querystring
        path += '?' + querystring.stringify(data);
        data = null;
    }
    return {
        host: client_params.host,
        hostname: client_params.hostname,
        port: client_params.port,
        method: method,
        path: path,
        headers: headers,
        data: data,
    };
}


// send http request and return a promise for the response
function send_http_request(options) {
    var defer = Q.defer();
    // TODO what to do to support https?
    var req = http.request(options, function(res) {
        var data = '';
        res.setEncoding('utf8');
        res.on('data', function(chunk) {
            data += chunk;
        });
        res.on('end', function() {
            if (res.headers['content-type'] === 'application/json') {
                data = JSON.parse(data);
            }
            var api_res = {
                response: res,
                data: data,
            };
            if (res.statusCode !== 200) {
                defer.reject(api_res);
            } else {
                defer.resolve(api_res);
            }
        });
    });
    req.on('error', function(err) {
        defer.reject(err || 'unknown error');
    });
    if (options.data) {
        req.write(options.data);
    }
    req.end();
    return defer.promise;
}





// setup a REST server.
// add routes for all the api functions to the server.
//
// api (Object) - see define_api().
//
// server (Object) - the implementation of the api functions,
// - keys are api function names and values are function(params) return promise.
// - _removed (Boolean) - specify that the server routes should call next as if they were removed.
// - _log (function) - a console.log like function to use for logging server calls.
//
function setup_server(api, server) {
    server.router = server_router.bind(null, api, server);
    return server;
}


// router (Object) - express/connect style app router with the following functions:
// - get,post,put,delete which are function(path, handler).
//
// base_path (String) - the base path for the routes.
//
function server_router(api, server, router, base_path) {
    _.each(api, function(func_info, func_name) {
        var path = (base_path || '') + func_info.path;
        var method = func_info.method.toLowerCase();
        // route_func points to the route functions router.get/post/put/delete
        var route_func = router[method];
        var handler = create_server_handler(server, func_info);
        // call the route function to set the route handler
        route_func.call(router, path, handler);
    });
    return router;
}


// init_server will add the missing api functions with handlers 
// that throw exception when called. useful when creating a test server.
function init_server(api, server) {
    _.each(api, function(func_info, func_name) {
        server[func_name] = server[func_name] || function(params) {
            return Q.reject({
                data: 'Missing server impl for ' + func_name
            });
        };
    });
    return server;
}


// return a route handler that calls the server function
function create_server_handler(server, func_info) {
    var func = server[func_info.name];
    assert.strictEqual(typeof(func), 'function',
        'Missing server function ' + func_info);
    return function(req, res, next) {
        // marking _removed on the server will bypass all the routes it has.
        if (server._removed) {
            return next();
        }
        var log_func = server._log || function() {};
        check_missing_req_params(func_info, req);
        req.restful_param = function(param_name) {
            if (!(param_name in func_info.params)) {
                throw new Error('requested undefined api param "' + param_name + '" to ' + func_info.name);
            }
            return req.param(param_name);
        };
        // server functions are expected to return a promise
        Q.when().then(function() {
            return func(req);
        }).then(function(reply) {
            log_func('COMPLETED', func_info.name);
            return res.json(200, reply);
        }, function(err) {
            var status = err.status || err.statusCode;
            var data = err.data || err.message || err.toString();
            log_func(status === 200 ? 'COMPLETED' : 'FAILED', func_info.name, ':', err);
            if (typeof status === 'number' &&
                status >= 100 &&
                status < 600
            ) {
                return res.json(status, data);
            } else {
                return res.json(500, data);
            }
        }).done(null, function(err) {
            return next(err);
        });
    };
}


function check_undefined_params(func_info, params) {
    _.each(params, function(value, name) {
        if (!(name in func_info.params)) {
            throw new Error('undefined api param: ' + name + ' to ' + func_info.name);
        }
    });
}

function check_missing_params(func_info, params) {
    _.each(func_info.params, function(param_info, name) {
        if (param_info.required && !(name in params)) {
            throw new Error('missing required param: ' + name + ' to ' + func_info.name);
        }
    });
}

function check_missing_req_params(func_info, req) {
    _.each(func_info.params, function(param_info, name) {
        if (param_info.required && !req.param(name)) {
            throw new Error('missing required param: ' + name + ' to ' + func_info.name);
        }
    });
}
