// this module is written for both nodejs.
'use strict';

var _ = require('underscore');
var Q = require('q');
var restful_api = require('./restful_api');
var account_api = require('./account_api');
var Account = require('./models/account');
var LinkedList = require('../utils/linked_list');

module.exports = new account_api.Server({
    login: login,
    logout: logout,
    create_account: create_account,
    read_account: read_account,
    update_account: update_account,
    delete_account: delete_account,
    // functions extending the api
    verify_account_session: verify_account_session
});


function login(req) {
    var info = {
        email: req.restful_params.email,
    };
    var password = req.restful_params.password;
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


function create_account(req) {
    var info = _.pick(req.restful_params, 'email', 'password');
    return Account.create(info).then(function(account) {
        req.session.account_id = account.id;
    });
}


function read_account(req) {
    return Q.fcall(verify_account_session, req).then(function() {
        return Account.findById(req.session.account_id).exec();
    }).then(function(account) {
        if (!account) {
            throw new Error('NO ACCOUNT ' + req.session.account_id);
        }
        return {
            email: account.email,
        };
    });
}


function update_account(req) {
    return Q.fcall(verify_account_session, req).then(function() {
        var info = _.pick(req.restful_params, 'email', 'password');
        return Account.findByIdAndUpdate(req.session.account_id, info).exec();
    }).then(function() {
        return undefined;
    });
}


function delete_account(req) {
    return Q.fcall(verify_account_session, req).then(function() {
        return Account.findByIdAndRemove(req.session.account_id).exec();
    }).then(function() {
        return undefined;
    });
}


var accounts_cache = {};
var accounts_lru = new LinkedList('accounts_lru');
var VALID_ACCOUNT_ENTRY_MS = 600000; // 10 minutes
var MAX_NUM_ACCOUNT_ENTRIES = 200;

// verify that the session has a valid account using a cache
// to be used by other servers
function verify_account_session(req) {
    return Q.fcall(function() {
        var account_id = req.session.account_id;
        if (!account_id) {
            throw new Error('NO ACCOUNT ' + account_id);
        }
        // check if present in cache
        var account_entry = accounts_cache[account_id];
        var now = Date.now();
        if (account_entry) {
            // if cached entry is still valid, move it to front and use it
            if (now < account_entry.time + VALID_ACCOUNT_ENTRY_MS) {
                accounts_lru.remove(account_entry);
                accounts_lru.push_front(account_entry);
                req.account = account_entry.account;
                return req.account;
            }
            // invalidate old entry
            accounts_lru.remove(account_entry);
            delete accounts_cache[account_id];
            account_entry = null;
        }

        // remove old entry by lru if too many entries
        if (accounts_lru.length > MAX_NUM_ACCOUNT_ENTRIES) {
            var popped_entry = accounts_lru.pop_back();
            delete accounts_cache[popped_entry.account.id];
        }

        // get the account from the database
        return Account.findById(account_id).exec().then(function(account) {
            if (!account) {
                throw new Error('MISSING ACCOUNT ' + account_id);
            }
            // insert to cache
            account_entry = {
                account: account,
                time: now,
            };
            accounts_cache[account_id] = account_entry;
            accounts_lru.push_front(account_entry);
            req.account = account_entry.account;
            console.log('ACCOUNT MISS', req.account.email);
            return req.account;
        });
    });
}
