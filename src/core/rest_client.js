// this module is written for both nodejs, or for client with browserify.
'use strict';

var http = require('http');
var https = require('https');
var querystring = require('querystring');
var _ = require('underscore');
var Q = require('q');


module.exports = {
    setup: setup,
    init: init,
    create_api_func: create_api_func,
    call_api_func: call_api_func,
    create_request: create_request,
    send_http: send_http,
};


// setup a REST client.
//
// client_proto (Object): can be object or prototype that will be added all the api functions
//
// api (Object): each key is an api func name
//   each value is an Object:
//   - method (String) - http method
//   - path (Function) - function(params) that returns the path (String) for the call
//   - data (Function) - function(params) that returns the data (String|Buffer) for the call
//
function setup(client_proto, api) {
    // create all the api functions
    for (var api_func_name in api) {
        var api_func_info = api[api_func_name];
        client_proto[api_func_name] = create_api_func(api_func_info);
    }
}

// setting the client_params as a property of the client,
// which is needed for when doing the actual calls
// 
// client_params (Object):
// - host (String) - will be used instead of hostname:port
// - hostname (String)
// - port (Number)
// - path (String) - base path for the host
function init(client, client_params) {
    client._client_params = client_params;
}

// create a function that calls an api function.
//
// api_func_info (Object): see create_request()
//
// return function(params)
//
function create_api_func(api_func_info) {
    return function(params) {
        // resolve this._client_params to use the client object and not the .
        return call_api_func(this._client_params, api_func_info, params);
    };
}


// call a specific REST api function over http request.
// 
// client_params (Object): see create_request()
// api_func_info (Object): see create_request()
// params (Object): see create_request()
//
// return (Promise for Object):
//   - response (Object) - the http response object
//   - data (String|Object) - the http response data body.
//
function call_api_func(client_params, api_func_info, params) {
    return Q.when().then(function() {
        return create_request(client_params, api_func_info, params);
    }).then(function(options) {
        return send_http(options);
    });
}


// create a REST api call and return the options for http request.
//
// client_params (Object):
// - host (String) - will be used instead of hostname:port
// - hostname (String)
// - port (Number)
// - path (String) - base path for the host
//
// api_func_info (Object):
//   TODO
//
// params (Object):
//   TODO
//
function create_request(client_params, api_func_info, params) {
    var method = api_func_info.method;
    var data = _.clone(params);
    var path = client_params.path || '';
    var path_items = api_func_info.path.split('/');
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
function send_http(options) {
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
