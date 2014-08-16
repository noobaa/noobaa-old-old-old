// this module is written for both nodejs.
'use strict';

var _ = require('underscore');
var Q = require('q');
var restful_api = require('./restful_api');
var account_api = require('./account_api');
var Account = require('./models/account');


module.exports = new account_api.Server({
    create_account: create_account,
    read_account: read_account,
    update_account: update_account,
    delete_account: delete_account,
    authenticate: authenticate,
    logout: logout,
});


function create_account(req) {
    var info = {
        email: req.restful_param('email'),
        password: req.restful_param('password'),
    };
    return Account.create(info).then(function(account) {
        req.session.account_id = account.id;
    });
}

function read_account(req) {
    return Account.findById(req.session.account_id).exec().then(function(account) {
        if (!account) {
            throw new Error('NO ACCOUNT ' + req.session.account_id);
        }
        return {
            email: account.email,
        };
    });
}

function update_account(req) {
    var info = {
        email: req.restful_param('email'),
    };
    return Account.findByIdAndUpdate(req.session.account_id, info).exec().then(function() {
        return undefined;
    });
}


function delete_account(req) {
    return Account.findByIdAndRemove(req.session.account_id).exec().then(function() {
        return undefined;
    });
}

function authenticate(req) {
    var info = {
        email: req.restful_param('email'),
    };
    var password = req.restful_param('password');
    var account;
    return Account.findOne(info).exec().then(function(account_arg) {
        account = account_arg;
        return Q.npost(account, 'verify_password', [password]);
    }).then(function(matching) {
        if (!matching) {
            throw new Error('bad password');
        }
        req.session.account_id = account.id;
    });
}

function logout(req) {
    delete req.session.account_id;
}

