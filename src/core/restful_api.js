// this module is written for both nodejs, or for client with browserify.
'use strict';

var http = require('http');
var https = require('https');
var querystring = require('querystring');
var _ = require('underscore');
var Q = require('q');


module.exports = {

    // client

    setup_client: setup_client,
    init_client: init_client,

    // server

    setup_server: setup_server,
    init_server: init_server,

};


// setup a REST client.
//
// client_proto (Object): can be object or prototype that will be added all the api functions
//
// api (Object): 
// - each key is func_name (String)
// - each value is func_info (Object):
//   - method (String) - http method GET/POST/...
//   - path (Function) - function(params) that returns the path (String) for the call
//   - data (Function) - function(params) that returns the data (String|Buffer) for the call
//
function setup_client(client_proto, api) {
    // create all the api functions
    _.each(api, function(func_info, func_name) {
        client_proto[func_name] = function(params) {
            // resolve this._client_params to use the client object and not the .
            return send_client_request(this._client_params, func_name, func_info, params);
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
    client._client_params = client_params;
}


// setup a REST server.
// add routes for all the api functions to the server.
//
// app_router (Object) - express/connect style app router with the following functions:
// - get,post,put,delete which are function(path, handler).
//
// base_path (String) - the base path for the routes.
//
// api (Object) - see setup_client().
//
// server_impl (Object) - the implementation of the api functions,
// - keys are api function names and values are function(params) return promise.
// - _removed (Boolean) - specify that the server routes should call next as if they were removed.
// - _log (function) - a console.log like function to use for logging server calls.
//
function setup_server(app_router, base_path, api, server_impl) {
    // this checks that server_impl implements all the api.
    for (var func_name in api) {
        if (typeof(server_impl[func_name]) !== 'function') {
            throw new Error('Missing server impl function ' + func_name);
        }
    }
    // for each function in the api setup the server route handler
    _.each(api, function(func_info, func_name) {
        var path = base_path + func_info.path;
        // route_func will point to the route functions app_router.get/post/put/delete
        var method = func_info.method.toLowerCase();
        var route_func = app_router[method];
        // call the route function to set the route handler
        var handler = create_server_handler(server_impl, func_name, func_info);
        route_func.call(app_router, path, handler);
    });
}


// init_server will add the missing api functions with handlers 
// that throw exception when called. useful when creating a test server.
function init_server(api, server_impl) {
    _.each(api, function(v, k) {
        server_impl[k] = server_impl[k] || function(params) {
            return Q.reject({
                data: 'Missing server impl for ' + k
            });
        };
    });
}



// call a specific REST api function over http request.
function send_client_request(client_params, func_name, func_info, params) {
    return Q.when().then(function() {
        return create_client_request(client_params, func_name, func_info, params);
    }).then(function(options) {
        return send_http_request(options);
    });
}


// create a REST api call and return the options for http request.
function create_client_request(client_params, func_name, func_info, params) {
    var method = func_info.method;
    var data = _.clone(params);
    var path = client_params.path || '';
    var path_items = func_info.path.split('/');
    for (var i in path_items) {
        var p = path_items[i];
        if (p[0] === ':') {
            p = p.slice(1);
            if (p in params) {
                path += '/' + params[p];
                delete data[p];
            } else {
                path += '/null';
            }
        } else if (p) {
            path += '/' + p;
        }
    }
    if (!client_params._skip_api_params_validation) {
        for (i in data) {
            if (!is_accepting_param(i, func_info, path_items)) {
                throw new Error('passed undefined api param "' + i + '" to ' + func_name);
            }
        }
    }
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


// return a route handler that calls the server function
function create_server_handler(server_impl, func_name, func_info) {
    var func = server_impl[func_name];
    var path_items = func_info.path.split('/');
    return function(req, res, next) {
        // marking _removed on the server_impl will bypass all the routes it has.
        if (server_impl._removed) {
            return next();
        }
        if (server_impl._skip_api_params_validation) {
            req.restful_param = req.param.bind(req);
        } else {
            req.restful_param = function(param_name) {
                if (is_accepting_param(param_name, func_info, path_items)) {
                    return req.param(param_name);
                }
                throw new Error('requested undefined api param "' + param_name + '" to ' + func_name);
            };
        }
        // server functions are expected to return a promise
        Q.when().then(function() {
            return func(req);
        }).then(function(reply) {
            if (server_impl._log) {
                server_impl._log('COMPLETED', func_name);
            }
            return res.json(200, reply);
        }, function(err) {
            var status = err.status || err.statusCode;
            var data = err.data || err.message;
            if (server_impl._log) {
                server_impl._log(status === 200 ? 'COMPLETED' : 'FAILED', func_name, ':', err);
            }
            if (typeof status === 'number' &&
                status >= 100 &&
                status < 600
            ) {
                return res.json(status, data);
            } else {
                return res.json(500, err);
            }
        }).done(null, function(err) {
            return next(err);
        });
    };
}


function is_accepting_param(param_name, func_info, path_items) {
    if (param_name in func_info.params) {
        return true;
    }
    if (_.indexOf(path_items, ':' + param_name) >= 0) {
        return true;
    }
    return false;
}
