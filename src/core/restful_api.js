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

    // client class for the api.
    // creating a client instance takes client_params,
    // which is needed for when doing the actual calls.
    // 
    // client_params (Object):
    // - host (String) - will be used instead of hostname:port
    // - hostname (String)
    // - port (Number)
    // - path (String) - base path for the host
    //
    function Client(client_params) {
        this._restful_client_params = client_params;
    }

    // server class for the api.
    // 
    // methods (Object): map of function names to function(params).
    //
    // allow_missing_methods (String): 
    //    call with allow_missing_methods==='allow_missing_methods' to make the server 
    //    accept missing functions, the handler for missing functions will fail on runtime.
    //    useful for test servers.
    //
    function Server(methods, allow_missing_methods) {
        var me = this;
        if (allow_missing_methods) {
            assert.strictEqual(allow_missing_methods, 'allow_missing_methods');
        }
        me._impl = {};
        me._handlers = {};
        _.each(api.methods, function(func_info, func_name) {
            var func = methods[func_name];
            if (!func && allow_missing_methods) {
                func = function(params) {
                    return Q.reject({
                        data: 'Missing server impl of ' + func_name
                    });
                };
            }
            assert.strictEqual(typeof(func), 'function',
                'Missing server function ' + func_name);
            me._impl[func_name] = func;
            me._handlers[func_name] = create_server_handler(me, func, func_info);
        });
    }

    // install the server handlers to the given router.
    //
    // router (Object) - express/connect style app router with the following functions:
    // - get,post,put,delete which are function(path, handler).
    //
    // base_path (String) - optional base path for the routes.
    //
    Server.prototype.install_routes = function(router, base_path) {
        var me = this;
        _.each(api.methods, function(func_info, func_name) {
            var path = (base_path || '') + func_info.path;
            var handler = me._handlers[func_name];
            install_route(router, func_info.method, path, handler);
        });
    };

    // call to bypass the server routes
    Server.prototype.disable_routes = function() {
        this._disabled = true;
    };

    // call to start logging the server requests
    Server.prototype.set_logging = function() {
        this._log = console.log.bind(console);
    };


    // go over the api and check its validity

    var method_and_path_collide = {};

    _.each(api.methods, function(func_info, func_name) {
        func_info.name = func_name;

        assert(func_info.method in VALID_METHODS,
            'unexpected method: ' + func_info);

        assert.strictEqual(typeof(func_info.path), 'string',
            'unexpected path type: ' + func_info);

        func_info.path_items = _.map(func_info.path.split('/'), function(p) {
            assert(PATH_ITEM_RE.test(p),
                'invalid path item: ' + p + ' of ' + func_info);

            // if a normal path item, just return the string
            if (p[0] !== ':') {
                return p;
            }
            // if a param item (starts with colon) find the param info
            p = p.slice(1);
            var param = func_info.params[p];
            assert(param, 'missing param info: ' + p + ' of ' + func_info);
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

        // set the client class prototype functions
        Client.prototype[func_name] = function(params) {
            // resolve this._restful_client_params to use the client object
            return send_client_request(this._restful_client_params, func_info, params);
        };
    });

    // add the client and server classes to the api object
    api.Client = Client;
    api.Server = Server;

    return api;
}



// call a specific REST api function over http request.
function send_client_request(client_params, func_info, params) {
    return Q.when().then(function() {
        return create_client_request(client_params, func_info, params);
    }).then(function(options) {
        return send_http_request(options);
    }).then(function(res) {
        var reply = res.data;
        check_undefined_params(func_info.name, func_info.reply, reply);
        check_params_by_info(func_info.name, func_info.reply, reply, 'decode');
        return res;
    });
}


// create a REST api call and return the options for http request.
function create_client_request(client_params, func_info, params) {
    var method = func_info.method;
    var path = client_params.path || '';
    var data = _.clone(params);
    check_undefined_params(func_info.name, func_info.params, data);
    check_params_by_info(func_info.name, func_info.params, data, 'encode');
    _.each(func_info.path_items, function(p) {
        if (typeof(p) === 'string') {
            path += '/' + p;
        } else {
            assert(p.name in params, 'missing required path param: ' + p + ' of ' + func_info.name);
            path += '/' + data[p.name];
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
            if (res.statusCode !== 200) {
                defer.reject({
                    data: data
                });
            } else {
                defer.resolve({
                    response: res,
                    data: data,
                });
            }
        });
    });
    req.on('error', function(err) {
        defer.reject({
            data: err || 'unknown error'
        });
    });
    if (options.data) {
        req.write(options.data);
    }
    req.end();
    return defer.promise;
}




// return a route handler that calls the server function
function create_server_handler(server, func, func_info) {
    return function(req, res, next) {
        // marking _disabled on the server will bypass all the routes it has.
        if (server._disabled) {
            return next();
        }
        var log_func = server._log || function() {};
        Q.when().then(function() {
            check_req_params_by_info(func_info.name, func_info.params, req, 'decode');
            // server functions are expected to return a promise
            return func(req);
        }).then(function(reply) {
            log_func('COMPLETED', func_info.name);
            check_undefined_params(func_info.name, func_info.reply, reply);
            check_params_by_info(func_info.name, func_info.reply, reply, 'encode');
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
            log_func('ERROR', err);
            return next(err);
        });
    };
}


// install a route handler for the given router.
// see install_routes().
function install_route(router, method, path, handler) {
    // route_func points to the route functions router.get/post/put/delete
    var route_func = router[method.toLowerCase()];
    // call the route function to set the route handler
    route_func.call(router, path, handler);
}


function check_undefined_params(func_name, params_info, params) {
    _.each(params, function(value, name) {
        if (!(name in params_info)) {
            throw new Error('undefined api param: ' + name + ' of ' + func_name);
        }
    });
}

var TYPES = [{
    type: String,
    check: _.isString,
    encode: function(arg) {
        return String(arg);
    },
    decode: function(arg) {
        return String(arg);
    },
}, {
    type: Number,
    check: _.isNumber,
    encode: function(arg) {
        return Number(arg);
    },
    decode: function(arg) {
        return Number(arg);
    },
}, {
    type: Boolean,
    check: _.isBoolean,
    encode: function(arg) {
        return Boolean(arg);
    },
    decode: function(arg) {
        return Boolean(arg);
    },
}, {
    type: Date,
    check: _.isDate,
    encode: function(arg) {
        return arg.valueOf();
    },
    decode: function(arg) {
        return new Date(Number(arg));
    },
}, {
    type: RegExp,
    check: _.isRegExp,
    cast: function(arg) {
        return new RegExp(arg);
    },
    encode: function(arg) {
        return arg.toString();
    },
    decode: function(arg) {
        return new RegExp(arg);
    },
}, {
    type: Array,
    check: _.isArray,
    encode: function(arg) {
        return arg;
    },
    decode: function(arg) {
        return arg;
    },
}, {
    type: Object,
    check: _.isObject,
    encode: function(arg) {
        return arg;
    },
    decode: function(arg) {
        return Object(arg);
    },
}];

function check_params_by_info(func_name, params_info, params, coder_type) {
    _.each(params_info, function(param_info, name) {
        params[name] = check_param_by_info(func_name, name, param_info, params[name], coder_type);
    });
}

function check_req_params_by_info(func_name, params_info, req, coder_type) {
    req.restful_params = {};
    req.restful_param = function(name) {
        return req.restful_params[name];
    };
    _.each(params_info, function(param_info, name) {
        req.restful_params[name] = check_param_by_info(
            func_name, name, param_info,
            req.param(name), coder_type
        );
    });
}

function check_param_by_info(func_name, name, info, value, coder_type) {
    assert(!_.isUndefined(value) || !info.required,
        'missing required param: ' + name + ' of ' + func_name);
    var type = info.type || info;
    var t = _.findWhere(TYPES, {
        type: type
    });
    assert(t, 'unknown param type: ' + name + ' of ' + func_name);
    var result = t[coder_type].call(null, value);
    // console.log('TYPE RESULT', coder_type, func_name, name, t.type.name,
        // result.valueOf(), typeof(result), '(value=', value.valueOf(), ')');
    return result;
}
