/* jshint node:true */
'use strict';

var _ = require('lodash');
var Q = require('q');
var async = require('async');
var Device = require('../models/device').Device;
var User = require('../models/user').User;
var common_api = require('./common_api');

var DEVICE_STATE_FRAME_MS = parseInt(process.env.DEVICE_STATE_FRAME_MS, 10);
var DEVICE_HEARTBEAT_DELAY_MS = parseInt(process.env.DEVICE_HEARTBEAT_DELAY_MS, 10);

exports.device_reload = function(req, res) {
    return res.send({
        reload: true
    });
};

exports.update_session = function(req, res, next) {
    if (process.env.DEVICE_VERSION) {
        req.session.device_version = process.env.DEVICE_VERSION;
    }
    return next();
};


exports.device_heartbeat = function(req, res) {
    var params;
    var updates = {};
    var remote_ip;
    var user_id = (req.user && req.user.id) ? req.user.id.toString() : undefined;
    var device_detached = false;
    var coshare_space;

    // check version
    // reply immediately with reload if mismatching
    // the server's /planet/ route will update the session version once reloaded
    if (process.env.DEVICE_VERSION &&
        process.env.DEVICE_VERSION !== req.session.device_version) {
        console.log('DEVICE RELOAD VERSION',
            process.env.DEVICE_VERSION, req.session.device_version);
        return res.send({
            reload: true
        });
    }


    Q.fcall(function() {

        // prepare params
        params = _.pick(req.body,
            'name',
            'coshare_space',
            'srv_port',
            'host_info',
            'drives_info'
        );
        params.name = params.name || 'MyDevice';
        params.ip_address = req.get('X-Forwarded-For') || req.socket.remoteAddress;
        if (params.coshare_space) {
            if (typeof(params.coshare_space) !== 'number' ||
                params.coshare_space > 500 * 1024 * 1024 * 1024) {
                throw new Error('invalid coshare_space ' + params.coshare_space);
            }
        }
        console.log('hearbeat params:',
            'device_id', req.session.device_id,
            'user_id', user_id,
            _.omit(params, 'drives_info'));

        if (!req.session.device_id) {

            // no device_id in session - this is a fresh install

            return Q.fcall(function() {
                    if (!user_id) return;
                    // lookup the device by owner and name
                    var q = {
                        owner: user_id,
                        name: params.name,
                    };
                    return Q.when(Device.find(q).exec());
                })
                .then(function(devs) {
                    if (devs && devs.length) {
                        console.log('DEVICE FOUND FOR USER', user_id, 'count', devs.length);
                        return devs[0];
                    } else {
                        return do_create(params, user_id);
                    }
                })
                .then(function(dev) {
                    req.session.device_id = dev._id.toString();
                    return dev;
                });

        } else {

            // existing device_id in session
            // in this case we only expect an update for existing device
            // so find it by id and verify that it exists and with proper owner
            return Q.when(Device.findById(req.session.device_id).exec())
                .then(function(dev) {
                    if (!dev) {
                        console.error('DEVICE SESSION MISSING', req.session.device_id);
                        delete req.session.device_id;
                        throw new Error('device api error');
                    }
                    var owner = dev.owner ? dev.owner.toString() : undefined;
                    if (!owner && user_id) {
                        // we set the device owner once the user login's
                        // and sends first update on a device (still without owner)
                        updates.owner = user_id;
                    } else if (owner !== user_id) {
                        // in case a user with owned device has logged-out
                        // and another user logged-in then we will see this case
                        // and we just keep the device owner by initial user.
                        // this might need to be revised if it becomes a common case.
                        console.log('DEVICE DETACHED',
                            'owner', owner,
                            'device_id', dev._id,
                            'user', req.user);
                        device_detached = true;
                    }
                    return dev;
                });
        }

    }).then(function(dev) {

        return do_update(dev, params, updates).thenResolve(dev);

    }).then(function(dev) {

        if (device_detached) return;

        coshare_space = updates.coshare_space || dev.coshare_space;

        // TODO we assume here that there is single device per user for now
        if (user_id && updates.coshare_space) {
            return Q.when(
                User.update({
                    _id: user_id
                }, {
                    quota: updates.coshare_space
                }).exec());
        }

    }).then(function() {

        var reply = {
            delay: DEVICE_HEARTBEAT_DELAY_MS,
        };
        if (!device_detached) {
            reply.device_id = req.session.device_id;
            reply.coshare_space = coshare_space;
        }
        return reply;

    }).nodeify(common_api.reply_callback(
        req, res, 'DEVICE HEARTBEAT'));
};




function do_create(params, user_id) {
    // create a new device
    var new_dev = new Device({
        name: params.name,
        ip_address: params.ip_address,
        srv_port: params.srv_port || 0,
        coshare_space: params.coshare_space || 0,
        host_info: params.host_info,
        drives_info: params.drives_info,
        total_updates: 0,
        last_update: Date.now()
    });
    if (user_id) {
        new_dev.owner = user_id;
    }
    console.log('DEVICE CREATE', new_dev._id, 'owner', user_id);
    return Device.create(new_dev);
}


function do_update(dev, params, updates) {
    // prepare the change set assuming the update will be pushed
    var date = new Date();
    var update_keys = ['name', 'ip_address', 'srv_port', 'coshare_space'];
    _.each(update_keys, function(key) {
        if (params[key] && dev[key] !== params[key]) {
            updates[key] = params[key];
        }
    });
    if (params.host_info) updates.host_info = params.host_info;
    if (params.drives_info) updates.drives_info = params.drives_info;

    if (!dev.updates_stats.length) {
        add_new_stat(updates, date);
    } else {
        // check if the current update is close enough (1 hour diff)
        // to the last update record, and if so update
        // the last record instead of pushing new one.
        var last = dev.updates_stats.length - 1;
        var stat = dev.updates_stats[last];
        var start = stat.start.getTime();
        var end = stat.end.getTime();
        var curr = date.getTime();
        if (curr > end && curr > start && curr - start <= DEVICE_STATE_FRAME_MS) {
            // update count of last stat
            _.merge(updates, {
                $inc: {
                    total_updates: 1,
                },
                $set: {
                    last_update: date
                },
            });
            // update the last stat instead of adding
            updates.$set['updates_stats.' + last + '.end'] = date;
            updates.$inc['updates_stats.' + last + '.count'] = 1;
        } else {
            add_new_stat(updates, date);
        }
    }

    console.log('DEVICE UPDATE:', dev._id);
    return Q.when(dev.update(updates).exec());
}


function add_new_stat(updates, date) {
    _.merge(updates, {
        $inc: {
            total_updates: 1
        },
        $set: {
            last_update: date
        },
        $push: {
            updates_stats: {
                start: date,
                end: date,
                count: 1
            }
        }
    });
}
