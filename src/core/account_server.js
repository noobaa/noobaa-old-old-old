// this module is written for both nodejs.
'use strict';

var _ = require('underscore');
var Q = require('q');
var restful_api = require('./restful_api');
var account_api = require('./account_api');
var Account = require('./models/account');


module.exports = new account_api.Server({
    create_account: create_account,
    authenticate: authenticate,
    read_account: read_account,
    update_account: update_account,
    delete_account: delete_account,
});


function create_account(req) {
    var info = {
        email: req.restful_param('email'),
        password: req.restful_param('password'),
    };
    console.log('create_account', info);
    return Account.create(info).then(function(account) {
        console.log('create_account saved', account);
        return {
            auth_key: 'TODO-AUTH-KEY',
        };
    });
}

function authenticate(req) {
    var info = {
        email: req.restful_param('email'),
    };
    return Account.findOne(info).then(function(account) {
        return Q.npost(account, 'verify_password', [req.restful_param('password')]);
    }).then(function(matching) {
        if (!matching) {
            throw new Error('bad password');
        }
        return {
            auth_key: 'TODO-AUTH-KEY',
        };
    });
}

function read_account(req) {
    var info = {
        name: req.restful_param('account_id')
    };
    return Account.findOne(info);
}


function update_account(req) {
    var info = {
        name: req.restful_param('account_id')
    };
    var updates = _.pick(req.body); // no fields can be updated for now
    return Account.findOneAndUpdate(info, updates);
}


function delete_account(req) {
    var info = {
        name: req.restful_param('account_id')
    };
    return Account.findOneAndDelete(info);
}
